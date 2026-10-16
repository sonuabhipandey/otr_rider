-- Core schema: stores, riders, uploads, orders, rider_day_stats, staging, profiles, settings, audit log.
-- Helper columns (store_code, bto_flag, s2p_min, hour, business_date, rider_key) are computed ONLY in
-- public.process_upload (see 20261016000003_process_upload.sql).

-- ---------------------------------------------------------------------------
-- profiles (one row per auth user)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id                   uuid primary key references auth.users (id) on delete cascade,
  email                text not null,
  full_name            text,
  role                 text not null check (role in ('superadmin', 'admin')),
  is_active            boolean not null default true,
  must_change_password boolean not null default true,
  created_by           uuid references public.profiles (id) on delete set null,
  created_at           timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- stores
-- ---------------------------------------------------------------------------
create table public.stores (
  code         text primary key,
  display_name text not null,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

insert into public.stores (code, display_name) values
  ('TNE6', 'TNE6'), ('TDE2', 'TDE2'), ('TNE3', 'TNE3'), ('TDE5', 'TDE5'),
  ('TND7', 'TND7'), ('TDE1', 'TDE1'), ('TDI6', 'TDI6'), ('TND9', 'TND9'),
  ('TNE5', 'TNE5'), ('TNE4', 'TNE4'), ('TDO2', 'TDO2')
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- riders: identity = normalised name + last 4 digits of the masked rider number
-- ---------------------------------------------------------------------------
create table public.riders (
  id              uuid primary key default gen_random_uuid(),
  rider_key       text not null unique,
  display_name    text not null,
  phone_last4     text,
  first_seen_date date,
  last_seen_date  date,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- uploads: one row per CSV processed (manual or automation)
-- ---------------------------------------------------------------------------
create table public.uploads (
  id                 uuid primary key default gen_random_uuid(),
  source             text not null check (source in ('automation', 'manual')),
  uploaded_by        uuid references public.profiles (id) on delete set null,
  file_name          text,
  storage_path       text,
  rows_total         integer,
  rows_inserted      integer,
  rows_updated       integer,
  rows_rejected      integer,
  rows_duplicate     integer,          -- same Order ID repeated inside one file; the last occurrence wins
  s2p_negative_count integer,
  business_date_min  date,
  business_date_max  date,
  stores_in_file     text[],
  new_riders_count   integer,
  status             text not null default 'processing' check (status in ('processing', 'done', 'failed')),
  error              text,
  summary            jsonb,
  created_at         timestamptz not null default now(),
  processed_at       timestamptz,
  file_deleted_at    timestamptz,
  file_deleted_by    uuid references public.profiles (id) on delete set null  -- NULL with a date = auto-deleted
);

create index uploads_created_at_idx on public.uploads (created_at desc);

-- ---------------------------------------------------------------------------
-- orders: lean copy of the source row + helper columns. Purged after order_retention_days.
-- ---------------------------------------------------------------------------
create table public.orders (
  order_id            text primary key,
  -- lean source columns
  store_id            text,
  store_name          text,
  rider_name_raw      text,
  rider_number_masked text,
  status              text,
  status_text         text,
  order_eta_status    text,
  created_at          timestamptz not null,
  assigned_at_text    text,
  staged_at           timestamptz,
  pickup_at           timestamptz,
  arrived_pickup_at   timestamptz,
  arrived_delivery_at timestamptz,
  completed_at        timestamptz,
  rto_at              timestamptz,
  total_time          text,             -- always "null" in the sample; kept as text until the format is known
  lm_distance         numeric,
  fm_distance         numeric,
  batch_id            text,
  -- helper columns (computed by process_upload only)
  store_code          text references public.stores (code),
  rider_id            uuid references public.riders (id),
  bto_flag            smallint not null default 0,
  s2p_min             numeric,
  hour                smallint,
  business_date       date not null,
  -- bookkeeping
  first_upload_id     uuid references public.uploads (id),
  last_upload_id      uuid references public.uploads (id),
  updated_at          timestamptz not null default now()
);

create index orders_business_date_store_idx on public.orders (business_date, store_code);
create index orders_rider_business_date_idx on public.orders (rider_id, business_date);
create index orders_created_at_idx          on public.orders (created_at);

-- ---------------------------------------------------------------------------
-- rider_day_stats: kept forever. Sums and counts only (never averages).
-- rider_id NULL = orders with no rider, so store totals survive order purges.
-- ---------------------------------------------------------------------------
create table public.rider_day_stats (
  business_date   date not null,
  store_code      text references public.stores (code),
  rider_id        uuid references public.riders (id),
  orders          integer not null,
  bto_count       integer not null,
  cancelled_count integer not null,
  s2p_sum_min     numeric not null,
  s2p_count       integer not null,
  first_order_at  timestamptz,
  last_order_at   timestamptz,
  constraint rider_day_stats_key unique nulls not distinct (business_date, store_code, rider_id)
);

create index rider_day_stats_rider_idx on public.rider_day_stats (rider_id, business_date);

-- ---------------------------------------------------------------------------
-- staging_orders: raw CSV text, one column per source header. Emptied after each upload is processed.
-- ---------------------------------------------------------------------------
create table public.staging_orders (
  upload_id              uuid not null references public.uploads (id) on delete cascade,
  row_num                integer not null,
  rider_number           text,
  arrived_pickup_at      text,
  lm_distance            text,
  resting_point_name     text,
  total_eta              text,
  completed_at           text,
  resting_point_id       text,
  store_name             text,
  pickup_at              text,
  order_eta_status       text,
  staged_at              text,
  pickup_eta             text,
  arrive_at_pickup_eta   text,
  status_text            text,
  created_at             text,
  status                 text,
  rider_name             text,
  order_id               text,
  store_id               text,
  total_time             text,
  arrive_at_delivery_eta text,
  arrived_delivery_at    text,
  tracking_url           text,
  customer_id            text,
  rto_at                 text,
  fm_distance            text,
  assigned_at            text,
  delivery_eta           text,
  batch_id               text,
  primary key (upload_id, row_num)
);

-- ---------------------------------------------------------------------------
-- app_settings
-- ---------------------------------------------------------------------------
create table public.app_settings (
  key        text primary key,
  value      jsonb,                -- order_retention_days: integer, or JSON null = keep all
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

insert into public.app_settings (key, value) values ('order_retention_days', '120'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- audit_log
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id         bigint generated always as identity primary key,
  actor_id   uuid references public.profiles (id) on delete set null,  -- NULL = automation / system
  action     text not null,
  target     text,
  details    jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_created_at_idx on public.audit_log (created_at desc);
