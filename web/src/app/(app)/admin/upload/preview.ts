// Client-side preview of a CSV before it is uploaded. DISPLAY ONLY: nothing computed here is stored.
// The authoritative parsing, store codes, rider detection and dates come from process_upload.
import Papa from "papaparse";
import { checkHeader } from "@/lib/ingest/csv-columns";

export type CsvPreview = {
  rows: number;
  createdFrom: string | null;
  createdTo: string | null;
  stores: string[];
  rowsWithoutRider: number;
};

export type PreviewResult =
  | { ok: true; preview: CsvPreview }
  | { ok: false; error: string; missing?: string[]; extra?: string[] };

const isBlank = (v: string | undefined) => {
  const t = (v ?? "").trim();
  return t === "" || t === "-" || t.toLowerCase() === "null";
};

export function previewCsv(file: File): Promise<PreviewResult> {
  return new Promise((resolve) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      complete: (result) => {
        const { missing, extra } = checkHeader(result.meta.fields ?? []);
        if (missing.length || extra.length) {
          resolve({ ok: false, error: "The header does not match the LoadShare export.", missing, extra });
          return;
        }
        let createdFrom: string | null = null;
        let createdTo: string | null = null;
        let rowsWithoutRider = 0;
        const stores = new Set<string>();
        for (const row of result.data) {
          const created = (row["Created At"] ?? "").trim();
          if (/^\d{4}-\d{2}-\d{2} /.test(created)) {
            if (!createdFrom || created < createdFrom) createdFrom = created;
            if (!createdTo || created > createdTo) createdTo = created;
          }
          const store = (row["Store Name"] ?? "").split("|")[0].trim();
          if (store) stores.add(store);
          if (isBlank(row["Rider Name"])) rowsWithoutRider++;
        }
        resolve({
          ok: true,
          preview: { rows: result.data.length, createdFrom, createdTo, stores: [...stores].sort(), rowsWithoutRider },
        });
      },
      error: (err) => resolve({ ok: false, error: `Could not read the file: ${err.message}` }),
    });
  });
}
