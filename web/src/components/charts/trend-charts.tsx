"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatNumber, formatPct } from "@/lib/format";
import { AXIS_STROKE, AXIS_TICK, ChartTooltip, compact, GRID_STROKE, shortDate } from "./chart-tooltip";

// orders is null on days with no uploaded data: drawn as a gap, never as zero.
type Point = { business_date: string; orders: number | null; bto_pct: number | null };

// Two single-series charts on the same 14 days (never one chart with two y-axes).
function MiniLine({
  data,
  dataKey,
  color,
  title,
  format,
  tickFormat,
}: {
  data: Point[];
  dataKey: "orders" | "bto_pct";
  color: string;
  title: string;
  format: (v: number | null) => string;
  tickFormat: (v: number) => string;
}) {
  const last = data.findLast((d) => d[dataKey] != null);
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between px-1">
        <p className="text-xs font-medium text-muted-foreground">{title}</p>
        {last && (
          <p className="text-xs text-muted-foreground">
            {shortDate(last.business_date)}: <span className="font-medium text-foreground">{format(last[dataKey])}</span>
          </p>
        )}
      </div>
      <div className="overflow-x-auto">
        <div className="h-44 min-w-[480px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke={GRID_STROKE} />
              <XAxis
                dataKey="business_date"
                tickFormatter={shortDate}
                tick={AXIS_TICK}
                stroke={AXIS_STROKE}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={16}
              />
              <YAxis tick={AXIS_TICK} tickFormatter={tickFormat} width={44} axisLine={false} tickLine={false} allowDecimals={dataKey !== "orders"} />
              <Tooltip
                cursor={{ stroke: AXIS_STROKE }}
                content={({ active, payload, label }) => (
                  <ChartTooltip
                    active={active}
                    label={label ? shortDate(String(label)) : undefined}
                    rows={(payload ?? []).map((p) => ({
                      key: String(p.dataKey),
                      color,
                      name: title,
                      value: format(p.value as number | null),
                    }))}
                  />
                )}
              />
              <Line
                type="monotone"
                dataKey={dataKey}
                stroke={color}
                strokeWidth={2}
                dot={{ r: 3, fill: color, stroke: "var(--card)", strokeWidth: 2 }}
                activeDot={{ r: 5, stroke: "var(--card)", strokeWidth: 2, fill: color }}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

export function TrendCharts({ data }: { data: Point[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <MiniLine
        data={data}
        dataKey="orders"
        color="var(--series-orders)"
        title="Orders per day"
        format={(v) => formatNumber(v)}
        tickFormat={compact}
      />
      <MiniLine
        data={data}
        dataKey="bto_pct"
        color="var(--series-bto)"
        title="BTO % per day"
        format={(v) => formatPct(v)}
        tickFormat={(v) => `${v}%`}
      />
    </div>
  );
}
