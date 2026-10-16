"use client";

// Shared tooltip body for Recharts: text in text tokens, a colour key beside each value.
export function ChartTooltip({
  active,
  label,
  rows,
}: {
  active?: boolean;
  label?: string;
  rows: { key: string; color: string; name: string; value: string }[];
}) {
  if (!active || rows.length === 0) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      {label && <p className="mb-1 font-medium">{label}</p>}
      {rows.map((r) => (
        <p key={r.key} className="flex items-center gap-2">
          <span className="inline-block size-2.5 rounded-sm" style={{ background: r.color }} aria-hidden />
          <span className="text-muted-foreground">{r.name}</span>
          <span className="ml-auto pl-3 font-medium tabular-nums">{r.value}</span>
        </p>
      ))}
    </div>
  );
}

export const AXIS_TICK = { fill: "var(--viz-muted)", fontSize: 11 };
export const GRID_STROKE = "var(--viz-grid)";
export const AXIS_STROKE = "var(--viz-axis)";

const shortDay = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
export function shortDate(d: string) {
  return shortDay.format(new Date(`${d}T00:00:00Z`));
}

/** Compact axis ticks: 950, 1.2K, 12K. */
export function compact(n: number) {
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K`;
  return String(n);
}
