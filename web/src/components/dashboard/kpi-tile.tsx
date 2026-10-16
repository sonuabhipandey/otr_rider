import { ArrowDownRightIcon, ArrowUpRightIcon, MinusIcon } from "lucide-react";
import { formatDecimal } from "@/lib/format";

/**
 * Stat tile: label · value · delta vs the previous equal-length period.
 * `kind` "pct" compares relatively (+12%); "points" compares absolute percentage points (+0.4 pp).
 * `upIsGood` sets the colour: more orders is good, more BTOs or slower S2P is bad.
 */
/** A plain stat tile with no comparison. */
export function StatTile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="min-w-0 rounded-xl border bg-card px-4 py-3">
      <p className="truncate text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold whitespace-nowrap sm:text-2xl">{value}</p>
      {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

export function KpiTile({
  label,
  value,
  current,
  previous,
  kind = "pct",
  upIsGood = true,
  previousLabel,
}: {
  label: string;
  value: string;
  current: number | null;
  previous: number | null;
  kind?: "pct" | "points";
  upIsGood?: boolean;
  previousLabel: string;
}) {
  let delta: { text: string; dir: -1 | 0 | 1 } | null = null;
  if (current != null && previous != null) {
    if (kind === "points") {
      const d = current - previous;
      delta = { text: `${d > 0 ? "+" : ""}${formatDecimal(d)} pp`, dir: Math.abs(d) < 0.05 ? 0 : d > 0 ? 1 : -1 };
    } else if (previous !== 0) {
      const d = ((current - previous) / previous) * 100;
      delta = { text: `${d > 0 ? "+" : ""}${formatDecimal(d)}%`, dir: Math.abs(d) < 0.05 ? 0 : d > 0 ? 1 : -1 };
    }
  }
  const good = delta && delta.dir !== 0 ? (delta.dir > 0) === upIsGood : null;
  const Icon = !delta || delta.dir === 0 ? MinusIcon : delta.dir > 0 ? ArrowUpRightIcon : ArrowDownRightIcon;

  return (
    <div className="min-w-0 rounded-xl border bg-card px-4 py-3">
      <p className="truncate text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold whitespace-nowrap sm:text-2xl">{value}</p>
      <p className="mt-1 flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
        {delta ? (
          <>
            <span
              className="inline-flex items-center gap-0.5 font-medium"
              style={{ color: good == null ? undefined : good ? "var(--delta-good)" : "var(--delta-bad)" }}
            >
              <Icon className="size-3.5" aria-hidden />
              {delta.text}
            </span>
            <span>vs {previousLabel}</span>
          </>
        ) : (
          <span>No data for {previousLabel}</span>
        )}
      </p>
    </div>
  );
}
