// The LoadShare export header, exactly as it appears in the CSV, in order.
// Staging columns are the same names in snake_case (see stagingColumn).
// Parsing and helper-column logic live in Postgres (public.process_upload), never here.
export const CSV_COLUMNS = [
  "Rider Number",
  "Arrived Pickup At",
  "LM Distance",
  "Resting Point Name",
  "Total ETA",
  "Completed At",
  "Resting Point ID",
  "Store Name",
  "Pickup At",
  "Order ETA Status",
  "Staged At",
  "Pickup ETA",
  "Arrive at Pickup ETA",
  "Status Text",
  "Created At",
  "Status",
  "Rider Name",
  "Order ID",
  "Store ID",
  "Total Time",
  "Arrive at Delivery ETA",
  "Arrived Delivery At",
  "Tracking URL",
  "Customer ID",
  "RTO At",
  "FM Distance",
  "Assigned At",
  "Delivery ETA",
  "Batch ID",
] as const;

export type CsvColumn = (typeof CSV_COLUMNS)[number];

/** "Arrive at Pickup ETA" -> "arrive_at_pickup_eta" */
export function stagingColumn(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, "_");
}

/** Compares a parsed header row with the expected 29 columns. */
export function checkHeader(header: string[]): { missing: string[]; extra: string[] } {
  const got = header.map((h) => h.replace(/^﻿/, "").trim());
  const expected = new Set<string>(CSV_COLUMNS);
  return {
    missing: CSV_COLUMNS.filter((c) => !got.includes(c)),
    extra: got.filter((c) => !expected.has(c)),
  };
}

/** Turns one parsed CSV record into a staging_orders row. Values are passed through as raw text. */
export function toStagingRow(
  record: Record<string, string>,
  uploadId: string,
  rowNum: number,
): Record<string, string | number | null> {
  const row: Record<string, string | number | null> = { upload_id: uploadId, row_num: rowNum };
  for (const col of CSV_COLUMNS) row[stagingColumn(col)] = record[col] ?? null;
  return row;
}

export const STAGING_CHUNK_SIZE = 1000;
