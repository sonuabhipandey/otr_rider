import { randomUUID } from "node:crypto";
import { hasBearer, unauthorized } from "@/lib/bearer";
import { RAW_BUCKET, storagePathFor } from "@/lib/ingest/process";
import { createAdminClient } from "@/lib/supabase/admin";

// POST /api/automation/upload-url  (Authorization: Bearer AUTOMATION_UPLOAD_KEY)
// Body (optional): { "file_name": "combined_2026-10-15.csv" }
// Returns { upload_id, signed_upload_url, storage_path }. PUT the gzipped CSV to signed_upload_url.
export async function POST(request: Request) {
  if (!hasBearer(request, process.env.AUTOMATION_UPLOAD_KEY)) return unauthorized();

  const body = (await request.json().catch(() => ({}))) as { file_name?: unknown };
  const fileName = typeof body.file_name === "string" ? body.file_name.slice(0, 200) : null;

  const admin = createAdminClient();
  const uploadId = randomUUID();
  const path = storagePathFor(uploadId);

  const { error } = await admin.from("uploads").insert({
    id: uploadId,
    source: "automation",
    uploaded_by: null,
    file_name: fileName,
    storage_path: path,
  });
  if (error) return Response.json({ error: "Could not create the upload." }, { status: 500 });

  const { data, error: signErr } = await admin.storage.from(RAW_BUCKET).createSignedUploadUrl(path);
  if (signErr || !data) {
    await admin
      .from("uploads")
      .update({ status: "failed", error: "Could not create a signed upload URL." })
      .eq("id", uploadId);
    return Response.json({ error: "Could not create a signed upload URL." }, { status: 500 });
  }

  return Response.json({ upload_id: uploadId, signed_upload_url: data.signedUrl, storage_path: path });
}
