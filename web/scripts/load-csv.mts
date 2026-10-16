// Dev/test loader: pushes a local CSV through staging_orders + process_upload, the same path the app uses.
// Usage (from /web):  node --env-file=.env.local scripts/load-csv.mts <path-to.csv>
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import Papa from "papaparse";
import { createClient } from "@supabase/supabase-js";
import { checkHeader, toStagingRow, STAGING_CHUNK_SIZE } from "../src/lib/ingest/csv-columns.ts";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node --env-file=.env.local scripts/load-csv.mts <path-to.csv>");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in web/.env.local");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

const parsed = Papa.parse<Record<string, string>>(readFileSync(file, "utf8"), {
  header: true,
  skipEmptyLines: true,
});
const { missing, extra } = checkHeader(parsed.meta.fields ?? []);
if (missing.length || extra.length) {
  console.error("Header mismatch.", { missing, extra });
  process.exit(1);
}

const { data: upload, error: uploadErr } = await supabase
  .from("uploads")
  .insert({ source: "manual", file_name: basename(file) })
  .select("id")
  .single();
if (uploadErr) throw uploadErr;
console.log(`upload ${upload.id}: staging ${parsed.data.length} rows`);

const rows = parsed.data.map((rec, i) => toStagingRow(rec, upload.id, i + 1));
for (let i = 0; i < rows.length; i += STAGING_CHUNK_SIZE) {
  const { error } = await supabase.from("staging_orders").insert(rows.slice(i, i + STAGING_CHUNK_SIZE));
  if (error) throw error;
}

const started = Date.now();
const { data: summary, error: rpcErr } = await supabase.rpc("process_upload", { p_upload_id: upload.id });
if (rpcErr) throw rpcErr;
console.log(`process_upload took ${Date.now() - started} ms`);
console.log(JSON.stringify(summary, null, 2));
