-- Row-level security, role helper functions and the private raw-csv bucket.
-- Rule: clients only ever READ. Every write goes through server code using the service role key.

-- ---------------------------------------------------------------------------
-- Role helpers (security definer so they can read profiles regardless of RLS)
-- ---------------------------------------------------------------------------
create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.is_active
  );
$$;

create or replace function public.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.is_active and p.role = 'superadmin'
  );
$$;

revoke all on function public.is_active_user() from public, anon;
revoke all on function public.is_superadmin()  from public, anon;
grant execute on function public.is_active_user() to authenticated, service_role;
grant execute on function public.is_superadmin()  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------
alter table public.profiles        enable row level security;
alter table public.stores          enable row level security;
alter table public.riders          enable row level security;
alter table public.uploads         enable row level security;
alter table public.orders          enable row level security;
alter table public.rider_day_stats enable row level security;
alter table public.staging_orders  enable row level security;
alter table public.app_settings    enable row level security;
alter table public.audit_log       enable row level security;

-- No direct client writes on any table (RLS already denies them; revoke as a second lock).
revoke all on all tables in schema public from anon;
revoke insert, update, delete, truncate on all tables in schema public from authenticated;
-- staging and the audit log are server-only.
revoke all on public.staging_orders, public.audit_log from authenticated;
-- Same for anything created by later migrations: tables are read-only for clients, functions need explicit grants.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke insert, update, delete, truncate on tables from authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Read policies
-- ---------------------------------------------------------------------------
create policy "active users read stores"          on public.stores          for select to authenticated using ((select public.is_active_user()));
create policy "active users read riders"          on public.riders          for select to authenticated using ((select public.is_active_user()));
create policy "active users read orders"          on public.orders          for select to authenticated using ((select public.is_active_user()));
create policy "active users read rider_day_stats" on public.rider_day_stats for select to authenticated using ((select public.is_active_user()));
create policy "active users read uploads"         on public.uploads         for select to authenticated using ((select public.is_active_user()));
create policy "active users read app_settings"    on public.app_settings    for select to authenticated using ((select public.is_active_user()));

create policy "users read own profile, superadmins read all" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.is_superadmin()));

-- ---------------------------------------------------------------------------
-- Storage: private bucket for raw CSV files (kept 7 days, then deleted by a scheduled job)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('raw-csv', 'raw-csv', false, 26214400)  -- 25 MB
on conflict (id) do nothing;

-- Active users may upload into incoming/ only. No select/update/delete policies: only the server reads files.
create policy "active users upload raw csv to incoming"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'raw-csv'
    and (storage.foldername(name))[1] = 'incoming'
    and (select public.is_active_user())
  );
