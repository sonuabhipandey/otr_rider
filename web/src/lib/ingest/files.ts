import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { FILE_RETENTION_DAYS, RAW_BUCKET } from "./process";

// Raw CSV files live in Storage for FILE_RETENTION_DAYS. Deleting a file never touches orders or stats.

const BATCH = 100;

/**
 * Removes the stored files of the given uploads and stamps file_deleted_at.
 * actorId null = automatic deletion. Returns how many uploads were marked deleted.
 */
export async function deleteStoredFiles(uploadIds: string[], actorId: string | null): Promise<number> {
  if (uploadIds.length === 0) return 0;
  const admin = createAdminClient();

  const { data: uploads, error } = await admin
    .from("uploads")
    .select("id, storage_path")
    .in("id", uploadIds)
    .is("file_deleted_at", null);
  if (error) throw error;

  let deleted = 0;
  for (let i = 0; i < uploads.length; i += BATCH) {
    const batch = uploads.slice(i, i + BATCH);
    const paths = batch.map((u) => u.storage_path).filter((p): p is string => !!p);
    if (paths.length) {
      // Missing objects are ignored by Storage, so a file that never finished uploading is fine here.
      const { error: rmErr } = await admin.storage.from(RAW_BUCKET).remove(paths);
      if (rmErr) throw rmErr;
    }
    const { error: updErr } = await admin
      .from("uploads")
      .update({ file_deleted_at: new Date().toISOString(), file_deleted_by: actorId })
      .in(
        "id",
        batch.map((u) => u.id),
      );
    if (updErr) throw updErr;
    deleted += batch.length;
  }
  return deleted;
}

/** Upload ids whose file is still stored and older than the retention window. */
export async function expiredFileUploadIds(): Promise<string[]> {
  const cutoff = new Date(Date.now() - FILE_RETENTION_DAYS * 86_400_000).toISOString();
  const { data, error } = await createAdminClient()
    .from("uploads")
    .select("id")
    .is("file_deleted_at", null)
    .not("storage_path", "is", null)
    .lt("created_at", cutoff);
  if (error) throw error;
  return data.map((u) => u.id);
}

export function fileExpiresAt(createdAt: string): Date {
  return new Date(new Date(createdAt).getTime() + FILE_RETENTION_DAYS * 86_400_000);
}
