"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { authorize, NOT_ALLOWED, type ActionResult } from "@/lib/auth";
import { deleteStoredFiles } from "@/lib/ingest/files";
import { RAW_BUCKET } from "@/lib/ingest/process";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Admins and superadmins: a short-lived link to the stored (gzipped) file while it still exists. */
export async function getDownloadUrl(uploadId: unknown): Promise<ActionResult<{ url: string }>> {
  const actor = await authorize(["superadmin", "admin"]);
  if (!actor) return { ok: false, error: NOT_ALLOWED };
  if (typeof uploadId !== "string" || !UUID_RE.test(uploadId)) return { ok: false, error: "Upload not found." };

  const admin = createAdminClient();
  const { data: upload } = await admin
    .from("uploads")
    .select("id, file_name, storage_path, file_deleted_at")
    .eq("id", uploadId)
    .maybeSingle();
  if (!upload?.storage_path || upload.file_deleted_at) return { ok: false, error: "This file has been deleted." };

  const downloadName = `${(upload.file_name ?? upload.id).replace(/\.csv$/i, "")}.csv.gz`;
  const { data, error } = await admin.storage
    .from(RAW_BUCKET)
    .createSignedUrl(upload.storage_path, 60, { download: downloadName });
  if (error || !data) return { ok: false, error: "The file could not be found in storage." };

  await audit(actor.id, "file.downloaded", upload.id, { file_name: upload.file_name });
  return { ok: true, data: { url: data.signedUrl } };
}

/** Superadmins only: removes one raw file from Storage. Orders and stats are untouched. */
export async function deleteFile(uploadId: unknown): Promise<ActionResult> {
  const actor = await authorize(["superadmin"]);
  if (!actor) return { ok: false, error: NOT_ALLOWED };
  if (typeof uploadId !== "string" || !UUID_RE.test(uploadId)) return { ok: false, error: "Upload not found." };

  try {
    const n = await deleteStoredFiles([uploadId], actor.id);
    if (n === 0) return { ok: false, error: "This file was already deleted." };
  } catch {
    return { ok: false, error: "Could not delete the file." };
  }
  await audit(actor.id, "file.deleted", uploadId);
  revalidatePath("/admin/uploads");
  return { ok: true, data: null };
}

/** Superadmins only: removes every raw file still in Storage. Orders and stats are untouched. */
export async function deleteAllFiles(): Promise<ActionResult<{ count: number }>> {
  const actor = await authorize(["superadmin"]);
  if (!actor) return { ok: false, error: NOT_ALLOWED };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("uploads")
    .select("id")
    .is("file_deleted_at", null)
    .not("storage_path", "is", null);
  if (error) return { ok: false, error: "Could not list stored files." };

  let count: number;
  try {
    count = await deleteStoredFiles(
      data.map((u) => u.id),
      actor.id,
    );
  } catch {
    return { ok: false, error: "Could not delete all files. Some may remain; try again." };
  }
  await audit(actor.id, "files.deleted_all", null, { count });
  revalidatePath("/admin/uploads");
  return { ok: true, data: { count } };
}
