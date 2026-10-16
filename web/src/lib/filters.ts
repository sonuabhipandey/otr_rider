// Global dashboard filters, kept in the URL so links can be shared:
//   ?stores=TDE1,TNE3 &range=7d | range=custom&from=YYYY-MM-DD&to=YYYY-MM-DD &q=rider
// No "range" = the latest business date that has data. Plain date-string arithmetic only;
// "today" (the current business date) always comes from Postgres (public.current_business_date).

export type RangePreset = "latest" | "today" | "yesterday" | "7d" | "30d" | "month" | "custom";

export const RANGE_LABELS: Record<RangePreset, string> = {
  latest: "Latest day with data",
  today: "Today",
  yesterday: "Yesterday",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  month: "This month",
  custom: "Custom",
};

export type Filters = {
  stores: string[]; // empty = all stores
  range: RangePreset;
  from: string;
  to: string;
  q: string;
};

export type DashboardMeta = {
  current_business_date: string;
  latest_data_date: string | null;
  earliest_data_date: string | null;
  retention_cutoff: string | null;
  stores: string[];
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 400;

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

function presetRange(preset: RangePreset, today: string, latest: string): { from: string; to: string } {
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "yesterday":
      return { from: addDays(today, -1), to: addDays(today, -1) };
    case "7d":
      return { from: addDays(today, -6), to: today };
    case "30d":
      return { from: addDays(today, -29), to: today };
    case "month":
      return { from: `${today.slice(0, 8)}01`, to: today };
    default:
      return { from: latest, to: latest };
  }
}

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export function parseFilters(params: Params, meta: DashboardMeta): Filters {
  const known = new Set(meta.stores);
  const stores = one(params.stores)
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => known.has(s));
  const q = one(params.q).trim().slice(0, 60);
  const today = meta.current_business_date;
  const latest = meta.latest_data_date ?? today;

  let range = one(params.range) as RangePreset;
  if (!(range in RANGE_LABELS)) range = "latest";

  let { from, to } = presetRange(range, today, latest);
  if (range === "custom") {
    const f = one(params.from);
    const t = one(params.to);
    if (DATE_RE.test(f) && DATE_RE.test(t)) {
      [from, to] = f <= t ? [f, t] : [t, f];
      if (daysBetween(from, to) > MAX_RANGE_DAYS) from = addDays(to, -(MAX_RANGE_DAYS - 1));
    } else {
      range = "latest";
      ({ from, to } = presetRange("latest", today, latest));
    }
  }
  return { stores: [...new Set(stores)].sort(), range, from, to, q };
}

/** Query string for a set of filters (omits defaults). */
export function filtersToQuery(f: Partial<Filters>): string {
  const p = new URLSearchParams();
  if (f.stores?.length) p.set("stores", f.stores.join(","));
  if (f.range && f.range !== "latest") p.set("range", f.range);
  if (f.range === "custom" && f.from && f.to) {
    p.set("from", f.from);
    p.set("to", f.to);
  }
  if (f.q) p.set("q", f.q);
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** For RPC calls: null means all stores. */
export function storesParam(f: Filters): string[] | null {
  return f.stores.length ? f.stores : null;
}

export function storesLabel(stores: string[]): string {
  return stores.length ? stores.join(", ") : "All stores";
}

const dayFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
export function formatBusinessDate(date: string): string {
  return dayFmt.format(new Date(`${date}T00:00:00Z`));
}

export function rangeLabel(f: Filters): string {
  return f.from === f.to
    ? formatBusinessDate(f.from)
    : `${formatBusinessDate(f.from)} – ${formatBusinessDate(f.to)}`;
}

/** The "Filters" sheet of every Excel export. */
export function exportFilters(f: Filters) {
  return { stores: storesLabel(f.stores), dates: f.from === f.to ? f.from : `${f.from} to ${f.to}`, search: f.q };
}

/** e.g. riders_TDE1_2026-10-01_to_2026-10-15.xlsx */
export function exportFileName(prefix: string, f: Filters): string {
  const stores = f.stores.length ? f.stores.join("-") : "All-stores";
  return `${prefix}_${stores}_${f.from}_to_${f.to}.xlsx`;
}
