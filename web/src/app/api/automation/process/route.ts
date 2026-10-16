import { hasBearer, unauthorized } from "@/lib/bearer";
import { processStoredUpload } from "@/lib/ingest/process";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/automation/process  (Authorization: Bearer AUTOMATION_UPLOAD_KEY)
// Body: { "upload_id": "<uuid from upload-url>" }
// Same processing path as the manual upload. 200 with the summary when done, 422 with it when failed.
export async function POST(request: Request) {
  if (!hasBearer(request, process.env.AUTOMATION_UPLOAD_KEY)) return unauthorized();

  const body = (await request.json().catch(() => ({}))) as { upload_id?: unknown };
  const uploadId = body.upload_id;
  if (typeof uploadId !== "string" || !UUID_RE.test(uploadId)) {
    return Response.json({ error: "upload_id is required." }, { status: 400 });
  }

  const { data: upload } = await createAdminClient()
    .from("uploads")
    .select("source")
    .eq("id", uploadId)
    .maybeSingle();
  if (!upload || upload.source !== "automation") {
    return Response.json({ error: "Unknown upload_id." }, { status: 404 });
  }

  const summary = await processStoredUpload(uploadId);
  return Response.json(summary, { status: summary.status === "done" ? 200 : 422 });
}
