-- Dashboard read functions. All aggregation happens here, not in the browser.
-- Built on rider_day_stats (kept forever) wherever possible; orders only for hourly and order-level views.
-- SECURITY INVOKER: RLS applies, so only active users get rows. Averages are always sum/count.
-- Filters: p_stores NULL = all stores. p_search matches rider name or last 4 digits.

-- ---------------------------------------------------------------------------
-- Dates
-- ---------------------------------------------------------------------------
create or replace function public.current_business_date()
returns date
language sql
stable
set search_path = ''
as $$
  -- Today's 6 AM–6 AM business day in IST.
  select ((now() at time zone 'Asia/Kolkata') - interval '6 hours')::date;
$$;

-- First business date whose order rows are still kept; NULL = keep all.
create or replace function public.order_retention_cutoff()
returns date
language sql
stable
set search_path = ''
as $$
  select case when d > 0 then public.current_business_date() - d end
  from (select (value #>> '{}')::integer as d from public.app_settings where key = 'order_retention_days') s;
$$;

-- purge_old_orders now uses the shared cutoff (same behaviour as before).
create or replace function public.purge_old_orders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cutoff  date := public.order_retention_cutoff();
  v_deleted integer;
begin
  if v_cutoff is null then
    return 0;
  end if;
  delete from public.orders where business_date < v_cutoff;
  get diagnostics v_deleted = row_count;
  if v_deleted > 0 then
    insert into public.audit_log (actor_id, action, target, details)
    values (null, 'orders.purged', null, jsonb_build_object('cutoff', v_cutoff, 'deleted', v_deleted));
  end if;
  return v_deleted;
end;
$$;

-- Everything a page needs to set up its filters, in one call.
create or replace function public.get_dashboard_meta()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'current_business_date', public.current_business_date(),
    'latest_data_date',      (select max(business_date) from public.rider_day_stats),
    'earliest_data_date',    (select min(business_date) from public.rider_day_stats),
    'retention_cutoff',      public.order_retention_cutoff(),
    'stores', coalesce((
      select jsonb_agg(code order by code) from public.stores where is_active
    ), '[]'::jsonb)
  );
$$;

-- ---------------------------------------------------------------------------
-- KPI block for a range (internal helper)
-- ---------------------------------------------------------------------------
create or replace function public.dash_kpis(p_from date, p_to date, p_stores text[], p_rider_id uuid default null)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'orders',        coalesce(sum(s.orders), 0),
    'bto',           coalesce(sum(s.bto_count), 0),
    'cancelled',     coalesce(sum(s.cancelled_count), 0),
    'bto_pct',       round(100.0 * sum(s.bto_count) / nullif(sum(s.orders), 0), 2),
    'avg_s2p',       round(sum(s.s2p_sum_min) / nullif(sum(s.s2p_count), 0), 3),
    'active_riders', count(distinct s.rider_id),
    'days_active',   count(distinct s.business_date)
  )
  from public.rider_day_stats s
  where s.business_date between p_from and p_to
    and (p_stores is null or s.store_code = any (p_stores))
    and (p_rider_id is null or s.rider_id = p_rider_id);
$$;

