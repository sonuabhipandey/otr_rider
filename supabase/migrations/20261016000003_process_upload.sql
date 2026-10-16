-- process_upload: the single source of truth for turning staged CSV rows into orders, riders and stats.
-- Both the manual upload and the automation endpoints call this. No other code computes
-- store_code, rider_key, bto_flag, s2p_min, hour or business_date.

-- ---------------------------------------------------------------------------
-- Parsing helpers for the CSV rules in spec 5.1 (value cleaning only, no business logic)
-- ---------------------------------------------------------------------------

-- Trim; '', 'null' (any case) and '-' mean NULL.
create or replace function public.ingest_text(v text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when v is null then null
    when btrim(v, E' \t\r\n') in ('', '-') or lower(btrim(v, E' \t\r\n')) = 'null' then null
    else btrim(v, E' \t\r\n')
  end;
$$;

-- 'YYYY-MM-DD HH24:MI:SS' in IST (no offset in the file) -> timestamptz. Anything else -> NULL.
create or replace function public.ingest_ts(v text)
returns timestamptz
language plpgsql
stable
parallel safe
set search_path = ''
as $$
declare
  t text := public.ingest_text(v);
begin
  if t is null
     or t !~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$'
     or not pg_input_is_valid(t, 'timestamp') then
    return null;
  end if;
  return t::timestamp at time zone 'Asia/Kolkata';
end;
$$;

-- Plain decimal number ('2878.0') -> numeric. Anything else -> NULL.
create or replace function public.ingest_num(v text)
returns numeric
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when public.ingest_text(v) ~ '^-?\d+(\.\d+)?$' then public.ingest_text(v)::numeric
    else null
  end;
$$;

-- ---------------------------------------------------------------------------
-- process_upload
-- ---------------------------------------------------------------------------
create or replace function public.process_upload(p_upload_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_upload        public.uploads%rowtype;
  v_rows_total    integer;
  v_rejected      integer;
  v_valid         integer;
  v_unique        integer;
  v_inserted      integer;
  v_updated       integer;
  v_new_riders    integer;
  v_s2p_negative  integer;
  v_no_rider      integer;
  v_date_min      date;
  v_date_max      date;
  v_dates         date[];
  v_stores        text[];
  v_summary       jsonb;
  v_err           text;
begin
  -- One upload at a time, so two runs can never interleave their stats recomputation.
  perform pg_advisory_xact_lock(hashtext('public.process_upload'));

  select * into v_upload from public.uploads where id = p_upload_id for update;
  if not found then
    raise exception 'Upload % not found', p_upload_id;
  end if;
  if v_upload.status <> 'processing' then
    raise exception 'Upload % is already %', p_upload_id, v_upload.status;
  end if;

  begin
    -- 1. Parse the raw text per spec 5.1 --------------------------------------------------------
    drop table if exists ingest_parsed;
    create temp table ingest_parsed on commit drop as
    select
      s.row_num,
      public.ingest_text(s.order_id)            as order_id,
      public.ingest_text(s.store_id)            as store_id,
      public.ingest_text(s.store_name)          as store_name,
      public.ingest_text(s.rider_name)          as rider_name_raw,
      public.ingest_text(s.rider_number)        as rider_number_masked,
      public.ingest_text(s.status)              as status,
      public.ingest_text(s.status_text)         as status_text,
      public.ingest_text(s.order_eta_status)    as order_eta_status,
      public.ingest_ts(s.created_at)            as created_at,
      public.ingest_text(s.assigned_at)         as assigned_at_text,
      public.ingest_ts(s.staged_at)             as staged_at,
      public.ingest_ts(s.pickup_at)             as pickup_at,
      public.ingest_ts(s.arrived_pickup_at)     as arrived_pickup_at,
      public.ingest_ts(s.arrived_delivery_at)   as arrived_delivery_at,
      public.ingest_ts(s.completed_at)          as completed_at,
      public.ingest_ts(s.rto_at)                as rto_at,
      public.ingest_text(s.total_time)          as total_time,
      public.ingest_num(s.lm_distance)          as lm_distance,
      public.ingest_num(s.fm_distance)          as fm_distance,
      public.ingest_text(s.batch_id)            as batch_id
    from public.staging_orders s
    where s.upload_id = p_upload_id;

    select count(*),
           count(*) filter (where order_id is null or created_at is null)
      into v_rows_total, v_rejected
      from ingest_parsed;
    v_valid := v_rows_total - v_rejected;

    -- 2. Valid rows, one per Order ID (the last occurrence in the file wins), plus row-level helper columns
    drop table if exists ingest_rows;
    create temp table ingest_rows on commit drop as
    select distinct on (p.order_id)
      p.*,
      -- store_code  = INDEX(SPLIT(Store Name, "|"), 1, 1)
      nullif(btrim(split_part(p.store_name, '|', 1)), '')                         as store_code,
      -- rider_key   = normalised name | last 4 of Rider Number ('NA' if missing); NULL when no rider
      case when p.rider_name_raw is null then null
           else lower(regexp_replace(p.rider_name_raw, '\s+', ' ', 'g'))
                || '|' || coalesce(right(p.rider_number_masked, 4), 'NA')
      end                                                                         as rider_key,
      -- hour        = HOUR(Created At), IST
      extract(hour from p.created_at at time zone 'Asia/Kolkata')::smallint      as hour,
      -- business_date: the 6 AM–6 AM day, IST
      ((p.created_at at time zone 'Asia/Kolkata') - interval '6 hours')::date    as business_date
    from ingest_parsed p
    where p.order_id is not null and p.created_at is not null
    order by p.order_id, p.row_num desc;

    select count(*), count(*) filter (where rider_key is null),
           min(business_date), max(business_date),
           array_agg(distinct business_date order by business_date),
           array_agg(distinct store_code order by store_code) filter (where store_code is not null)
      into v_unique, v_no_rider, v_date_min, v_date_max, v_dates, v_stores
      from ingest_rows;

    -- 3. Stores (unknown codes are auto-added) and riders ----------------------------------------
    insert into public.stores (code, display_name)
    select distinct r.store_code, r.store_code
    from ingest_rows r
    where r.store_code is not null
    on conflict (code) do nothing;

    with ins as (
      insert into public.riders as rd (rider_key, display_name, phone_last4, first_seen_date, last_seen_date)
      select r.rider_key,
             initcap(regexp_replace(min(r.rider_name_raw), '\s+', ' ', 'g')),
             right(min(r.rider_number_masked), 4),
             min(r.business_date),
             max(r.business_date)
      from ingest_rows r
      where r.rider_key is not null
      group by r.rider_key
      on conflict (rider_key) do update
        set first_seen_date = least(rd.first_seen_date, excluded.first_seen_date),
            last_seen_date  = greatest(rd.last_seen_date, excluded.last_seen_date)
      returning (xmax = 0) as inserted
    )
    select count(*) filter (where inserted) into v_new_riders from ins;

    -- 4. (business_date, store) pairs whose stats must be rebuilt: new values and any old values being replaced
    drop table if exists ingest_touched;
    create temp table ingest_touched on commit drop as
    select r.business_date, r.store_code from ingest_rows r
    union
    select o.business_date, o.store_code
    from public.orders o
    join ingest_rows r on r.order_id = o.order_id;

    -- 5. Upsert orders. Latest upload wins for text/status fields; timestamps keep any value already known.
    with up as (
      insert into public.orders as o (
        order_id, store_id, store_name, rider_name_raw, rider_number_masked, status, status_text,
        order_eta_status, created_at, assigned_at_text, staged_at, pickup_at, arrived_pickup_at,
        arrived_delivery_at, completed_at, rto_at, total_time, lm_distance, fm_distance, batch_id,
        store_code, rider_id, hour, business_date, first_upload_id, last_upload_id, updated_at
      )
      select
        r.order_id, r.store_id, r.store_name, r.rider_name_raw, r.rider_number_masked, r.status, r.status_text,
        r.order_eta_status, r.created_at, r.assigned_at_text, r.staged_at, r.pickup_at, r.arrived_pickup_at,
        r.arrived_delivery_at, r.completed_at, r.rto_at, r.total_time, r.lm_distance, r.fm_distance, r.batch_id,
        r.store_code, rd.id, r.hour, r.business_date, p_upload_id, p_upload_id, now()
      from ingest_rows r
      left join public.riders rd on rd.rider_key = r.rider_key
      on conflict (order_id) do update set
        store_id            = excluded.store_id,
        store_name          = excluded.store_name,
        rider_name_raw      = excluded.rider_name_raw,
        rider_number_masked = excluded.rider_number_masked,
        status              = excluded.status,
        status_text         = excluded.status_text,
        order_eta_status    = excluded.order_eta_status,
        assigned_at_text    = excluded.assigned_at_text,
        total_time          = excluded.total_time,
        lm_distance         = excluded.lm_distance,
        fm_distance         = excluded.fm_distance,
        batch_id            = excluded.batch_id,
        created_at          = coalesce(excluded.created_at,          o.created_at),
        staged_at           = coalesce(excluded.staged_at,           o.staged_at),
        pickup_at           = coalesce(excluded.pickup_at,           o.pickup_at),
        arrived_pickup_at   = coalesce(excluded.arrived_pickup_at,   o.arrived_pickup_at),
        arrived_delivery_at = coalesce(excluded.arrived_delivery_at, o.arrived_delivery_at),
        completed_at        = coalesce(excluded.completed_at,        o.completed_at),
        rto_at              = coalesce(excluded.rto_at,              o.rto_at),
        store_code          = excluded.store_code,
        rider_id            = excluded.rider_id,
        hour                = excluded.hour,
        business_date       = excluded.business_date,
        last_upload_id      = excluded.last_upload_id,
        updated_at          = now()
      returning (xmax = 0) as inserted
    )
    select count(*) filter (where inserted), count(*) filter (where not inserted)
      into v_inserted, v_updated
      from up;

    -- 6. Helper columns that depend on the merged timestamps
    update public.orders o set
      -- bto_flag = IF(RTO At <> "", 1, 0)
      bto_flag = case when o.rto_at is not null then 1 else 0 end,
      -- s2p_min  = (Pickup At − Staged At) × 1440; NULL if either is missing; negatives kept
      s2p_min  = case when o.pickup_at is null or o.staged_at is null then null
                      else extract(epoch from (o.pickup_at - o.staged_at)) / 60 end
    from ingest_rows r
    where o.order_id = r.order_id;

    select count(*) into v_s2p_negative
    from public.orders o
    join ingest_rows r on r.order_id = o.order_id
    where o.s2p_min < 0;

    -- 7. Rebuild rider_day_stats for every touched (business_date, store). rider_id NULL = orders without a rider.
    delete from public.rider_day_stats s
    using ingest_touched t
    where s.business_date = t.business_date
      and s.store_code is not distinct from t.store_code;

    insert into public.rider_day_stats (
      business_date, store_code, rider_id, orders, bto_count, cancelled_count,
      s2p_sum_min, s2p_count, first_order_at, last_order_at
    )
    select
      o.business_date, o.store_code, o.rider_id,
      count(*),
      sum(o.bto_flag),
      count(*) filter (where o.status = 'CANCELLED'),
      coalesce(sum(o.s2p_min), 0),
      count(o.s2p_min),
      min(o.created_at),
      max(o.created_at)
    from public.orders o
    join ingest_touched t
      on o.business_date = t.business_date
     and o.store_code is not distinct from t.store_code
    group by o.business_date, o.store_code, o.rider_id;

    -- 8. Record the outcome --------------------------------------------------------------------------
    v_summary := jsonb_build_object(
      'upload_id',          p_upload_id,
      'status',             'done',
      'rows_total',         v_rows_total,
      'rows_inserted',      v_inserted,
      'rows_updated',       v_updated,
      'rows_rejected',      v_rejected,
      'rows_duplicate',     v_valid - v_unique,
      'rows_without_rider', v_no_rider,
      's2p_negative_count', v_s2p_negative,
      'new_riders_count',   v_new_riders,
      'business_date_min',  v_date_min,
      'business_date_max',  v_date_max,
      'dates_affected',     coalesce(to_jsonb(v_dates), '[]'::jsonb),
      'stores_in_file',     coalesce(to_jsonb(v_stores), '[]'::jsonb)
    );

    update public.uploads set
      rows_total         = v_rows_total,
      rows_inserted      = v_inserted,
      rows_updated       = v_updated,
      rows_rejected      = v_rejected,
      rows_duplicate     = v_valid - v_unique,
      s2p_negative_count = v_s2p_negative,
      business_date_min  = v_date_min,
      business_date_max  = v_date_max,
      stores_in_file     = coalesce(v_stores, '{}'),
      new_riders_count   = v_new_riders,
      status             = 'done',
      error              = null,
      summary            = v_summary,
      processed_at       = now()
    where id = p_upload_id;

    delete from public.staging_orders where upload_id = p_upload_id;

    insert into public.audit_log (actor_id, action, target, details)
    values (v_upload.uploaded_by, 'upload.processed', p_upload_id::text, v_summary);

    return v_summary;

  exception when others then
    -- Everything above is rolled back to the start of this block; record the failure instead.
    get stacked diagnostics v_err = message_text;

    delete from public.staging_orders where upload_id = p_upload_id;

    update public.uploads
       set status = 'failed', error = v_err, processed_at = now()
     where id = p_upload_id;

    insert into public.audit_log (actor_id, action, target, details)
    values (v_upload.uploaded_by, 'upload.failed', p_upload_id::text, jsonb_build_object('error', v_err));

    return jsonb_build_object('upload_id', p_upload_id, 'status', 'failed', 'error', v_err);
  end;
end;
$$;

revoke all on function public.ingest_text(text)    from public, anon, authenticated;
revoke all on function public.ingest_ts(text)      from public, anon, authenticated;
revoke all on function public.ingest_num(text)     from public, anon, authenticated;
revoke all on function public.process_upload(uuid) from public, anon, authenticated;
grant execute on function public.ingest_text(text)    to service_role;
grant execute on function public.ingest_ts(text)      to service_role;
grant execute on function public.ingest_num(text)     to service_role;
grant execute on function public.process_upload(uuid) to service_role;
