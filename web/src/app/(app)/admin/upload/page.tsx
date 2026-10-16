import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { UploadForm } from "./upload-form";

export const metadata: Metadata = { title: "Upload · FastBeetle Riders" };
// Processing a full day (~11,000 rows) runs inside the server action on this page.
export const maxDuration = 300;

export default async function UploadPage() {
  // Admins and superadmins (every active role) may upload.
  await requireUser();
  return (
    <div className="grid max-w-3xl gap-4">
      <div>
        <h1 className="text-xl font-semibold">Upload orders CSV</h1>
        <p className="text-sm text-muted-foreground">
          The control-tower export with all 29 columns. The file is checked and previewed before anything is saved.
        </p>
      </div>
      <UploadForm />
    </div>
  );
}
