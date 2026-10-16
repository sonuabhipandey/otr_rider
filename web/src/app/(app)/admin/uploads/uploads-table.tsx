"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { DownloadIcon, Trash2Icon, UploadIcon } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime, formatNumber } from "@/lib/format";
import { deleteAllFiles, deleteFile, getDownloadUrl } from "./actions";

export type UploadRow = {
  id: string;
  createdAt: string;
  by: string;
  source: "manual" | "automation";
  fileName: string | null;
  rowsTotal: number | null;
  rowsInserted: number | null;
  rowsUpdated: number | null;
  rowsRejected: number | null;
  dateMin: string | null;
  dateMax: string | null;
  stores: string[];
  status: "processing" | "done" | "failed";
  error: string | null;
  fileStored: boolean;
  fileDeletedAt: string | null;
  fileDeletedBy: string | null;
  fileExpiresAt: string;
};

const dateOnly = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function dates(r: UploadRow) {
  if (!r.dateMin) return "—";
  return r.dateMin === r.dateMax ? r.dateMin : `${r.dateMin} → ${r.dateMax}`;
}

function StatusBadge({ r }: { r: UploadRow }) {
  if (r.status === "failed") return <Badge variant="destructive">Failed</Badge>;
  if (r.status === "processing") return <Badge variant="secondary">Processing</Badge>;
  return <Badge variant="outline">Done</Badge>;
}

function FileStatus({ r }: { r: UploadRow }) {
  if (r.fileStored) {
    return <span>Stored, auto-deletes on {dateOnly.format(new Date(r.fileExpiresAt))}</span>;
  }
  if (r.fileDeletedAt) {
    return (
      <span className="text-muted-foreground">
        Deleted {dateOnly.format(new Date(r.fileDeletedAt))}
        {r.fileDeletedBy === "auto" ? " (auto)" : r.fileDeletedBy ? ` by ${r.fileDeletedBy}` : ""}
      </span>
    );
  }
  return <span className="text-muted-foreground">No file</span>;
}

type Confirm = { kind: "one"; row: UploadRow } | { kind: "all" };

export function UploadsTable({
  rows,
  canDelete,
  storedCount,
  limited,
}: {
  rows: UploadRow[];
  canDelete: boolean;
  storedCount: number;
  limited: boolean;
}) {
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [busy, startTransition] = useTransition();

  function download(r: UploadRow) {
    startTransition(async () => {
      const res = await getDownloadUrl(r.id);
      if (!res.ok) return void toast.error(res.error);
      window.location.href = res.data.url;
    });
  }

  function runDelete() {
    if (!confirm) return;
    const c = confirm;
    startTransition(async () => {
      if (c.kind === "one") {
        const res = await deleteFile(c.row.id);
        setConfirm(null);
        if (!res.ok) return void toast.error(res.error);
        toast.success("File deleted. Processed data is unchanged.");
      } else {
        const res = await deleteAllFiles();
        setConfirm(null);
        if (!res.ok) return void toast.error(res.error);
        toast.success(`${formatNumber(res.data.count)} file(s) deleted. Processed data is unchanged.`);
      }
    });
  }

  function FileActions({ r }: { r: UploadRow }) {
    if (!r.fileStored) return null;
    return (
      <div className="flex gap-1">
        <Button variant="ghost" size="icon-sm" onClick={() => download(r)} disabled={busy} aria-label="Download file">
          <DownloadIcon />
        </Button>
        {canDelete && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setConfirm({ kind: "one", row: r })}
            disabled={busy}
            aria-label="Delete file"
          >
            <Trash2Icon />
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Upload history</h1>
          <p className="text-sm text-muted-foreground">
            Raw CSV files are kept for 7 days. Deleting a file never changes the processed orders or stats.
            {limited && " Showing the latest 200 uploads."}
          </p>
        </div>
        <div className="flex gap-2">
          {canDelete && (
            <Button
              variant="outline"
              onClick={() => setConfirm({ kind: "all" })}
              disabled={busy || storedCount === 0}
            >
              <Trash2Icon />
              Delete all stored CSV files
            </Button>
          )}
          <Button nativeButton={false} render={<Link href="/admin/upload" />}>
            <UploadIcon />
            Upload
          </Button>
        </div>
      </div>

      {rows.length === 0 && <p className="text-sm text-muted-foreground">No uploads yet.</p>}

      {/* Desktop */}
      {rows.length > 0 && (
        <div className="hidden rounded-lg border md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>By</TableHead>
                <TableHead>File</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">New</TableHead>
                <TableHead className="text-right">Updated</TableHead>
                <TableHead className="text-right">Rejected</TableHead>
                <TableHead>Business dates</TableHead>
                <TableHead>Stores</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>File status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} className={r.status === "failed" ? "bg-destructive/10 hover:bg-destructive/15" : undefined}>
                  <TableCell className="whitespace-nowrap">{formatDateTime(r.createdAt)}</TableCell>
                  <TableCell>
                    {r.by}
                    <span className="block text-xs text-muted-foreground">{r.source}</span>
                  </TableCell>
                  <TableCell className="max-w-48 truncate" title={r.fileName ?? undefined}>
                    {r.fileName ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(r.rowsTotal)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(r.rowsInserted)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(r.rowsUpdated)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(r.rowsRejected)}</TableCell>
                  <TableCell className="whitespace-nowrap">{dates(r)}</TableCell>
                  <TableCell className="max-w-40 truncate" title={r.stores.join(", ")}>
                    {r.stores.join(", ") || "—"}
                  </TableCell>
                  <TableCell className="max-w-64">
                    <StatusBadge r={r} />
                    {r.error && <p className="mt-1 text-xs whitespace-normal text-destructive">{r.error}</p>}
                  </TableCell>
                  <TableCell className="text-xs">
                    <FileStatus r={r} />
                  </TableCell>
                  <TableCell>
                    <FileActions r={r} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Mobile */}
      <ul className="grid gap-2 md:hidden">
        {rows.map((r) => (
          <li key={r.id} className={`rounded-lg border p-3 ${r.status === "failed" ? "border-destructive/40 bg-destructive/10" : ""}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium">{r.fileName ?? "—"}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDateTime(r.createdAt)} · {r.by}
                </p>
              </div>
              <StatusBadge r={r} />
            </div>
            {r.error && <p className="mt-2 text-xs text-destructive">{r.error}</p>}
            <dl className="mt-2 grid grid-cols-4 gap-1 text-xs">
              {(
                [
                  ["Total", r.rowsTotal],
                  ["New", r.rowsInserted],
                  ["Updated", r.rowsUpdated],
                  ["Rejected", r.rowsRejected],
                ] as const
              ).map(([label, v]) => (
                <div key={label}>
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="tabular-nums">{formatNumber(v)}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-xs">
              {dates(r)}
              {r.stores.length ? ` · ${r.stores.join(", ")}` : ""}
            </p>
            <div className="mt-2 flex items-center justify-between gap-2 text-xs">
              <FileStatus r={r} />
              <FileActions r={r} />
            </div>
          </li>
        ))}
      </ul>

      <AlertDialog open={!!confirm} onOpenChange={(open) => !open && !busy && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === "all"
                ? `Delete all ${formatNumber(storedCount)} stored CSV file(s)?`
                : `Delete ${confirm?.kind === "one" ? (confirm.row.fileName ?? "this file") : ""}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              The raw file is removed from storage and can no longer be downloaded. All processed orders and rider
              stats stay exactly as they are.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <Button variant="destructive" onClick={runDelete} disabled={busy}>
              {busy ? "Deleting…" : "Delete"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
