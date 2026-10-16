-- Overview 14-day trend: days with no data at all return NULL orders (a gap), not 0,
-- so a day that simply was not uploaded never reads as "zero orders".
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
           sum(s.orders) as orders,
           sum(s.bto_count) as bto,
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
