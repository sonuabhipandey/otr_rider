"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMinutes, formatNumber } from "@/lib/format";
import { AXIS_STROKE, AXIS_TICK, ChartTooltip, GRID_STROKE, shortDate } from "./chart-tooltip";

type Day = { business_date: string; orders: number; bto: number; avg_s2p: number | null };

/**
 * Orders + BTOs as bars on one count axis, average S2P as a line on its own chart directly below,
 * sharing the same dates. Two charts instead of one dual-axis chart, so neither scale distorts the other.
 */
export function RiderDailyCharts({ data }: { data: Day[] }) {
  const [asTable, setAsTable] = useState(false);
  const width = Math.max(480, data.length * 34);

  return (
    <div className="grid gap-3">
      <div className="flex justify-end">
        <Button variant="ghost" size="xs" onClick={() => setAsTable((v) => !v)}>
          {asTable ? "Show chart" : "Show as table"}
        </Button>
      </div>

      {asTable ? (
        <div className="max-h-96 overflow-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Business date</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">BTOs</TableHead>
                <TableHead className="text-right">Avg S2P</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((d) => (
                <TableRow key={d.business_date}>
                  <TableCell>{d.business_date}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(d.orders)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(d.bto)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMinutes(d.avg_s2p)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div style={{ minWidth: width }}>
            <p className="px-1 text-xs font-medium text-muted-foreground">Orders and BTOs per day</p>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: 0 }} barGap={2} barCategoryGap="20%">
                  <CartesianGrid vertical={false} stroke={GRID_STROKE} />
                  <XAxis dataKey="business_date" tickFormatter={shortDate} tick={AXIS_TICK} stroke={AXIS_STROKE} tickLine={false} minTickGap={12} />
                  <YAxis tick={AXIS_TICK} width={36} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    height={24}
                    iconType="square"
                    iconSize={10}
                    formatter={(v) => <span className="text-xs text-muted-foreground">{v}</span>}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--muted)", opacity: 0.5 }}
                    content={({ active, payload, label }) => (
                      <ChartTooltip
                        active={active}
                        label={label ? shortDate(String(label)) : undefined}
                        rows={(payload ?? []).map((p) => ({
                          key: String(p.dataKey),
                          color: String(p.color),
                          name: String(p.name),
                          value: formatNumber(p.value as number),
                        }))}
                      />
                    )}
                  />
                  <Bar dataKey="orders" name="Orders" fill="var(--series-orders)" radius={[4, 4, 0, 0]} maxBarSize={24} />
                  <Bar dataKey="bto" name="BTOs" fill="var(--series-bto)" radius={[4, 4, 0, 0]} maxBarSize={24} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <p className="mt-3 px-1 text-xs font-medium text-muted-foreground">Average S2P per day (minutes)</p>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid vertical={false} stroke={GRID_STROKE} />
                  <XAxis dataKey="business_date" tickFormatter={shortDate} tick={AXIS_TICK} stroke={AXIS_STROKE} tickLine={false} minTickGap={12} />
                  <YAxis tick={AXIS_TICK} width={36} axisLine={false} tickLine={false} />
                  <Tooltip
                    cursor={{ stroke: AXIS_STROKE }}
                    content={({ active, payload, label }) => (
                      <ChartTooltip
                        active={active}
                        label={label ? shortDate(String(label)) : undefined}
                        rows={(payload ?? []).map((p) => ({
                          key: "s2p",
                          color: "var(--series-s2p)",
                          name: "Avg S2P",
                          value: formatMinutes(p.value as number | null),
                        }))}
                      />
                    )}
                  />
                  <Line
                    type="monotone"
                    dataKey="avg_s2p"
                    stroke="var(--series-s2p)"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "var(--series-s2p)", stroke: "var(--card)", strokeWidth: 2 }}
                    activeDot={{ r: 5, stroke: "var(--card)", strokeWidth: 2 }}
                    connectNulls={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
