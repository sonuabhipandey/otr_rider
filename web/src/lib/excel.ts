// Client-side .xlsx export (SheetJS). Exports exactly the rows the page is showing for the current filters.
// The first sheet always lists the filters applied.

export type SheetData = { name: string; rows: Record<string, string | number | null>[] };

export type ExportFilters = { stores: string; dates: string; search: string };

export async function downloadXlsx(fileName: string, filters: ExportFilters, sheets: SheetData[]) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();

  const exportedAt = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date());
  const filterRows = [
    { Filter: "Stores", Value: filters.stores },
    { Filter: "Business dates", Value: filters.dates },
    { Filter: "Rider search", Value: filters.search || "(none)" },
    { Filter: "Business day", Value: "6:00 AM to 6:00 AM IST" },
    { Filter: "Exported (IST)", Value: exportedAt },
  ];
  XLSX.utils.book_append_sheet(wb, withWidths(XLSX.utils.json_to_sheet(filterRows), filterRows), "Filters");

  const used = new Set<string>(["Filters"]);
  for (const sheet of sheets) {
    // Excel sheet names: max 31 chars, no []:*?/\ and unique.
    let name = sheet.name.replace(/[[\]:*?/\\]/g, " ").slice(0, 31) || "Sheet";
    for (let i = 2; used.has(name); i++) name = `${name.slice(0, 28)} ${i}`;
    used.add(name);
    const ws = sheet.rows.length
      ? XLSX.utils.json_to_sheet(sheet.rows)
      : XLSX.utils.aoa_to_sheet([["No data for these filters"]]);
    XLSX.utils.book_append_sheet(wb, withWidths(ws, sheet.rows), name);
  }

  XLSX.writeFile(wb, fileName, { compression: true });
}

// Column widths from the longest value in each column (capped), so the file opens readable.
function withWidths<T extends import("xlsx").WorkSheet>(ws: T, rows: Record<string, unknown>[]): T {
  if (!rows.length) return ws;
  const keys = Object.keys(rows[0]);
  ws["!cols"] = keys.map((k) => ({
    wch: Math.min(48, Math.max(k.length, ...rows.slice(0, 500).map((r) => String(r[k] ?? "").length)) + 2),
  }));
  return ws;
}
