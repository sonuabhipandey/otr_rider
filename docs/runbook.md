# Runbook

Day-to-day operations for the FastBeetle rider dashboard. Architecture and setup: [README.md](README.md).
Automation schedule and OTP details: [task-scheduler.md](task-scheduler.md).

---

## Adding a user

Superadmins only.

1. Dashboard → **Users** (sidebar; on a phone: **More** → Users) → **Add user**.
2. Enter name, email, role:
   - **Admin**: sees all stores, uploads data.
   - **Superadmin**: also manages users, deletes stored CSV files, changes settings.
3. **Create user**. A temporary password appears **once**. Click **Copy** and send it privately (WhatsApp/SMS),
   with the dashboard link.
4. At first sign-in they must set their own password. No emails are sent.

**Forgotten password:** Users → ⋯ on their row → **Reset password** → send the new temporary password.
**Someone leaves:** Users → ⋯ → **Deactivate**. They are blocked at once on every device. Reactivate the same way.
**Change role:** Users → ⋯ → **Make admin / Make superadmin**.
You cannot demote or deactivate yourself, and the last active superadmin can never be removed.
Every action is recorded in the audit log.

## Re-uploading a day

Always safe: orders are updated, never duplicated, and stats for that day are rebuilt.

- **From the office PC** (preferred, pulls fresh data from LoadShare):
  ```powershell
  cd <repo>\automation
  .\venv\Scripts\python run.py --date 2026-10-15
  .\venv\Scripts\python run.py --from 2026-10-10 --to 2026-10-15
  ```
  or double-click `pull_date.bat`.
- **By hand:** export the CSV from control-tower → dashboard **Upload** → drop the file → check the preview →
  **Upload and process**. Any past date is accepted.

Check the result on **Upload history** (rows new/updated/rejected, business dates, stores).

## The LoadShare OTP expired

Symptom: notification "LoadShare session expired", or `session expired and no OTP was entered` in the summary.

1. At the office PC, open PowerShell in the `automation` folder and run `.\venv\Scripts\python run.py`.
2. A browser opens on the OTP screen; the OTP goes to the LoadShare login phone. Type it in the browser
   (or at the terminal prompt, or save it into `automation\auth\otp_input.txt`). You have 5 minutes.
3. The session is saved and reused by the scheduled runs.
4. Re-run any days the failed runs missed (see *Re-uploading a day*).

## A run failed

1. Read the Windows notification, then `automation\last_run.log` (latest run) or `automation\logs\run_<date>.log`.
2. The summary table lists each date as OK / FAILED / SKIPPED with the reason. Common ones:

| Reason | Fix |
|---|---|
| session expired, no OTP | see *The LoadShare OTP expired* |
| `store dropdown chevron not found`, `Could not find an OTP input field` | LoadShare changed its page; update selectors in `automation/src/scraper.py` / `auth.py` |
| `Dashboard rejected the upload key (401)` | `dashboard.upload_key` in `config.yaml` must equal `AUTOMATION_UPLOAD_KEY` in Vercel |
| `failed after 3 retries` | Internet or dashboard down; re-run later |
| `The CSV header does not match the LoadShare export` | LoadShare changed its columns; nothing was saved; update `web/src/lib/ingest/csv-columns.ts` and the staging table/`process_upload` together |
| `statement timeout` | A file far bigger than usual; check Supabase status, re-run; see the performance migration `20261016000007` |

3. Re-run the failed dates. Failed uploads stay visible (red) on **Upload history** with the error.

## The database is nearing its limit

The free Supabase plan allows 500 MB. **Settings** (superadmins) shows the size and warns above 80%.
Order rows are the bulk (~11,000/day). `rider_day_stats` is small and kept forever, so totals,
leaderboards and trends keep working for old dates even after order rows are deleted.

Options, in order:
1. **Lower the retention** (Settings → Order retention, e.g. 90 days). The next nightly purge (02:00 IST)
   deletes older order rows. Only the rider profile's order list and the hourly heatmap lose those days.
2. **Move to a paid Supabase plan** (8 GB), then Settings → tick **Keep all order rows**.
3. Delete stored CSV files early (Upload history → *Delete all stored CSV files*). This only frees
   Storage, not the database, so it rarely helps here.

## Changing retention

Settings → **Order retention** → days (30–3650), or tick **Keep all** → **Save**.
Applied by the nightly job at 02:00 IST. Recorded in the audit log. Lowering it deletes order rows
permanently (re-upload a day to restore its rows, if its CSV can still be exported from LoadShare).

## Adding a store

1. Add the code to `automation/config.yaml` under `stores.batch_a` or `stores.batch_b` (keep each batch
   within the control-tower export limit), on the office PC.
2. Nothing to do in the dashboard: unknown store codes are added automatically on the first upload,
   and appear in the store dropdown.
3. To show a nicer name, edit `display_name` in the `stores` table (Supabase → Table editor). To hide a closed
   store from "All stores", set `is_active = false`. Its history stays.
4. Also add the code to `ALL_STORES` in `automation/run.py` so the coverage warning stays accurate.

## Other

- **Raw CSV files** auto-delete 7 days after upload. Superadmins can delete them sooner on Upload history.
  Processed data is never affected.
- **Rotating a secret** (`AUTOMATION_UPLOAD_KEY`, `CRON_SECRET`, Supabase keys): update it in Vercel → redeploy;
  for the automation key also update `automation/config.yaml` on the office PC.
- **Audit log**: Supabase → Table editor → `audit_log` (user changes, uploads, file deletions, settings, purges).
