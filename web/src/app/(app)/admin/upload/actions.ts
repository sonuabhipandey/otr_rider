"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { authorize, NOT_ALLOWED, type ActionResult } from "@/lib/auth";
import { failUpload, processStoredUpload, storagePathFor, type UploadSummary } from "@/lib/ingest/process";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Step 1: creates the uploads row. The browser then uploads the gzipped file to the returned path. */
export async function startManualUpload(input: {
  fileName: unknown;
  sizeBytes: unknown;
}): Promise<ActionResult<{ uploadId: string; path: string }>> {
  const actor = await authorize(["superadmin", "admin"]);
  if (!actor) return { ok: false, error: NOT_ALLOWED };

  const fileName = typeof input.fileName === "string" ? input.fileName.slice(0, 200) : "";
  const size = typeof input.sizeBytes === "number" ? input.sizeBytes : NaN;
  if (!fileName.toLowerCase().endsWith(".csv")) return { ok: false, error: "Choose a .csv file." };
  if (!(size > 0 && size <= MAX_FILE_BYTES)) return { ok: false, error: "The file must be under 25 MB." };

  const uploadId = randomUUID();
  const path = storagePathFor(uploadId);
  const { error } = await createAdminClient().from("uploads").insert({
    id: uploadId,
    source: "manual",
    uploaded_by: actor.id,
    file_name: fileName,
    storage_path: path,
  });
  if (error) return { ok: false, error: "Could not start the upload." };
  return { ok: true, data: { uploadId, path } };
}

/** Only the person who started a manual upload may finish or abandon it. */
async function ownUpload(uploadId: unknown) {
  const actor = await authorize(["superadmin", "admin"]);
  if (!actor || typeof uploadId !== "string" || !UUID_RE.test(uploadId)) return null;
  const { data } = await createAdminClient()
    .from("uploads")
    .select("id, source, uploaded_by, status")
    .eq("id", uploadId)
    .maybeSingle();
  if (!data || data.source !== "manual" || data.uploaded_by !== actor.id) return null;
  return data;
}

/** Step 2: the file is in Storage; stage and process it. */
export async function processManualUpload(uploadId: unknown): Promise<ActionResult<UploadSummary>> {
  const upload = await ownUpload(uploadId);
  if (!upload) return { ok: false, error: NOT_ALLOWED };

  const summary = await processStoredUpload(upload.id);
  revalidatePath("/admin/uploads");
  return summary.status === "done"
    ? { ok: true, data: summary }
    : { ok: false, error: summary.error ?? "Processing failed." };
}

/** Called by the browser if the Storage upload itself failed. */
export async function abandonManualUpload(uploadId: unknown, reason: unknown): Promise<ActionResult> {
  const upload = await ownUpload(uploadId);
  if (!upload) return { ok: false, error: NOT_ALLOWED };
  const message = typeof reason === "string" && reason ? reason.slice(0, 500) : "Upload to storage failed.";
  await failUpload(upload.id, `File upload failed: ${message}`);
  revalidatePath("/admin/uploads");
  return { ok: true, data: null };
}
