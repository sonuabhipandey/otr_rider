"""Pull LoadShare control-tower orders and send them to the rider dashboard.

  python run.py                                   # today
  python run.py --date 2026-10-15                 # one day
  python run.py --from 2026-10-13 --to 2026-10-15 # backfill a range (one failed day doesn't stop the rest)
  python run.py --no-upload                       # export + combine only
  python run.py --headless                        # no visible browser (OTP then only via auth/otp_input.txt)

For each date: ensure_logged_in -> export_orders -> combine_batches into downloads/combined_<date>.csv
-> upload (src/ingest.py). Output is also written to logs/run_<today>.log.
Exit code: 0 if every date succeeded, 1 otherwise.
"""

import argparse
import datetime as dt
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

from src.auth import SessionExpiredError, SessionExpiredMidRun, ensure_logged_in
from src.combine import combine_batches
from src.config import DOWNLOADS_DIR, PROJECT_ROOT, SESSION_STATE_PATH, load_config
from src.ingest import IngestError, upload_csv
from src.scraper import export_orders

ALL_STORES = {"TNE6", "TDE2", "TNE3", "TDE5", "TND7", "TDE1", "TDI6", "TND9", "TNE5", "TNE4", "TDO2"}
LOGS_DIR = PROJECT_ROOT / "logs"
MAX_RANGE_DAYS = 120


class Tee:
    """Mirror stdout/stderr into the log file so scheduled runs leave a record."""

    def __init__(self, stream, log_file):
        self.stream, self.log_file = stream, log_file

    def write(self, text):
        self.stream.write(text)
        self.log_file.write(text)
        self.log_file.flush()

    def flush(self):
        self.stream.flush()
        self.log_file.flush()


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Pull control-tower orders and upload them to the rider dashboard.")
    p.add_argument("--date", help="One date, YYYY-MM-DD (default: today)")
    p.add_argument("--from", dest="date_from", help="Backfill start date, YYYY-MM-DD (use with --to)")
    p.add_argument("--to", dest="date_to", help="Backfill end date, YYYY-MM-DD (use with --from)")
    p.add_argument("--no-upload", action="store_true", help="Export and combine only; do not upload")
    p.add_argument("--headless", action="store_true", help="Run the browser hidden (default: visible, so the OTP screen shows)")
    return p.parse_args()


def dates_to_run(args: argparse.Namespace) -> list[dt.date]:
    if args.date and (args.date_from or args.date_to):
        sys.exit("Use either --date or --from/--to, not both.")
    if bool(args.date_from) != bool(args.date_to):
        sys.exit("--from and --to must be used together.")
    if args.date_from:
        start, end = dt.date.fromisoformat(args.date_from), dt.date.fromisoformat(args.date_to)
        if end < start:
            sys.exit("--to is before --from.")
        days = (end - start).days + 1
        if days > MAX_RANGE_DAYS:
            sys.exit(f"Range is {days} days; split it into chunks of at most {MAX_RANGE_DAYS}.")
        return [start + dt.timedelta(days=i) for i in range(days)]
    return [dt.date.fromisoformat(args.date) if args.date else dt.date.today()]


def check_store_batches(config: dict) -> None:
    batches = set(config["stores"]["batch_a"]) | set(config["stores"]["batch_b"])
    missing = ALL_STORES - batches
    extra = batches - ALL_STORES
    if missing:
        print(f"WARNING: config.yaml batches do not cover these stores: {', '.join(sorted(missing))}")
    if extra:
        print(f"Note: config.yaml batches include stores the dashboard will auto-add: {', '.join(sorted(extra))}")


def data_rows(path: Path) -> int:
    """Rows after the header line (0 for a missing, empty or header-only file)."""
    if not path.exists():
        return 0
    with open(path, encoding="utf-8") as f:
        return max(0, sum(1 for line in f if line.strip()) - 1)


