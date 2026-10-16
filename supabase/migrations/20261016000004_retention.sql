-- Retention: purge old order rows daily (rider_day_stats is never purged) and expose the database size.
-- Raw CSV files in Storage are NOT deleted here: Supabase blocks deleting storage objects from SQL,
-- so a daily Vercel Cron route deletes files older than 7 days through the Storage API.

create extension if not exists pg_cron;

-- Deletes orders whose business_date is older than app_settings.order_retention_days.
-- A JSON null (or <= 0) retention value means "keep all".
create or replace function public.purge_old_orders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_days    integer;
  v_cutoff  date;
  v_deleted integer;
begin
  select (value #>> '{}')::integer into v_days
  from public.app_settings
  where key = 'order_retention_days';

  if v_days is null or v_days <= 0 then
    return 0;
  end if;

  -- Today's business day in IST, minus the retention window.
  v_cutoff := ((now() at time zone 'Asia/Kolkata') - interval '6 hours')::date - v_days;

  delete from public.orders where business_date < v_cutoff;
  get diagnostics v_deleted = row_count;

  if v_deleted > 0 then
    insert into public.audit_log (actor_id, action, target, details)
    values (null, 'orders.purged', null, jsonb_build_object('cutoff', v_cutoff, 'deleted', v_deleted));
  end if;

  return v_deleted;
end;
$$;

revoke all on function public.purge_old_orders() from public, anon, authenticated;
grant execute on function public.purge_old_orders() to service_role;

-- Daily at 02:00 IST (20:30 UTC). cron.schedule replaces an existing job with the same name.
select cron.schedule('purge-old-orders', '30 20 * * *', $$select public.purge_old_orders();$$);

-- Current database size in bytes, for the settings page meter. Superadmins only.
create or replace function public.get_db_size()
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_superadmin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return pg_database_size(current_database());
end;
$$;

revoke all on function public.get_db_size() from public, anon;
grant execute on function public.get_db_size() to authenticated;
