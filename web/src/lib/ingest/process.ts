import "server-only";
import { gunzipSync } from "node:zlib";
import Papa from "papaparse";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkHeader, STAGING_CHUNK_SIZE, toStagingRow } from "./csv-columns";

// The one server-side processing path for both manual and automation uploads:
// Storage file -> papaparse -> staging_orders (chunks of 1,000) -> public.process_upload().
// All parsing rules and helper columns live in process_upload, not here.

export const RAW_BUCKET = "raw-csv";
export const FILE_RETENTION_DAYS = 7;
const STAGING_CONCURRENCY = 3;

export type UploadSummary = {
  upload_id: string;
  status: "done" | "failed";
  error?: string;
  rows_total?: number;
  rows_inserted?: number;
  rows_updated?: number;
  rows_rejected?: number;
  rows_duplicate?: number;
  rows_without_rider?: number;
  s2p_negative_count?: number;
  new_riders_count?: number;
  business_date_min?: string | null;
  business_date_max?: string | null;
  dates_affected?: string[];
  stores_in_file?: string[];
};

export function storagePathFor(uploadId: string) {
  return `incoming/${uploadId}.csv.gz`;
}

/** Marks an upload failed before process_upload ran (which records its own failures), and audits it. */
export async function failUpload(uploadId: string, error: string): Promise<UploadSummary> {
  const admin = createAdminClient();
  await admin.from("staging_orders").delete().eq("upload_id", uploadId);
  const { data } = await admin
    .from("uploads")
    .update({ status: "failed", error, processed_at: new Date().toISOString() })
    .eq("id", uploadId)
    .eq("status", "processing")
    .select("uploaded_by")
    .maybeSingle();
  if (data) {
    await admin
      .from("audit_log")
      .insert({ actor_id: data.uploaded_by, action: "upload.failed", target: uploadId, details: { error } });
  }
  return { upload_id: uploadId, status: "failed", error };
}
const fail = failUpload;

/** Processes an upload whose file is already in Storage. Never throws; failures are recorded on the upload. */
export async function processStoredUpload(uploadId: string): Promise<UploadSummary> {
  const admin = createAdminClient();

  const { data: upload, error: loadErr } = await admin
    .from("uploads")
    .select("id, status, storage_path, file_deleted_at")
    .eq("id", uploadId)
    .maybeSingle();
  if (loadErr || !upload) return { upload_id: uploadId, status: "failed", error: "Upload not found." };
  if (upload.status !== "processing") {
    return { upload_id: uploadId, status: "failed", error: `This upload is already ${upload.status}.` };
  }
  if (!upload.storage_path || upload.file_deleted_at) return fail(uploadId, "The upload has no stored file.");

  try {
    // 1. Read the file from Storage
    const { data: blob, error: dlErr } = await admin.storage.from(RAW_BUCKET).download(upload.storage_path);
    if (dlErr || !blob) return fail(uploadId, `Could not read the stored file: ${dlErr?.message ?? "missing"}`);
    let bytes = Buffer.from(await blob.arrayBuffer());
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) bytes = gunzipSync(bytes);
    const text = bytes.toString("utf8").replace(/^﻿/, "");

    // 2. Parse and check the header
    const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: "greedy" });
    const { missing, extra } = checkHeader(parsed.meta.fields ?? []);
    if (missing.length || extra.length) {
      const parts = [
        missing.length ? `missing columns: ${missing.join(", ")}` : "",
        extra.length ? `unexpected columns: ${extra.join(", ")}` : "",
      ].filter(Boolean);
      return fail(uploadId, `The CSV header does not match the LoadShare export (${parts.join("; ")}).`);
    }
    if (parsed.data.length === 0) return fail(uploadId, "The file has no data rows.");

    // 3. Stage the raw rows in chunks
    const rows = parsed.data.map((rec, i) => toStagingRow(rec, uploadId, i + 1));
    const chunks: (typeof rows)[] = [];
    for (let i = 0; i < rows.length; i += STAGING_CHUNK_SIZE) chunks.push(rows.slice(i, i + STAGING_CHUNK_SIZE));
    for (let i = 0; i < chunks.length; i += STAGING_CONCURRENCY) {
      const results = await Promise.all(
        chunks.slice(i, i + STAGING_CONCURRENCY).map((chunk) => admin.from("staging_orders").insert(chunk)),
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) return fail(uploadId, `Could not stage rows: ${failed.error.message}`);
    }

    // 4. Process in Postgres (single transaction; records its own failure)
    const { data: summary, error: rpcErr } = await admin.rpc("process_upload", { p_upload_id: uploadId });
    if (rpcErr) return fail(uploadId, `Processing failed: ${rpcErr.message}`);
    return summary as UploadSummary;
  } catch (e) {
    return fail(uploadId, e instanceof Error ? e.message : String(e));
  }
}