def run_one(day: dt.date, context, page, config: dict, upload: bool) -> dict:
    """Export, combine and (optionally) upload one date. Raises on failure."""
    ensure_logged_in(context, page, config)
    try:
        batch_a, batch_b = export_orders(page, config, target_date=day)
    except SessionExpiredMidRun:
        print("  Saved session's token had expired mid-run; logging in again and retrying this date once.")
        ensure_logged_in(context, page, config, force=True)
        batch_a, batch_b = export_orders(page, config, target_date=day)

    # A day with no orders yet (e.g. "today" when the 01:00 job runs) exports header-only/empty files.
    # That is expected, not a failure: report it and upload nothing.
    if all(data_rows(p) == 0 for p in (batch_a, batch_b)):
        print("  no orders in either batch yet; nothing to combine or upload")
        return {"rows": 0, "result": "no orders yet (nothing uploaded)"}

    combined = DOWNLOADS_DIR / f"combined_{day.isoformat()}.csv"
    combine_batches([batch_a, batch_b], combined)
    rows = max(0, sum(1 for _ in open(combined, encoding="utf-8")) - 1)
    print(f"  combined {batch_a.name} + {batch_b.name} -> {combined.name} ({rows:,} rows)")

    if not upload:
        return {"rows": rows, "result": "exported (no upload)"}

    summary = upload_csv(combined, config, log=print)
    print(
        f"  uploaded: {summary.get('rows_inserted', '?')} new, {summary.get('rows_updated', '?')} updated, "
        f"{summary.get('rows_rejected', '?')} rejected, {summary.get('new_riders_count', '?')} new riders; "
        f"business dates {', '.join(summary.get('dates_affected') or []) or '-'}"
    )
    return {
        "rows": rows,
        "result": f"uploaded ({summary.get('rows_inserted', 0)} new / {summary.get('rows_updated', 0)} updated)",
    }


def main() -> int:
    args = parse_args()
    days = dates_to_run(args)

    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    log_path = LOGS_DIR / f"run_{dt.date.today().isoformat()}.log"
    log_file = open(log_path, "a", encoding="utf-8")
    sys.stdout = Tee(sys.__stdout__, log_file)
    sys.stderr = Tee(sys.__stderr__, log_file)

    started = time.time()
    print(f"\n=== {dt.datetime.now():%Y-%m-%d %H:%M:%S} run.py {' '.join(sys.argv[1:])}")
    print(f"Dates: {days[0]}" + (f" to {days[-1]} ({len(days)} days)" if len(days) > 1 else ""))

    config = load_config()
    check_store_batches(config)

    results: list[tuple[dt.date, str, str]] = []
    login_failed = False
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=args.headless)
        try:
            context = browser.new_context(
                storage_state=str(SESSION_STATE_PATH) if SESSION_STATE_PATH.exists() else None,
                accept_downloads=True,
            )
            page = context.new_page()
            for day in days:
                if login_failed:
                    results.append((day, "SKIPPED", "not logged in (no OTP entered)"))
                    continue
                print(f"\n--- {day.isoformat()}")
                try:
                    out = run_one(day, context, page, config, upload=not args.no_upload)
                    results.append((day, "OK", f"{out['rows']:,} rows, {out['result']}"))
                except SessionExpiredError as e:
                    # Nobody entered the OTP: every later date would fail the same way.
                    login_failed = True
                    print(f"  FAILED: {e}")
                    results.append((day, "FAILED", "session expired and no OTP was entered"))
                except IngestError as e:
                    print(f"  FAILED (export worked, upload did not): {e}")
                    results.append((day, "FAILED", f"upload: {e}"[:120]))
                except Exception as e:  # noqa: BLE001 - one bad date must not stop a backfill
                    print(f"  FAILED: {type(e).__name__}: {e}")
                    results.append((day, "FAILED", f"{type(e).__name__}: {e}"[:120]))
        finally:
            browser.close()

    ok = sum(1 for _, status, _ in results if status == "OK")
    print("\n=== Summary")
    print(f"{'Date':<12} {'Status':<8} Detail")
    for day, status, detail in results:
        print(f"{day.isoformat():<12} {status:<8} {detail}")
    print(f"RESULT: {ok} of {len(results)} date(s) OK in {time.time() - started:.0f}s. Log: {log_path}")
    if login_failed:
        print("Session expired with nobody to enter the OTP. Run `python run.py` once by hand to log in again.")
    return 0 if ok == len(results) else 1


if __name__ == "__main__":
    sys.exit(main())