-- ---------------------------------------------------------------------------
-- Overview
-- ---------------------------------------------------------------------------
create or replace function public.get_overview(p_from date, p_to date, p_stores text[], p_search text default null)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with span as (select (p_to - p_from + 1) as days),
  riders_in_range as (
    select s.rider_id, sum(s.orders) as orders, sum(s.bto_count) as bto,
           round(sum(s.s2p_sum_min) / nullif(sum(s.s2p_count), 0), 3) as avg_s2p
    from public.rider_day_stats s
    join public.riders r on r.id = s.rider_id
    where s.business_date between p_from and p_to
      and (p_stores is null or s.store_code = any (p_stores))
      and (coalesce(p_search, '') = ''
           or r.display_name ilike '%' || p_search || '%'
           or r.phone_last4 = p_search)
    group by s.rider_id
  ),
  named as (
    select x.*, r.display_name, r.phone_last4
    from riders_in_range x join public.riders r on r.id = x.rider_id
  ),
  trend_days as (
    select d::date as business_date from generate_series(p_to - 13, p_to, interval '1 day') d
  ),
  trend as (
    select t.business_date,
           coalesce(sum(s.orders), 0) as orders,
           coalesce(sum(s.bto_count), 0) as bto,
           round(100.0 * sum(s.bto_count) / nullif(sum(s.orders), 0), 2) as bto_pct
    from trend_days t
    left join public.rider_day_stats s
      on s.business_date = t.business_date
     and (p_stores is null or s.store_code = any (p_stores))
    group by t.business_date
  )
  select jsonb_build_object(
    'current',  public.dash_kpis(p_from, p_to, p_stores),
    'previous', public.dash_kpis(p_from - (select days from span), p_from - 1, p_stores),
    'previous_from', p_from - (select days from span),
    'previous_to',   p_from - 1,
    'trend', (select coalesce(jsonb_agg(to_jsonb(trend) order by business_date), '[]'::jsonb) from trend),
    'top_orders', (
      select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (
        select rider_id, display_name, phone_last4, orders, bto, avg_s2p
        from named order by orders desc, display_name limit 5
      ) t
    ),
    'top_bto', (
      select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (
        select rider_id, display_name, phone_last4, orders, bto, avg_s2p
        from named where bto > 0 order by bto desc, orders desc, display_name limit 5
      ) t
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- Rider leaderboard (all matching riders; the page sorts and paginates)
-- ---------------------------------------------------------------------------
create or replace function public.get_leaderboard(p_from date, p_to date, p_stores text[], p_search text default null)
returns table (
  rider_id uuid,
  display_name text,
  phone_last4 text,
  stores text[],
  days_active integer,
  orders integer,
  orders_per_day numeric,
  bto integer,
  bto_pct numeric,
  cancelled integer,
  avg_s2p numeric
)
language sql
stable
set search_path = ''
as $$
  select
    r.id,
    r.display_name,
    r.phone_last4,
    array_agg(distinct s.store_code order by s.store_code),
    count(distinct s.business_date)::integer,
    sum(s.orders)::integer,
    round(sum(s.orders)::numeric / nullif(count(distinct s.business_date), 0), 2),
    sum(s.bto_count)::integer,
    round(100.0 * sum(s.bto_count) / nullif(sum(s.orders), 0), 2),
    sum(s.cancelled_count)::integer,
    round(sum(s.s2p_sum_min) / nullif(sum(s.s2p_count), 0), 3)
  from public.rider_day_stats s
  join public.riders r on r.id = s.rider_id
  where s.business_date between p_from and p_to
    and (p_stores is null or s.store_code = any (p_stores))
    and (coalesce(p_search, '') = ''
         or r.display_name ilike '%' || p_search || '%'
         or r.phone_last4 = p_search)
  group by r.id, r.display_name, r.phone_last4
  order by sum(s.orders) desc, r.display_name;
$$;

-- ---------------------------------------------------------------------------
-- Rider profile: header, KPIs, daily series
-- ---------------------------------------------------------------------------
create or replace function public.get_rider_profile(p_rider_id uuid, p_from date, p_to date, p_stores text[])
returns jsonb
language sql
stable
set search_path = ''
as $$
  with daily as (
    select d::date as business_date,
           coalesce(sum(s.orders), 0) as orders,
           coalesce(sum(s.bto_count), 0) as bto,
           round(sum(s.s2p_sum_min) / nullif(sum(s.s2p_count), 0), 3) as avg_s2p
    from generate_series(p_from, p_to, interval '1 day') d
    left join public.rider_day_stats s
      on s.business_date = d::date
     and s.rider_id = p_rider_id
     and (p_stores is null or s.store_code = any (p_stores))
    group by d
  )
  select case when r.id is null then null else jsonb_build_object(
    'rider', jsonb_build_object(
      'id', r.id, 'display_name', r.display_name, 'phone_last4', r.phone_last4,
      'first_seen_date', r.first_seen_date, 'last_seen_date', r.last_seen_date,
      'stores_all_time', (select coalesce(jsonb_agg(distinct store_code), '[]'::jsonb)
                          from public.rider_day_stats where rider_id = r.id),
      'stores_in_range', (select coalesce(jsonb_agg(distinct store_code), '[]'::jsonb)
                          from public.rider_day_stats
                          where rider_id = r.id and business_date between p_from and p_to
                            and (p_stores is null or store_code = any (p_stores)))
    ),
    'kpis',  public.dash_kpis(p_from, p_to, p_stores, r.id),
    'daily', (select coalesce(jsonb_agg(to_jsonb(daily) order by business_date), '[]'::jsonb) from daily)
  ) end
  from (select 1) one
  left join public.riders r on r.id = p_rider_id;
$$;

create or replace function public.get_rider_orders(p_rider_id uuid, p_from date, p_to date, p_stores text[])
returns table (
  order_id text,
  store_code text,
  business_date date,
  created_at timestamptz,
  staged_at timestamptz,
  pickup_at timestamptz,
  s2p_min numeric,
  status text,
  bto_flag smallint
)
language sql
stable
set search_path = ''
as $$
  select o.order_id, o.store_code, o.business_date, o.created_at, o.staged_at, o.pickup_at,
         round(o.s2p_min, 3), o.status, o.bto_flag
  from public.orders o
  where o.rider_id = p_rider_id
    and o.business_date between p_from and p_to
    and (p_stores is null or o.store_code = any (p_stores))
  order by o.created_at desc
  limit 5000;
$$;

-- ---------------------------------------------------------------------------
-- Store comparison (every selected store, including ones with no orders)
-- ---------------------------------------------------------------------------
create or replace function public.get_store_comparison(p_from date, p_to date, p_stores text[])
returns table (
  store_code text,
  orders integer,
  riders_active integer,
  bto integer,
  bto_pct numeric,
  cancelled integer,
  avg_s2p numeric
)
language sql
stable
set search_path = ''
as $$
  select st.code,
         coalesce(sum(s.orders), 0)::integer,
         count(distinct s.rider_id)::integer,
         coalesce(sum(s.bto_count), 0)::integer,
         round(100.0 * sum(s.bto_count) / nullif(sum(s.orders), 0), 2),
         coalesce(sum(s.cancelled_count), 0)::integer,
         round(sum(s.s2p_sum_min) / nullif(sum(s.s2p_count), 0), 3)
  from public.stores st
  left join public.rider_day_stats s
    on s.store_code = st.code
   and s.business_date between p_from and p_to
  where (p_stores is null and st.is_active) or st.code = any (p_stores)
  group by st.code
  order by st.code;
$$;

-- ---------------------------------------------------------------------------
-- Hourly heatmap (orders table): rows are stores, or dates when p_by = 'date'
-- ---------------------------------------------------------------------------
create or replace function public.get_hourly_heatmap(p_from date, p_to date, p_stores text[], p_by text default 'store')
returns table (
  row_key text,
  hour smallint,
  orders integer,
  bto integer,
  avg_s2p numeric
)
language sql
stable
set search_path = ''
as $$
  select case when p_by = 'date' then o.business_date::text else o.store_code end,
         o.hour,
         count(*)::integer,
         sum(o.bto_flag)::integer,
         round(avg(o.s2p_min), 3)
  from public.orders o
  where o.business_date between p_from and p_to
    and (p_stores is null or o.store_code = any (p_stores))
  group by 1, 2;
$$;

-- ---------------------------------------------------------------------------
-- Grants: signed-in users only (RLS still limits rows to active users)
-- ---------------------------------------------------------------------------
revoke all on function public.current_business_date()                          from public, anon;
revoke all on function public.order_retention_cutoff()                         from public, anon;
revoke all on function public.get_dashboard_meta()                             from public, anon;
revoke all on function public.dash_kpis(date, date, text[], uuid)              from public, anon;
revoke all on function public.get_overview(date, date, text[], text)           from public, anon;
revoke all on function public.get_leaderboard(date, date, text[], text)        from public, anon;
revoke all on function public.get_rider_profile(uuid, date, date, text[])      from public, anon;
revoke all on function public.get_rider_orders(uuid, date, date, text[])       from public, anon;
revoke all on function public.get_store_comparison(date, date, text[])         from public, anon;
revoke all on function public.get_hourly_heatmap(date, date, text[], text)     from public, anon;

grant execute on function public.current_business_date()                       to authenticated, service_role;
grant execute on function public.order_retention_cutoff()                      to authenticated, service_role;
grant execute on function public.get_dashboard_meta()                          to authenticated, service_role;
grant execute on function public.dash_kpis(date, date, text[], uuid)           to authenticated, service_role;
grant execute on function public.get_overview(date, date, text[], text)        to authenticated, service_role;
grant execute on function public.get_leaderboard(date, date, text[], text)     to authenticated, service_role;
grant execute on function public.get_rider_profile(uuid, date, date, text[])   to authenticated, service_role;
grant execute on function public.get_rider_orders(uuid, date, date, text[])    to authenticated, service_role;
grant execute on function public.get_store_comparison(date, date, text[])      to authenticated, service_role;
grant execute on function public.get_hourly_heatmap(date, date, text[], text)  to authenticated, service_role;
