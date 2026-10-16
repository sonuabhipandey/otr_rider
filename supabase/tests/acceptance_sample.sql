-- Phase 1 acceptance check for the sample file (TDE1, business date 2026-10-15).
-- Run: npx supabase db query --linked -f supabase/tests/acceptance_sample.sql
-- Expected: orders 506 | with_rider 504 | riders 47 | bto 13 | s2p_n 503 | mean 0.614 | median 0.483 | max 7.1 | negatives 0
--           stats_orders 506 / stats_bto 13 / stats_mean 0.614 (rider_day_stats agrees with orders)
--           named riders: 17 orders each with the BTO / avg S2P listed in the spec
with o as (
  select * from public.orders where store_code = 'TDE1' and business_date = '2026-10-15'
),
s as (
  select * from public.rider_day_stats where store_code = 'TDE1' and business_date = '2026-10-15'
)
select jsonb_build_object(
  'orders',        (select count(*) from o),
  'with_rider',    (select count(*) from o where rider_id is not null),
  'riders',        (select count(distinct rider_id) from o),
  'bto',           (select sum(bto_flag) from o),
  's2p_n',         (select count(s2p_min) from o),
  's2p_mean',      (select round(avg(s2p_min), 3) from o),
  's2p_median',    (select round((percentile_cont(0.5) within group (order by s2p_min))::numeric, 3) from o where s2p_min is not null),
  's2p_max',       (select round(max(s2p_min), 3) from o),
  's2p_negative',  (select count(*) from o where s2p_min < 0),
  'stats_orders',  (select sum(orders) from s),
  'stats_bto',     (select sum(bto_count) from s),
  'stats_mean',    (select round(sum(s2p_sum_min) / nullif(sum(s2p_count), 0), 3) from s),
  'stats_rows',    (select count(*) from s),
  'total_orders_in_db', (select count(*) from public.orders),
  'total_stats_rows_in_db', (select count(*) from public.rider_day_stats),
  'named_riders',  (
    select jsonb_agg(jsonb_build_object(
             'rider', r.display_name, 'last4', r.phone_last4, 'orders', s.orders, 'bto', s.bto_count,
             'avg_s2p', round(s.s2p_sum_min / nullif(s.s2p_count, 0), 3))
           order by r.display_name)
    from s join public.riders r on r.id = s.rider_id
    where r.rider_key in ('amit rawat|1299', 'chandan kumar|0104', 'deepak|9315', 'pawan|3253', 'prince sharma|2226')
  )
) as acceptance;
