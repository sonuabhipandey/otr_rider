# FastBeetle Rider Performance Dashboard

Rider performance (orders, BTOs, BTO %, average S2P) for FastBeetle's 11 Amazon dark stores, built from
LoadShare control-tower CSV exports. Used by 30–40 people on laptops and phones.

- **Runbook** (day-to-day operations): [runbook.md](runbook.md)
- **Automation scheduling and OTP**: [task-scheduler.md](task-scheduler.md)

## Architecture

```
 Office PC (Windows, Task Scheduler 14:00 + 01:00)          Browser (laptop / phone)
 automation/run.py                                          Next.js pages (Vercel)
   Playwright -> control-tower export (batch A + B)            │  reads via RPC as the signed-in user (RLS)
   combine -> downloads/combined_<date>.csv                    ▼
   src/ingest.py ──1. POST /api/automation/upload-url ──► Vercel (Next.js, /web)
               ──2. PUT gzipped CSV ─────────────────────────────────────► Supabase Storage  raw-csv/incoming/
               ──3. POST /api/automation/process ────► Vercel ─► reads file, stages rows ─► Postgres
                                                                                     process_upload()
 Manual upload (/admin/upload): browser gzips + PUTs to Storage, then the same server-side processing.
```

- **Files never pass through a Vercel function body** (Vercel caps bodies at 4.5 MB; a full day is ~3.5 MB and
  growing). They go straight to Supabase Storage; the server reads them from there.
- **`public.process_upload(upload_id)` is the single source of truth.** It parses the raw text (nulls,
  IST timestamps, trimming) and computes every helper column: `store_code`, `rider_key`, `bto_flag`,
  `s2p_min`, `hour`, `business_date` (6 AM–6 AM IST). Nothing else recalculates them.
- **Re-sending data never duplicates it.** Orders upsert on Order ID; the latest upload wins for status/text,
  timestamps keep any value already known (`coalesce(new, old)`).
- **`rider_day_stats`** (one row per business date × store × rider; `rider_id` NULL = orders with no rider)
  stores sums and counts only, so averages are always weighted correctly. It is kept forever.
  Order rows are purged after `order_retention_days` (default 120) to stay inside the free 500 MB database.
- **Raw CSV files** stay in Storage for 7 days (download from Upload history), then a daily Vercel Cron job
  deletes them. Deleting a file never changes processed data.
- **Security**: RLS on every table; browsers only read. All writes go through server actions / route
  handlers that check the caller's role on the server, using the service-role key (server only).
  Automation endpoints use a bearer key compared in constant time.

| Folder | Contents |
|---|---|
| `web/` | Next.js 16 (App Router, TypeScript), Tailwind v4, shadcn/ui (Base UI), Recharts, SheetJS |
| `supabase/` | Migrations (schema, RLS, `process_upload`, retention, dashboard RPCs), SQL checks |
| `automation/` | Python + Playwright LoadShare export (`run.py`, `src/ingest.py`) |
| `docs/` | This file, runbook, Task Scheduler guide |

Key code: `web/src/lib/ingest/process.ts` (Storage → staging → `process_upload`),
`web/src/lib/auth.ts` (role checks), `web/src/proxy.ts` (login / forced password change),
`web/src/lib/dashboard.ts` (dashboard RPCs), `supabase/migrations/*process_upload*.sql`.

## Local setup

Requirements: Node 20+, Git, Python 3.12 (automation only). The Supabase CLI is a dev dependency at the repo root.

```bash
npm install                         # repo root (Supabase CLI)
npm --prefix web install
npx supabase login                  # once per machine
npx supabase link --project-ref qufpbzughgtnvohsddho
```

Copy `web/.env.example` to `web/.env.local`, fill it in (below), then `npm run dev` and open http://localhost:3000.

On Windows PowerShell, `npx` may be blocked by the script policy: use `npx.cmd` / `npm.cmd`.

### Database changes

```bash
npx supabase migration new <name>   # write SQL in supabase/migrations/
npx supabase db push                # apply to the linked project
```

### First superadmin (once per project)

```bash
cd web && npm run seed:superadmin   # prints a temporary password once
```

## Environment variables

| Variable | Where it comes from | Browser? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL | yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → API Keys → Legacy → `anon` `public` | yes (RLS protects data) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → API Keys → Legacy → `service_role` `secret` | **never** |
| `AUTOMATION_UPLOAD_KEY` | Random secret you generate (64 hex chars) | **never** |
| `CRON_SECRET` | Random secret you generate; Vercel Cron sends it to `/api/cron/purge-files` | **never** |

- Local: `web/.env.local` (git-ignored). Production: Vercel → Project → Settings → Environment Variables.
- The automation PC puts the same `AUTOMATION_UPLOAD_KEY` in `automation/config.yaml` (`dashboard.upload_key`)
  and the dashboard address in `dashboard.base_url`.
- Generate a secret: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

## Deployment (Vercel)

- Vercel project imported from the GitHub repo with **Root Directory = `web`** (framework: Next.js).
- `web/vercel.json` pins functions to `hnd1` (Tokyo, next to the Supabase project in ap-northeast-1) and
  schedules the daily file-cleanup cron (21:30 UTC ≈ 03:00 IST; Hobby crons fire within that hour).
- Pushing to `main` deploys production.

## Tests

```bash
cd web
npm test           # role guards: every protected server action + automation/cron endpoints (no network)
npm run test:db    # process_upload acceptance test on the sample CSV, against the linked project,
                   # inside a transaction that is always rolled back (needs samples/sample_TDE1_2026-10-15.csv)
npm run check:guards   # live check: sign in as an admin and try superadmin actions on a running build
```

SQL checks: `npx supabase db query --linked -f supabase/tests/acceptance_sample.sql` (acceptance numbers)
and `-f supabase/tests/data_fingerprint.sql` (hash of all processed data; run before/after any operation
that must not change it).

## Decisions worth knowing

- Average S2P is a plain weighted mean of every order with both timestamps, outliers included (orders
  staged near midnight and picked up at 06:00 show ~6 h). This matches the source Google Sheet.
- Stats are rebuilt per (business date, store) touched by an upload, so re-uploading an old day for some
  stores never wipes other stores' stats.
- Dashboard charts never use two y-axes: the rider daily view is two stacked charts on the same dates.
- Next.js "Cache Components" is off: every page is signed-in and per-request.
