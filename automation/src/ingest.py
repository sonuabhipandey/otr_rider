"""Upload a combined CSV to the rider dashboard (replaces the old src/uploader.py).

Flow: gzip the CSV -> POST /api/automation/upload-url -> PUT the file straight to Supabase Storage
-> POST /api/automation/process -> summary. The file never passes through a Vercel function body
(Vercel caps those at 4.5 MB), and re-sending a day never creates duplicates: the dashboard upserts.

Reads dashboard.base_url and dashboard.upload_key from config.yaml.
"""

import gzip
import time
from pathlib import Path
from typing import Callable

import requests

RETRIES = 3
BACKOFF_SECONDS = (5, 15, 45)
RETRY_STATUSES = {429, 500, 502, 503, 504}


class IngestError(Exception):
    pass


def _settings(config: dict) -> tuple[str, str]:
    dashboard = config.get("dashboard") or {}
    base_url = (dashboard.get("base_url") or "").rstrip("/")
    key = dashboard.get("upload_key") or ""
    if not base_url or not key:
        raise IngestError("dashboard.base_url and dashboard.upload_key must be set in config.yaml")
    return base_url, key


def _with_retries(what: str, send: Callable[[], requests.Response], log: Callable[[str], None]) -> requests.Response:
    """Retry network errors and 429/5xx up to RETRIES times with backoff. Other statuses return as-is."""
    last_error = ""
    for attempt in range(RETRIES + 1):
        try:
            response = send()
            if response.status_code not in RETRY_STATUSES:
                return response
            last_error = f"HTTP {response.status_code}: {response.text[:300]}"
        except (requests.ConnectionError, requests.Timeout) as e:
            last_error = f"{type(e).__name__}: {e}"
        if attempt < RETRIES:
            wait = BACKOFF_SECONDS[attempt]
            log(f"  {what} failed ({last_error}); retrying in {wait}s ({attempt + 1}/{RETRIES})")
            time.sleep(wait)
    raise IngestError(f"{what} failed after {RETRIES} retries: {last_error}")


def upload_csv(csv_path: Path, config: dict, log: Callable[[str], None] = print) -> dict:
    """Upload one combined CSV and return the dashboard's processing summary."""
    base_url, key = _settings(config)
    auth = {"Authorization": f"Bearer {key}"}

    raw = csv_path.read_bytes()
    body = gzip.compress(raw)
    log(f"  gzipped {len(raw) / 1048576:.1f} MB -> {len(body) / 1048576:.1f} MB")

    # 1. Ask for an upload slot
    r = _with_retries(
        "upload-url",
        lambda: requests.post(f"{base_url}/api/automation/upload-url", json={"file_name": csv_path.name}, headers=auth, timeout=60),
        log,
    )
    if r.status_code == 401:
        raise IngestError("Dashboard rejected the upload key (401). Check dashboard.upload_key in config.yaml.")
    if r.status_code != 200:
        raise IngestError(f"upload-url failed ({r.status_code}): {r.text[:300]}")
    slot = r.json()
    upload_id, signed_url = slot["upload_id"], slot["signed_upload_url"]

    # 2. Send the file straight to storage. 409 on a retry means the first PUT already landed.
    r = _with_retries(
        "file upload",
        lambda: requests.put(signed_url, data=body, headers={"Content-Type": "application/gzip"}, timeout=300),
        log,
    )
    if r.status_code not in (200, 201, 409):
        raise IngestError(f"file upload failed ({r.status_code}): {r.text[:300]}")

    # 3. Process. If a retry finds the upload already processed, the first attempt succeeded.
    r = _with_retries(
        "process",
        lambda: requests.post(f"{base_url}/api/automation/process", json={"upload_id": upload_id}, headers=auth, timeout=300),
        log,
    )
    summary = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
    if r.status_code == 422 and "already done" in str(summary.get("error", "")):
        return {"upload_id": upload_id, "status": "done", "note": "processed on an earlier attempt"}
    if r.status_code != 200 or summary.get("status") != "done":
        raise IngestError(f"processing failed ({r.status_code}): {summary.get('error') or r.text[:300]}")
    return summary


def check_count(date_str: str, config: dict) -> int:
    """Orders the dashboard holds whose Created At falls on this calendar date (IST)."""
    base_url, key = _settings(config)
    r = requests.get(
        f"{base_url}/api/automation/check",
        params={"date": date_str},
        headers={"Authorization": f"Bearer {key}"},
        timeout=60,
    )
    if r.status_code != 200:
        raise IngestError(f"check failed ({r.status_code}): {r.text[:300]}")
    return int(r.json().get("count", 0))
