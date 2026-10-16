# Automation: Windows Task Scheduler setup

The office PC pulls LoadShare control-tower orders twice a day and sends them to the dashboard.
Everything runs from `rider_dashboard\automation`.

| Task | When | What it runs | Why |
|---|---|---|---|
| **FastBeetle Riders – midday** | 14:00 daily | `run.py --date <today>` | Mid-day view; orders are still in flight, so numbers will change. |
| **FastBeetle Riders – overnight** | 01:00 daily | `run.py --from <yesterday> --to <today>` | Final numbers for yesterday, plus the 00:00–00:30 orders that belong to yesterday's business day (6 AM–6 AM). Re-sending a day is safe: the dashboard updates orders, it never duplicates them. |

Both tasks call `run_and_notify.ps1`, which runs `run.py` and shows a Windows notification with the result.

---

## 1. One-time setup on the office PC

1. Install **Python 3.12** from python.org (tick *Add python.exe to PATH*).
2. Open **PowerShell** in the automation folder (`Shift` + right-click the folder → *Open PowerShell window here*) and run, one at a time:
   ```powershell
   python -m venv venv
   .\venv\Scripts\pip install -r requirements.txt
   .\venv\Scripts\python -m playwright install chromium
   copy config.yaml.example config.yaml
   ```
3. Open `config.yaml` in Notepad and fill in:
   - `control_tower.phone_number`: the LoadShare login number, digits only.
   - `dashboard.base_url`: `https://fastbeetle-riders.vercel.app` (no trailing slash).
   - `dashboard.upload_key`: the same value as `AUTOMATION_UPLOAD_KEY` in Vercel (ask a superadmin).
4. Do a first run by hand so the LoadShare session gets saved (see *OTP* below):
   ```powershell
   .\venv\Scripts\python run.py --no-upload
   ```
   Then one real run: `.\venv\Scripts\python run.py`. Check the dashboard shows today's data.

## 2. Create the two tasks

Do this twice, once per row of the table above.

1. Press `Win`, type **Task Scheduler**, open it. Click **Create Task…** (not *Create Basic Task*).
2. **General** tab
   - Name: `FastBeetle Riders – midday` (or `– overnight`).
   - Select **Run only when user is logged on**. This is required: the browser and the OTP screen must be visible on the desktop.
   - Leave *Run with highest privileges* unticked.
3. **Triggers** tab → **New…**
   - *Begin the task*: On a schedule → **Daily**, start time **14:00:00** (midday) or **01:00:00** (overnight).
   - Tick **Enabled**. OK.
4. **Actions** tab → **New…**
   - Action: *Start a program*
   - Program/script: `powershell.exe`
   - Add arguments:
     - midday: `-ExecutionPolicy Bypass -File "run_and_notify.ps1"`
     - overnight: `-ExecutionPolicy Bypass -File "run_and_notify.ps1" -Yesterday`
   - Start in: the full path of the automation folder, e.g. `C:\Users\<you>\Desktop\rider_dashboard\automation` (no quotes).
5. **Conditions** tab: untick *Start the task only if the computer is on AC power*. Tick *Wake the computer to run this task*.
6. **Settings** tab: tick *Run task as soon as possible after a scheduled start is missed*; *Stop the task if it runs longer than*: **1 hour**; *If the task is already running*: **Do not start a new instance**.
7. OK. Right-click the task → **Run** once to check it works.

`-Yesterday` makes `run_and_notify.ps1` pass `--from <yesterday> --to <today>` with the dates of the moment it runs.

## 3. OTP: when the LoadShare session expires

LoadShare logs in with phone + OTP. The session is saved in `automation\auth\session_state.json` and reused until it expires. When a run finds it expired, it opens the OTP screen and **waits 5 minutes**, accepting the code from whichever of these comes first:

1. **Typed into the browser window** the run opened (easiest, if someone is at the PC).
2. Typed at the `Enter the OTP sent to your phone:` prompt in the PowerShell window.
3. **Written to `automation\auth\otp_input.txt`**: open Notepad, type only the code, save it as that file. Useful when someone is remote-connected to the PC (AnyDesk/RDP) and can't reach the browser. The file is deleted as soon as it is read.

If nobody enters the code in 5 minutes, the run stops, the remaining dates are marked SKIPPED, and the notification says **"LoadShare session expired"**. Fix: run `.\venv\Scripts\python run.py` by hand once and enter the OTP. Then re-run any missed day (next section).

## 4. When a run fails

1. Read the notification. Then open `automation\last_run.log`, or `automation\logs\run_<date>.log` for the whole day.
2. The summary table at the end lists every date as OK / FAILED / SKIPPED with the reason.
3. Re-run just the missing days. It's always safe to re-send a day:
   ```powershell
   .\venv\Scripts\python run.py --date 2026-10-15
   .\venv\Scripts\python run.py --from 2026-10-13 --to 2026-10-15
   ```
   Or double-click `pull_date.bat`.

| Message | Meaning | Fix |
|---|---|---|
| `session expired and no OTP was entered` | Nobody entered the OTP in 5 minutes | Run by hand, enter OTP, re-run missed days |
| `store dropdown chevron not found` / `Could not find an OTP input field` | LoadShare changed its page | `src/scraper.py` / `src/auth.py` selectors need updating |
| `upload: Dashboard rejected the upload key (401)` | Key in `config.yaml` ≠ `AUTOMATION_UPLOAD_KEY` in Vercel | Fix `dashboard.upload_key` |
| `upload: ... failed after 3 retries` | Network or dashboard down | Check internet; re-run later |
| `processing failed: The CSV header does not match` | LoadShare changed the export columns | Tell the dashboard maintainer; nothing was saved |
| `WARNING: config.yaml batches do not cover these stores` | A store is missing from `batch_a`/`batch_b` | Add it to `config.yaml` |

The dashboard's **Upload history** page shows every automation upload with its row counts and any error.
