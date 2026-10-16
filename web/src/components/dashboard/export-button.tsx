"use client";

import { useState } from "react";
import { FileSpreadsheetIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { downloadXlsx, type ExportFilters, type SheetData } from "@/lib/excel";

/** "Export to Excel". Page-level buttons pass every table/chart; table-level buttons pass one sheet. */
export function ExportButton({
  fileName,
  filters,
  sheets,
  label = "Export to Excel",
  size = "sm",
  variant = "outline",
}: {
  fileName: string;
  filters: ExportFilters;
  sheets: SheetData[];
  label?: string;
  size?: "sm" | "xs" | "default";
  variant?: "outline" | "ghost" | "default";
}) {
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      await downloadXlsx(fileName, filters, sheets);
    } catch (e) {
      toast.error(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant={variant} size={size} onClick={run} disabled={busy} title={fileName}>
      {busy ? <Loader2Icon className="animate-spin" /> : <FileSpreadsheetIcon />}
      <span className={label === "Export to Excel" ? "hidden sm:inline" : undefined}>{label}</span>
    </Button>
  );
}
