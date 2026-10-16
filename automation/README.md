# Loadshare-Sync

Standalone scraper that logs into control-tower.loadshare.net, exports both
store batches for a date, combines them into one raw CSV (same columns as the
original export, nothing added), and uploads it to the Delivery Ops Dashboard.

This is a separate project from any existing automation - it doesn't read,
modify, or depend on anything else on this machine.

## Setup

```bash
python -m venv venv
venv\Scripts\activate          # Windows
pip install -r requirements.txt
playwright install chromium
```

Copy the config template and fill in your values:

```bash
copy config.yaml.example config.yaml
```

Edit `config.yaml`:
- `control_tower.phone_number` - your control-tower login phone number.
- `dashboard.upload_url` - the dashboard's automated upload endpoint (already filled in).
- `dashboard.upload_key` - must match the `AUTOMATION_UPLOAD_KEY` value set in the
  dashboard project's environment variables. Ask whoever manages that project for it,
  or generate a new one and set it in both places:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```

## Running it

```bash
python main.py                  # today
python main.py --date 2026-07-28
```

Or just double-click **`pull_date.bat`** - it asks for a date and runs the
same thing, no terminal typing needed.

For a run that also pops a Windows notification with the result (data
uploaded / session expired / failed) - useful when you're not watching the
console, e.g. right after a scheduled run:

```powershell
.\run_and_notify.ps1                    # today
.\run_and_notify.ps1 -Date 2026-07-20   # a specific day
```

The first run needs someone present, since control-tower requires phone+OTP
login and there's no saved session yet. When it reaches the OTP step it waits
up to 5 minutes and accepts the code from whichever of these you use first:

- **the browser window it already opened on the OTP screen** - just type the
  code straight into the page like you normally would. This is usually the
  easiest one, and it's the only one that works if the terminal is busy or
  its output is being captured.
- the `Enter the OTP sent to your phone:` prompt in the terminal.
- `auth/otp_input.txt` - write the code into that file and save it.

After that, the session is saved to `auth/session_state.json` and reused
automatically until it actually expires.

## What happens on each run

1. Logs into control-tower (reusing the saved session if it's still valid).
2. Exports both store batches as CSVs into `downloads/`.
3. Combines them into `downloads/orders_<date>.csv`.
4. If you passed `--date` (an explicitly-requested day) and the dashboard
   already has data for that date, it asks `Overwrite? [y/N]` before
   uploading - so re-pulling a past day by accident won't silently clobber it.
   Answering anything but `y`/`yes` skips the upload and leaves existing data
   untouched. This check is skipped for the default "today" run, since
   refreshing today's still-accumulating numbers repeatedly through the day
   is the whole point of running it unattended.
5. Uploads that combined file to the dashboard.

## Scheduling it unattended (Windows Task Scheduler)

Once you've confirmed a manual run works end to end:

1. Task Scheduler → Create Task.
2. Trigger: whatever cadence you want (e.g. daily, or a few times a day for
   intraday updates).
3. Action: start a program - use `run_and_notify.ps1` here instead of
   `main.py` directly, so a scheduled run actually tells you something instead
   of silently succeeding or failing in a log nobody's watching:
   - Program: `powershell.exe`
   - Arguments: `-ExecutionPolicy Bypass -File "run_and_notify.ps1"`
   - Start in: this project's folder.

**Important caveat**: this is not fully "set and forget." Whenever
control-tower's session genuinely expires, an unattended run has nobody
available to supply the OTP (browser, terminal, or file), so that run will
fail after waiting 5 minutes - you'll see a Windows notification saying the
session expired instead of the usual "data uploaded" one. When you see that,
just run `python main.py` manually once - a browser window will open on the
OTP screen, type the code there (or at the terminal prompt) - that refreshes
the session for every scheduled run after it.

Full console output from the most recent run (including anything printed
after the balloon notification already faded) is saved to `last_run.log` in
this folder, in case you need to see what happened.

## If control-tower changes its page layout

The store-selection and login logic in `src/scraper.py` / `src/auth.py` locate
elements by DOM structure and text, not stable IDs (the site doesn't expose
any). If a run starts failing with an error like "store dropdown chevron not
found" or "Could not find an OTP input field," that means control-tower
changed something about that page, and the corresponding selector in those
two files needs to be updated to match the new layout.
