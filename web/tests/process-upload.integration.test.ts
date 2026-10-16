// process_upload acceptance test (spec Phase 1) against the linked Supabase project.
//
// Everything runs inside BEGIN ... ROLLBACK, so the real data is never changed: within the
// transaction it clears TDE1 / 2026-10-15, loads the sample CSV twice through staging_orders +
// process_upload, measures the result, and rolls back.
//
// Needs: the Supabase CLI logged in and linked (npx supabase link), and the sample at
// samples/sample_TDE1_2026-10-15.csv (git-ignored: it contains customer data).
// Run:  npm run test:db
import { execSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import Papa from "papaparse";
import { describe, expect, it } from "vitest";
import { CSV_COLUMNS, stagingColumn } from "@/lib/ingest/csv-columns";

const REPO = resolve(__dirname, "../..");
const SAMPLE = join(REPO, "samples", "sample_TDE1_2026-10-15.csv");
const runDb = process.env.RUN_DB_TESTS === "1";

const q = (v: string | undefined) => (v == null ? "null" : `'${v.replace(/'/g, "''")}'`);

function buildSql(): string {
  const parsed = Papa.parse<Record<string, string>>(readFileSync(SAMPLE, "utf8"), { header: true, skipEmptyLines: true });
  const cols = CSV_COLUMNS.map(stagingColumn);
  const u1 = "00000000-0000-4000-8000-0000000000a1";
  const u2 = "00000000-0000-4000-8000-0000000000a2";
  const values = parsed.data
    .map((r, i) => `('${u1}', ${i + 1}, ${CSV_COLUMNS.map((c) => q(r[c])).join(", ")})`)
    .join(",\n");

  return `
begin;
-- isolate the sample's store/day inside this transaction
delete from public.rider_day_stats where store_code = 'TDE1' and business_date = '2026-10-15';
delete from public.orders where store_code = 'TDE1' and business_date = '2026-10-15';

insert into public.uploads (id, source, file_name) values ('${u1}', 'manual', 'test-run-1'), ('${u2}', 'manual', 'test-run-2');
insert into public.staging_orders (upload_id, row_num, ${cols.join(", ")}) values
${values};
-- the same file a second time
insert into public.staging_orders (upload_id, row_num, ${cols.join(", ")})
select '${u2}', row_num, ${cols.join(", ")} from public.staging_orders where upload_id = '${u1}';

create temp table t_first on commit drop as select public.process_upload('${u1}') as s;
create temp table t_counts_after_first on commit drop as
  select (select count(*) from public.orders where store_code = 'TDE1' and business_date = '2026-10-15') as orders,
         (select sum(orders) from public.rider_day_stats where store_code = 'TDE1' and business_date = '2026-10-15') as stats_orders;
create temp table t_second on commit drop as select public.process_upload('${u2}') as s;

with o as (select * from public.orders where store_code = 'TDE1' and business_date = '2026-10-15'),
     s as (select * from public.rider_day_stats where store_code = 'TDE1' and business_date = '2026-10-15')
select jsonb_build_object(
  'first',  (select s from t_first),
  'second', (select s from t_second),
  'after_first', (select to_jsonb(t_counts_after_first) from t_counts_after_first),
  'orders',       (select count(*) from o),
  'with_rider',   (select count(*) from o where rider_id is not null),
  'riders',       (select count(distinct rider_id) from o),
  'bto',          (select sum(bto_flag) from o),
  's2p_n',        (select count(s2p_min) from o),
  's2p_mean',     (select round(avg(s2p_min), 3) from o),
  's2p_median',   (select round((percentile_cont(0.5) within group (order by s2p_min))::numeric, 3) from o where s2p_min is not null),
  's2p_max',      (select round(max(s2p_min), 3) from o),
  's2p_negative', (select count(*) from o where s2p_min < 0),
  'stats_orders', (select sum(orders) from s),
  'stats_bto',    (select sum(bto_count) from s),
  'stats_mean',   (select round(sum(s2p_sum_min) / nullif(sum(s2p_count), 0), 3) from s),
  'staging_left', (select count(*) from public.staging_orders where upload_id in ('${u1}', '${u2}')),
  'named', (
    select jsonb_object_agg(r.rider_key, jsonb_build_object(
      'orders', s.orders, 'bto', s.bto_count, 'avg_s2p', round(s.s2p_sum_min / nullif(s.s2p_count, 0), 3)))
    from s join public.riders r on r.id = s.rider_id
    where r.rider_key in ('amit rawat|1299', 'chandan kumar|0104', 'deepak|9315', 'pawan|3253', 'prince sharma|2226')
  )
) as result;
rollback;
`;
}

function runLinked(sql: string): Record<string, unknown> {
  const dir = mkdtempSync(join(tmpdir(), "pu-test-"));
  const file = join(dir, "test.sql");
  writeFileSync(file, sql, "utf8");
  try {
    const out = execSync(`npx supabase db query --linked -f "${file}"`, {
      cwd: REPO,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 64 * 1024 * 1024,
    });
    const json = JSON.parse(out.slice(out.indexOf("{")));
    return json.rows[0].result;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe.skipIf(!runDb || !existsSync(SAMPLE))("process_upload on the sample CSV (rolled back)", () => {
  // Typed loosely on purpose: this is JSON straight from Postgres.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let r: any;

  it("runs both loads in one rolled-back transaction", () => {
    r = runLinked(buildSql());
    expect(r.first.status).toBe("done");
    expect(r.second.status).toBe("done");
  });

  it("matches the Phase 1 acceptance numbers", () => {
    expect(r.first.rows_total).toBe(506);
    expect(r.first.stores_in_file).toEqual(["TDE1"]);
    expect(r.first.dates_affected).toEqual(["2026-10-15"]);
    expect(r.orders).toBe(506);
    expect(r.with_rider).toBe(504);
    expect(r.riders).toBe(47);
    expect(r.bto).toBe(13);
    expect(r.s2p_n).toBe(503);
    expect(Number(r.s2p_mean)).toBe(0.614);
    expect(Number(r.s2p_median)).toBe(0.483);
    expect(Number(r.s2p_max)).toBe(7.1);
    expect(r.s2p_negative).toBe(0);
    expect(r.first.s2p_negative_count).toBe(0);
  });

  it("matches the five named riders", () => {
    expect(r.named["amit rawat|1299"]).toEqual({ orders: 17, bto: 0, avg_s2p: 0.383 });
    expect(r.named["chandan kumar|0104"]).toEqual({ orders: 17, bto: 1, avg_s2p: 0.743 });
    expect(r.named["deepak|9315"]).toEqual({ orders: 17, bto: 0, avg_s2p: 0.623 });
    expect(r.named["pawan|3253"]).toEqual({ orders: 17, bto: 1, avg_s2p: 0.497 });
    expect(r.named["prince sharma|2226"]).toEqual({ orders: 17, bto: 0, avg_s2p: 0.66 });
  });

  it("keeps rider_day_stats consistent with orders (sums, not averages)", () => {
    expect(Number(r.stats_orders)).toBe(506);
    expect(Number(r.stats_bto)).toBe(13);
    expect(Number(r.stats_mean)).toBe(0.614);
  });

  it("creates no duplicates when the same file is loaded again", () => {
    expect(r.first.rows_inserted).toBe(506);
    expect(r.second.rows_inserted).toBe(0);
    expect(r.second.rows_updated).toBe(506);
    expect(r.second.new_riders_count).toBe(0);
    expect(Number(r.after_first.orders)).toBe(506);
    expect(Number(r.after_first.stats_orders)).toBe(506);
    expect(r.orders).toBe(506);
  });

  it("clears staging rows after processing", () => {
    expect(r.staging_left).toBe(0);
  });
});
