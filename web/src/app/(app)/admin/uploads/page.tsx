import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { fileExpiresAt } from "@/lib/ingest/files";
import { createAdminClient } from "@/lib/supabase/admin";
import { UploadsTable, type UploadRow } from "./uploads-table";

export const metadata: Metadata = { title: "Upload history · FastBeetle Riders" };

const LIMIT = 200;

export default async function UploadsPage() {
  const me = await requireUser();
  const admin = createAdminClient();

  const [{ data: uploads, error }, { data: profiles }] = await Promise.all([
    admin
      .from("uploads")
      .select(
        "id, source, uploaded_by, file_name, storage_path, rows_total, rows_inserted, rows_updated, rows_rejected, " +
          "business_date_min, business_date_max, stores_in_file, status, error, created_at, file_deleted_at, file_deleted_by",
      )
      .order("created_at", { ascending: false })
      .limit(LIMIT)
      .returns<
        {
          id: string;
          source: "manual" | "automation";
          uploaded_by: string | null;
          file_name: string | null;
          storage_path: string | null;
          rows_total: number | null;
          rows_inserted: number | null;
          rows_updated: number | null;
          rows_rejected: number | null;
          business_date_min: string | null;
          business_date_max: string | null;
          stores_in_file: string[] | null;
          status: "processing" | "done" | "failed";
          error: string | null;
          created_at: string;
          file_deleted_at: string | null;
          file_deleted_by: string | null;
        }[]
      >(),
    admin.from("profiles").select("id, full_name, email"),
  ]);
  if (error) throw error;

  const name = new Map((profiles ?? []).map((p) => [p.id, p.full_name ?? p.email]));
  const rows: UploadRow[] = uploads.map((u) => ({
    id: u.id,
    createdAt: u.created_at,
    by: u.source === "automation" ? "Automation" : u.uploaded_by ? (name.get(u.uploaded_by) ?? "—") : "—",
    source: u.source,
    fileName: u.file_name,
    rowsTotal: u.rows_total,
    rowsInserted: u.rows_inserted,
    rowsUpdated: u.rows_updated,
    rowsRejected: u.rows_rejected,
    dateMin: u.business_date_min,
    dateMax: u.business_date_max,
    stores: u.stores_in_file ?? [],
    status: u.status,
    error: u.error,
    fileStored: !!u.storage_path && !u.file_deleted_at,
    fileDeletedAt: u.file_deleted_at,
    fileDeletedBy: u.file_deleted_at ? (u.file_deleted_by ? (name.get(u.file_deleted_by) ?? "—") : "auto") : null,
    fileExpiresAt: fileExpiresAt(u.created_at).toISOString(),
  }));

  return (
    <UploadsTable
      rows={rows}
      canDelete={me.role === "superadmin"}
      storedCount={rows.filter((r) => r.fileStored).length}
      limited={rows.length === LIMIT}
    />
  );
}
