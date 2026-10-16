"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { LeaderboardRow } from "@/lib/dashboard";
import { formatDecimal, formatMinutes, formatNumber, formatPct } from "@/lib/format";

const PAGE_SIZE = 50;

type Key = keyof Pick<
  LeaderboardRow,
  "display_name" | "phone_last4" | "days_active" | "orders" | "orders_per_day" | "bto" | "bto_pct" | "cancelled" | "avg_s2p"
> | "stores";

const COLUMNS: { key: Key; label: string; numeric?: boolean; mobile?: boolean }[] = [
  { key: "display_name", label: "Rider" },
  { key: "phone_last4", label: "Last 4" },
  { key: "stores", label: "Stores" },
  { key: "days_active", label: "Days", numeric: true },
  { key: "orders", label: "Orders", numeric: true },
  { key: "orders_per_day", label: "Orders/day", numeric: true },
  { key: "bto", label: "BTOs", numeric: true },
  { key: "bto_pct", label: "BTO %", numeric: true },
  { key: "cancelled", label: "Cancelled", numeric: true },
  { key: "avg_s2p", label: "Avg S2P", numeric: true },
];

function cell(r: LeaderboardRow, key: Key): string {
  switch (key) {
    case "stores":
      return r.stores.join(", ");
    case "orders_per_day":
      return formatDecimal(r.orders_per_day);
    case "bto_pct":
      return formatPct(r.bto_pct);
    case "avg_s2p":
      return formatMinutes(r.avg_s2p);
    case "display_name":
      return r.display_name;
    case "phone_last4":
      return r.phone_last4 ?? "—";
    default:
      return formatNumber(r[key]);
  }
}

export function LeaderboardTable({ rows, profileQuery }: { rows: LeaderboardRow[]; profileQuery: string }) {
  const router = useRouter();
  const [sort, setSort] = useState<{ key: Key; dir: "asc" | "desc" }>({ key: "orders", dir: "desc" });
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    const val = (r: LeaderboardRow) => (sort.key === "stores" ? r.stores.join(",") : r[sort.key]);
    return [...rows].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1; // blanks last either way
      if (y == null) return -1;
      const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
      return sort.dir === "asc" ? c : -c;
    });
  }, [rows, sort]);

  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const visible = sorted.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);
  const open = (r: LeaderboardRow) => router.push(`/riders/${r.rider_id}${profileQuery}`);

  function toggle(key: Key) {
    setPage(0);
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "display_name" || key === "phone_last4" || key === "stores" ? "asc" : "desc" },
    );
  }

  const pager = (
    <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
      <span>
        {sorted.length === 0
          ? "No riders"
          : `${formatNumber(current * PAGE_SIZE + 1)}–${formatNumber(Math.min(sorted.length, (current + 1) * PAGE_SIZE))} of ${formatNumber(sorted.length)} riders`}
      </span>
      {pages > 1 && (
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" onClick={() => setPage(current - 1)} disabled={current === 0} aria-label="Previous page">
            <ChevronLeftIcon />
          </Button>
          <span className="px-1 tabular-nums">
            {current + 1} / {pages}
          </span>
          <Button variant="outline" size="icon-sm" onClick={() => setPage(current + 1)} disabled={current >= pages - 1} aria-label="Next page">
            <ChevronRightIcon />
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <div className="grid gap-3">
      {/* Desktop */}
      <div className="hidden overflow-x-auto rounded-lg border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              {COLUMNS.map((c) => {
                const active = sort.key === c.key;
                const Icon = !active ? ArrowUpDownIcon : sort.dir === "asc" ? ArrowUpIcon : ArrowDownIcon;
                return (
                  <TableHead key={c.key} className={c.numeric ? "text-right" : undefined} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
                    <button
                      type="button"
                      onClick={() => toggle(c.key)}
                      className={`inline-flex items-center gap-1 hover:text-foreground ${active ? "text-foreground" : ""}`}
                    >
                      {c.label}
                      <Icon className={`size-3.5 ${active ? "" : "opacity-40"}`} />
                    </button>
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((r) => (
              <TableRow
                key={r.rider_id}
                className="cursor-pointer"
                onClick={() => open(r)}
                onKeyDown={(e) => e.key === "Enter" && open(r)}
                tabIndex={0}
              >
                {COLUMNS.map((c) => (
                  <TableCell
                    key={c.key}
                    className={`${c.numeric ? "text-right tabular-nums" : ""} ${c.key === "display_name" ? "font-medium" : ""} ${c.key === "stores" ? "max-w-40 truncate" : ""}`}
                  >
                    {cell(r, c.key)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Phone: sort picker + cards */}
      <div className="flex items-center gap-2 md:hidden">
        <label htmlFor="lb-sort" className="text-sm text-muted-foreground">
          Sort by
        </label>
        <select
          id="lb-sort"
          className="h-8 flex-1 rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30"
          value={`${sort.key}:${sort.dir}`}
          onChange={(e) => {
            const [key, dir] = e.target.value.split(":") as [Key, "asc" | "desc"];
            setPage(0);
            setSort({ key, dir });
          }}
        >
          {COLUMNS.flatMap((c) => [
            <option key={`${c.key}:desc`} value={`${c.key}:desc`}>
              {c.label} {c.numeric ? "(high → low)" : "(Z → A)"}
            </option>,
            <option key={`${c.key}:asc`} value={`${c.key}:asc`}>
              {c.label} {c.numeric ? "(low → high)" : "(A → Z)"}
            </option>,
          ])}
        </select>
      </div>
      <ul className="grid gap-2 md:hidden">
        {visible.map((r) => (
          <li key={r.rider_id}>
            <button type="button" onClick={() => open(r)} className="w-full rounded-lg border bg-card p-3 text-left active:bg-muted">
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate font-medium">
                  {r.display_name}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">…{r.phone_last4 ?? "NA"}</span>
                </p>
                <p className="shrink-0 text-sm tabular-nums">
                  <span className="font-semibold">{formatNumber(r.orders)}</span> orders
                </p>
              </div>
              <dl className="mt-2 grid grid-cols-4 gap-1 text-xs">
                {(
                  [
                    ["BTOs", formatNumber(r.bto)],
                    ["BTO %", formatPct(r.bto_pct)],
                    ["Avg S2P", formatMinutes(r.avg_s2p)],
                    ["Days", formatNumber(r.days_active)],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-1.5 truncate text-xs text-muted-foreground">
                {r.stores.join(", ")} · {formatDecimal(r.orders_per_day)}/day · {formatNumber(r.cancelled)} cancelled
              </p>
            </button>
          </li>
        ))}
      </ul>

      {pager}
    </div>
  );
}
