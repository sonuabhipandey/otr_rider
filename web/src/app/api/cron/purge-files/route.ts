import { audit } from "@/lib/audit";
import { hasBearer, unauthorized } from "@/lib/bearer";
import { deleteStoredFiles, expiredFileUploadIds } from "@/lib/ingest/files";
import { failUpload } from "@/lib/ingest/process";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;

// Daily Vercel Cron (see vercel.json). Vercel sends "Authorization: Bearer $CRON_SECRET".
// 1. Deletes raw CSV files older than 7 days from Storage (processed data is untouched).
// 2. Marks uploads stuck in "processing" for over a day as failed (e.g. a browser closed mid-upload).
export async function GET(request: Request) {
  if (!hasBearer(request, process.env.CRON_SECRET)) return unauthorized();

  const expired = await expiredFileUploadIds();
  const filesDeleted = await deleteStoredFiles(expired, null);
  if (filesDeleted > 0) await audit(null, "files.auto_deleted", null, { count: filesDeleted });

  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  const { data: stuck } = await createAdminClient()
    .from("uploads")
    .select("id")
    .eq("status", "processing")
    .lt("created_at", dayAgo);
  for (const u of stuck ?? []) await failUpload(u.id, "Abandoned: the upload never finished processing.");

  return Response.json({ files_deleted: filesDeleted, stuck_uploads_failed: stuck?.length ?? 0 });
}
