"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS_STROKE, AXIS_TICK, ChartTooltip, GRID_STROKE } from "@/components/charts/chart-tooltip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { StoreRow } from "@/lib/dashboard";
import { formatMinutes, formatNumber, formatPct } from "@/lib/format";

type Metric = "orders" | "riders_active" | "bto" | "bto_pct" | "avg_s2p";

const METRICS: { key: Metric; label: string; color: string; format: (v: number | null) => string }[] = [
  { key: "orders", label: "Orders", color: "var(--series-orders)", format: formatNumber },
  { key: "riders_active", label: "Riders active", color: "var(--series-orders)", format: formatNumber },
  { key: "bto", label: "BTOs", color: "var(--series-bto)", format: formatNumber },
  { key: "bto_pct", label: "BTO %", color: "var(--series-bto)", format: formatPct },
  { key: "avg_s2p", label: "Avg S2P", color: "var(--series-s2p)", format: formatMinutes },
];

export function StoresView({ rows, links }: { rows: StoreRow[]; links: Record<string, string> }) {
  const leaderboardQuery = (store: string) => links[store] ?? "/riders";
  const router = useRouter();
  const [metric, setMetric] = useState<Metric>("orders");
  const m = METRICS.find((x) => x.key === metric)!;
  const chartRows = [...rows].sort((a, b) => (b[metric] ?? -1) - (a[metric] ?? -1));
  const open = (store: string) => router.push(leaderboardQuery(store));

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Chart metric">
        {METRICS.map((x) => (
          <button
            key={x.key}
            role="tab"
            aria-selected={metric === x.key}
            onClick={() => setMetric(x.key)}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              metric === x.key ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
            }`}
          >
            {x.label}
          </button>
        ))}
      </div>

      <div style={{ height: Math.max(160, chartRows.length * 34 + 30) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartRows} layout="vertical" margin={{ top: 0, right: 72, bottom: 0, left: 0 }} barCategoryGap={8}>
            <CartesianGrid horizontal={false} stroke={GRID_STROKE} />
            <XAxis type="number" tick={AXIS_TICK} stroke={AXIS_STROKE} tickLine={false} />
            <YAxis type="category" dataKey="store_code" tick={AXIS_TICK} width={48} axisLine={false} tickLine={false} />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.5 }}
              content={({ active, payload, label }) => (
                <ChartTooltip
                  active={active}
                  label={label ? `${label} · click for riders` : undefined}
                  rows={(payload ?? []).map((p) => ({ key: m.key, color: m.color, name: m.label, value: m.format(p.value as number | null) }))}
                />
              )}
            />
            <Bar
              dataKey={metric}
              fill={m.color}
              radius={[0, 4, 4, 0]}
              maxBarSize={22}
              cursor="pointer"
              onClick={(d) => open(String((d as unknown as { payload: StoreRow }).payload.store_code))}
            >
              <LabelList
                dataKey={metric}
                position="right"
                className="fill-foreground text-xs"
                formatter={(v) => m.format(v as number | null)}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Table (desktop) */}
      <div className="hidden overflow-x-auto rounded-lg border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Store</TableHead>
              <TableHead className="text-right">Orders</TableHead>
              <TableHead className="text-right">Riders active</TableHead>
              <TableHead className="text-right">BTOs</TableHead>
              <TableHead className="text-right">BTO %</TableHead>
              <TableHead className="text-right">Cancelled</TableHead>
              <TableHead className="text-right">Avg S2P</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.store_code} className="cursor-pointer" onClick={() => open(r.store_code)}>
                <TableCell className="font-medium">
                  <Link href={leaderboardQuery(r.store_code)} className="hover:underline" onClick={(e) => e.stopPropagation()}>
                    {r.store_code}
                  </Link>
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(r.orders)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(r.riders_active)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(r.bto)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatPct(r.bto_pct)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(r.cancelled)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatMinutes(r.avg_s2p)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Cards (phone) */}
      <ul className="grid gap-2 md:hidden">
        {rows.map((r) => (
          <li key={r.store_code}>
            <Link href={leaderboardQuery(r.store_code)} className="block rounded-lg border bg-card p-3 active:bg-muted">
              <div className="flex items-baseline justify-between">
                <span className="font-medium">{r.store_code}</span>
                <span className="text-sm tabular-nums">
                  <span className="font-semibold">{formatNumber(r.orders)}</span> orders
                </span>
              </div>
              <dl className="mt-2 grid grid-cols-4 gap-1 text-xs">
                {(
                  [
                    ["Riders", formatNumber(r.riders_active)],
                    ["BTOs", formatNumber(r.bto)],
                    ["BTO %", formatPct(r.bto_pct)],
                    ["Avg S2P", formatMinutes(r.avg_s2p)],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
