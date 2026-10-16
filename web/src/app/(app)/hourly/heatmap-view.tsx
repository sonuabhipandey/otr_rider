"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { HeatCell } from "@/lib/dashboard";
import { BUSINESS_HOURS, formatDecimal, formatHour, formatNumber } from "@/lib/format";

type Metric = "orders" | "bto" | "avg_s2p";
const METRICS: { key: Metric; label: string }[] = [
  { key: "orders", label: "Orders" },
  { key: "bto", label: "BTOs" },
  { key: "avg_s2p", label: "Avg S2P (min)" },
];
const STEPS = 7;
const heatStyle = (s: number) => ({ background: `var(--heat-${s})`, color: `var(--heat-ink-${s})` });

function fmt(metric: Metric, v: number | null | undefined) {
  if (v == null) return "";
  return metric === "avg_s2p" ? formatDecimal(v, 2) : formatNumber(v);
}

export function HeatmapView({ cells, rowKeys, rowLabel }: { cells: HeatCell[]; rowKeys: string[]; rowLabel: string }) {
  const [metric, setMetric] = useState<Metric>("orders");
  const [asTable, setAsTable] = useState(false);

  const byKey = new Map(cells.map((c) => [`${c.row_key}|${c.hour}`, c]));
  const values = cells.map((c) => c[metric]).filter((v): v is number => v != null && (metric === "avg_s2p" || v > 0));
  const min = metric === "avg_s2p" && values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 0;
  // Step 0 = no data / zero; steps 1..7 split [min, max] evenly.
  const step = (v: number | null | undefined) => {
    if (v == null || (metric !== "avg_s2p" && v <= 0)) return 0;
    if (max === min) return 4;
    return Math.min(STEPS, 1 + Math.floor(((v - min) / (max - min)) * STEPS));
  };
  const rowTotal = (key: string) =>
    metric === "avg_s2p" ? null : BUSINESS_HOURS.reduce((s, h) => s + (byKey.get(`${key}|${h}`)?.[metric] ?? 0), 0);

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Heatmap metric">
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
        <Button variant="ghost" size="xs" onClick={() => setAsTable((v) => !v)}>
          {asTable ? "Show heatmap" : "Show as table"}
        </Button>
      </div>

      {asTable ? (
        <div className="max-h-[32rem] overflow-auto rounded-lg border">
          <Table>
            <TableHeader className="sticky top-0 bg-card">
              <TableRow>
                <TableHead>{rowLabel}</TableHead>
                <TableHead>Hour</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">BTOs</TableHead>
                <TableHead className="text-right">Avg S2P</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rowKeys.flatMap((k) =>
                BUSINESS_HOURS.map((h) => byKey.get(`${k}|${h}`))
                  .filter((c): c is HeatCell => !!c)
                  .map((c) => (
                    <TableRow key={`${k}|${c.hour}`}>
                      <TableCell>{k}</TableCell>
                      <TableCell>{formatHour(c.hour)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(c.orders)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(c.bto)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt("avg_s2p", c.avg_s2p)}</TableCell>
                    </TableRow>
                  )),
              )}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full border-separate border-spacing-0.5 text-[11px]">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-card px-2 py-1 text-left font-medium text-muted-foreground">{rowLabel}</th>
                {BUSINESS_HOURS.map((h) => (
                  <th key={h} className="min-w-9 px-0.5 py-1 text-center font-normal text-muted-foreground">
                    {formatHour(h).replace(" ", " ")}
                  </th>
                ))}
                {metric !== "avg_s2p" && <th className="px-2 py-1 text-right font-medium text-muted-foreground">Total</th>}
              </tr>
            </thead>
            <tbody>
              {rowKeys.map((k) => (
                <tr key={k}>
                  <th scope="row" className="sticky left-0 z-10 bg-card px-2 py-1 text-left font-medium whitespace-nowrap">
                    {k}
                  </th>
                  {BUSINESS_HOURS.map((h) => {
                    const c = byKey.get(`${k}|${h}`);
                    const v = c?.[metric];
                    return (
                      <td
                        key={h}
                        data-step={step(v)}
                        style={heatStyle(step(v))}
                        title={`${k} · ${formatHour(h)}\nOrders ${formatNumber(c?.orders ?? 0)} · BTOs ${formatNumber(c?.bto ?? 0)} · Avg S2P ${c?.avg_s2p != null ? `${formatDecimal(c.avg_s2p, 2)} min` : "—"}`}
                        className="h-8 rounded-[4px] text-center tabular-nums"
                      >
                        {fmt(metric, v)}
                      </td>
                    );
                  })}
                  {metric !== "avg_s2p" && (
                    <td className="px-2 text-right font-medium tabular-nums">{formatNumber(rowTotal(k))}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!asTable && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{metric === "avg_s2p" ? fmt(metric, min) : "Low"}</span>
          <div className="flex gap-0.5">
            {Array.from({ length: STEPS }, (_, i) => (
              <span key={i} style={heatStyle(i + 1)} className="inline-block h-3 w-6 rounded-sm" />
            ))}
          </div>
          <span>{fmt(metric, max) || "High"}</span>
          <span className="ml-2">Empty cells: no orders.</span>
        </div>
      )}
    </div>
  );
}
