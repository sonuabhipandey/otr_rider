-- Fingerprint of all processed data. Run before and after an operation that must not change it
-- (e.g. deleting raw CSV files): every value must be identical.
-- Run: npx supabase db query --linked -f supabase/tests/data_fingerprint.sql
select jsonb_build_object(
  'orders',            (select count(*) from public.orders),
  'orders_hash',       (select md5(string_agg(order_id || coalesce(status, '') || bto_flag || coalesce(s2p_min::text, ''), ',' order by order_id)) from public.orders),
  'riders',            (select count(*) from public.riders),
  'stats_rows',        (select count(*) from public.rider_day_stats),
  'stats_orders',      (select sum(orders) from public.rider_day_stats),
  'stats_bto',         (select sum(bto_count) from public.rider_day_stats),
  'stats_avg_s2p',     (select round(sum(s2p_sum_min) / nullif(sum(s2p_count), 0), 3) from public.rider_day_stats),
  'stats_hash',        (select md5(string_agg(concat_ws('|', business_date, store_code, rider_id, orders, bto_count, cancelled_count, s2p_sum_min, s2p_count), ',' order by business_date, store_code, rider_id)) from public.rider_day_stats),
  'files_stored',      (select count(*) from public.uploads where storage_path is not null and file_deleted_at is null),
  'objects_in_bucket', (select count(*) from storage.objects where bucket_id = 'raw-csv')
) as fingerprint;
