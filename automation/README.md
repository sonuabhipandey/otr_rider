# Automation (LoadShare → rider dashboard)

Logs into control-tower.loadshare.net, exports both store batches for a date, combines them into one
raw CSV (same 29 columns as the export, nothing added), and sends it to the rider dashboard.

- `run.py`: entry point (one date, a `--from/--to` backfill, `--no-upload`, `--headless`).
- `src/auth.py`, `src/scraper.py`, `src/combine.py`, `src/config.py`: the original Loadshare-Sync code, unchanged.
- `src/ingest.py`: gzip → signed upload URL → PUT → process (replaces the old `src/uploader.py`).
- `run_and_notify.ps1`: what Task Scheduler runs; shows a Windows notification with the result.
- `pull_date.bat`: double-click to pull a date or a range by hand.

```powershell
python -m venv venv
.\venv\Scripts\pip install -r requirements.txt
.\venv\Scripts\python -m playwright install chromium
copy config.yaml.example config.yaml     # then fill it in

.\venv\Scripts\python run.py                                   # today
.\venv\Scripts\python run.py --date 2026-10-15
.\venv\Scripts\python run.py --from 2026-10-13 --to 2026-10-15
.\venv\Scripts\python run.py --no-upload                       # export + combine only
```

Combined files go to `downloads/combined_<date>.csv`, logs to `logs/run_<date>.log`.
Scheduling, the OTP handoff (`auth/otp_input.txt`) and troubleshooting: see `docs/task-scheduler.md`.

If control-tower changes its page layout, runs fail with errors like "store dropdown chevron not found"
or "Could not find an OTP input field": the selectors in `src/scraper.py` / `src/auth.py` need updating.
