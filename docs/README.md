# FastBeetle Rider Performance Dashboard

Rider performance (orders, BTOs, BTO %, average S2P) for FastBeetle's Amazon dark stores, built from LoadShare control-tower CSV exports.

> Full architecture and runbook arrive in Phase 6. This file covers local setup so far.

## Repository layout

| Folder        | Contents                                              |
|---------------|-------------------------------------------------------|
| `/web`        | Next.js app (App Router, TypeScript, Tailwind, shadcn/ui, Recharts) |
| `/supabase`   | Supabase CLI project: migrations, seed, SQL functions |
| `/automation` | Python + Playwright LoadShare export automation       |
| `/docs`       | This README, runbook, Task Scheduler setup            |

## Local setup

Requirements: Node 20+, Git. The Supabase CLI is a dev dependency at the repo root (`npx supabase ...`).

```bash
npm install                 # repo root: installs the Supabase CLI
npm --prefix web install    # the web app
npx supabase login          # once per machine; opens the browser
npx supabase link --project-ref <project-ref>
```

Copy `web/.env.example` to `web/.env.local` and fill it in (see below), then:

```bash
npm run dev
```

Open http://localhost:3000. The placeholder page lists each environment variable as set or missing.

## Environment variables

| Variable | Where to find it (Supabase dashboard) | Browser? |
|----------|---------------------------------------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Project Settings → API → Project URL | yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Project Settings → API Keys → `anon` (legacy) or publishable key | yes (RLS protects data) |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API Keys → `service_role` (legacy) or secret key | **never** — server only |
| `AUTOMATION_UPLOAD_KEY` | Not from Supabase: a random secret you generate | **never** — server only |

- **Locally:** `web/.env.local` (git-ignored).
- **Vercel:** Project → Settings → Environment Variables, for Production and Preview.
- **Automation PC:** the same `AUTOMATION_UPLOAD_KEY` goes in `automation/config.yaml` as `dashboard.upload_key`.
