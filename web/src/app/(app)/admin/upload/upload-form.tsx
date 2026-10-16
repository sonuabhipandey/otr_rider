"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { FileUpIcon, Loader2Icon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber } from "@/lib/format";
import type { UploadSummary } from "@/lib/ingest/process";
import { createClient } from "@/lib/supabase/client";
import { abandonManualUpload, processManualUpload, startManualUpload } from "./actions";
import { previewCsv, type CsvPreview } from "./preview";

const MAX_BYTES = 25 * 1024 * 1024;

type Stage =
  | { name: "idle" }
  | { name: "invalid"; error: string; missing?: string[]; extra?: string[] }
  | { name: "preview"; file: File; preview: CsvPreview }
  | { name: "working"; file: File; preview: CsvPreview; step: string }
  | { name: "done"; summary: UploadSummary }
  | { name: "failed"; error: string };

async function gzip(file: File): Promise<Blob> {
  return new Response(file.stream().pipeThrough(new CompressionStream("gzip"))).blob();
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium tabular-nums">{value}</p>
    </div>
  );
}

export function UploadForm() {
  const [stage, setStage] = useState<Stage>({ name: "idle" });
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = stage.name === "working";

  async function choose(file: File | undefined) {
    if (!file || busy) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      return setStage({ name: "invalid", error: "Choose a .csv file exported from LoadShare." });
    }
    if (file.size > MAX_BYTES) {
      return setStage({ name: "invalid", error: `The file is ${(file.size / 1048576).toFixed(1)} MB; the limit is 25 MB.` });
    }
    const result = await previewCsv(file);
    setStage(result.ok ? { name: "preview", file, preview: result.preview } : { name: "invalid", ...result });
  }

  async function confirm() {
    if (stage.name !== "preview") return;
    const { file, preview } = stage;
    const step = (s: string) => setStage({ name: "working", file, preview, step: s });

    step("Starting upload…");
    const started = await startManualUpload({ fileName: file.name, sizeBytes: file.size });
    if (!started.ok) return setStage({ name: "failed", error: started.error });
    const { uploadId, path } = started.data;

    step("Compressing and uploading the file…");
    try {
      const body = await gzip(file);
      const { error } = await createClient()
        .storage.from("raw-csv")
        .upload(path, body, { contentType: "application/gzip", upsert: false });
      if (error) throw new Error(error.message);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await abandonManualUpload(uploadId, message);
      return setStage({ name: "failed", error: `Uploading the file failed: ${message}` });
    }

    step(`Processing ${formatNumber(preview.rows)} rows…`);
    const processed = await processManualUpload(uploadId);
    setStage(processed.ok ? { name: "done", summary: processed.data } : { name: "failed", error: processed.error });
  }

  function reset() {
    setStage({ name: "idle" });
    if (inputRef.current) inputRef.current.value = "";
  }

  if (stage.name === "done") {
    const s = stage.summary;
    return (
      <Card>
        <CardHeader>
          <CardTitle>Upload processed</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Rows in file" value={formatNumber(s.rows_total)} />
            <Stat label="New orders" value={formatNumber(s.rows_inserted)} />
            <Stat label="Updated orders" value={formatNumber(s.rows_updated)} />
            <Stat label="Rejected rows" value={formatNumber(s.rows_rejected)} />
            <Stat label="New riders" value={formatNumber(s.new_riders_count)} />
            <Stat label="Rows without rider" value={formatNumber(s.rows_without_rider)} />
            <Stat label="Duplicate rows in file" value={formatNumber(s.rows_duplicate)} />
            <Stat label="Negative S2P" value={formatNumber(s.s2p_negative_count)} />
          </div>
          <p className="text-sm">
            <span className="text-muted-foreground">Business dates affected: </span>
            {s.dates_affected?.length ? s.dates_affected.join(", ") : "none"}
            <span className="text-muted-foreground"> · Stores: </span>
            {s.stores_in_file?.length ? s.stores_in_file.join(", ") : "none"}
          </p>
          {(s.rows_rejected ?? 0) > 0 && (
            <Alert>
              <AlertDescription>
                Rejected rows had a blank Order ID or a Created At that could not be read. They were skipped.
              </AlertDescription>
            </Alert>
          )}
          <div className="flex flex-wrap gap-2">
            <Button onClick={reset}>Upload another file</Button>
            <Button variant="outline" render={<Link href="/admin/uploads" />}>
              Upload history
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          choose(e.dataTransfer.files[0]);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
          dragging ? "border-primary bg-muted" : "border-border hover:bg-muted/50"
        } ${busy ? "pointer-events-none opacity-60" : ""}`}
      >
        <FileUpIcon className="size-8 text-muted-foreground" />
        <span className="font-medium">Drop the LoadShare CSV here, or click to choose</span>
        <span className="text-xs text-muted-foreground">One file, up to 25 MB. Any past date is fine.</span>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          disabled={busy}
          onChange={(e) => choose(e.target.files?.[0])}
        />
      </label>

      {stage.name === "invalid" && (
        <Alert variant="destructive">
          <AlertTitle>{stage.error}</AlertTitle>
          {(stage.missing?.length || stage.extra?.length) && (
            <AlertDescription>
              {stage.missing?.length ? <p>Missing columns: {stage.missing.join(", ")}</p> : null}
              {stage.extra?.length ? <p>Unexpected columns: {stage.extra.join(", ")}</p> : null}
            </AlertDescription>
          )}
        </Alert>
      )}

      {stage.name === "failed" && (
        <Alert variant="destructive">
          <AlertTitle>The upload failed</AlertTitle>
          <AlertDescription>{stage.error}</AlertDescription>
        </Alert>
      )}

      {(stage.name === "preview" || stage.name === "working") && (
        <Card>
          <CardHeader>
            <CardTitle className="truncate">{stage.file.name}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Rows" value={formatNumber(stage.preview.rows)} />
              <Stat label="Rows without rider" value={formatNumber(stage.preview.rowsWithoutRider)} />
              <Stat label="Created from" value={stage.preview.createdFrom ?? "—"} />
              <Stat label="Created to" value={stage.preview.createdTo ?? "—"} />
            </div>
            <p className="text-sm">
              <span className="text-muted-foreground">Stores in file: </span>
              {stage.preview.stores.length ? stage.preview.stores.join(", ") : "none found"}
            </p>
            <p className="text-xs text-muted-foreground">
              Preview only. Re-uploading a file never creates duplicates: existing orders are updated.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={confirm} disabled={busy}>
                {busy ? <Loader2Icon className="animate-spin" /> : null}
                {busy ? stage.step : "Upload and process"}
              </Button>
              <Button variant="outline" onClick={reset} disabled={busy}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
