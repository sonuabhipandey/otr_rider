import type { Metadata } from "next";
import { TrendCharts } from "@/components/charts/trend-charts";
import { ExportButton } from "@/components/dashboard/export-button";
import { KpiTile } from "@/components/dashboard/kpi-tile";
import { EmptyState, PageHeader, Panel } from "@/components/dashboard/page-header";
import { RiderLink } from "@/components/dashboard/rider-link";
import { loadPage, rpc, type Overview, type RiderSummary } from "@/lib/dashboard";
import { exportFileName, exportFilters, formatBusinessDate, rangeLabel, storesParam, type Filters } from "@/lib/filters";
import { formatMinutes, formatNumber, formatPct } from "@/lib/format";

export const metadata: Metadata = { title: "Overview · FastBeetle Riders" };

function TopList({ rows, metric, filters }: { rows: RiderSummary[]; metric: "orders" | "bto"; filters: Filters }) {
  if (rows.length === 0) return <EmptyState>{metric === "bto" ? "No BTOs in this range." : "No rider orders in this range."}</EmptyState>;
  const max = Math.max(...rows.map((r) => r[metric]), 1);
  return (
    <ol className="grid gap-2">
      {rows.map((r, i) => (
        <li key={r.rider_id} className="grid grid-cols-[1.25rem_1fr_auto] items-center gap-2 text-sm">
          <span className="text-xs text-muted-foreground tabular-nums">{i + 1}</span>
          <div className="min-w-0">
            <RiderLink id={r.rider_id} name={r.display_name} last4={r.phone_last4} filters={filters} className="block truncate font-medium hover:underline" />
            <div className="mt-1 h-1.5 rounded-full bg-muted">
              <div
                className="h-1.5 rounded-full"
                style={{
                  width: `${(r[metric] / max) * 100}%`,
                  background: metric === "orders" ? "var(--series-orders)" : "var(--series-bto)",
                }}
              />
            </div>
          </div>
          <span className="text-right tabular-nums">
            <span className="font-medium">{formatNumber(r[metric])}</span>
            <span className="block text-xs text-muted-foreground">
              {metric === "orders" ? `${formatNumber(r.bto)} BTO` : `of ${formatNumber(r.orders)} orders`}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

const riderSheetRows = (rows: RiderSummary[]) =>
  rows.map((r, i) => ({
    Rank: i + 1,
    Rider: r.display_name,
    "Last 4": r.phone_last4,
    Orders: r.orders,
    BTOs: r.bto,
    "Avg S2P (min)": r.avg_s2p,
  }));

export default async function OverviewPage({ searchParams }: PageProps<"/">) {
  const { meta, filters } = await loadPage(searchParams);
  const data = await rpc<Overview>("get_overview", {
    p_from: filters.from,
    p_to: filters.to,
    p_stores: storesParam(filters),
    p_search: filters.q || null,
  });
  const { current: c, previous: p } = data;
  const previousLabel =
    data.previous_from === data.previous_to
      ? formatBusinessDate(data.previous_from)
      : `${formatBusinessDate(data.previous_from)} – ${formatBusinessDate(data.previous_to)}`;

  const ef = exportFilters(filters);
  const kpiSheet = {
    name: "KPIs",
    rows: [
      ["Orders", c.orders, p.orders],
      ["BTOs", c.bto, p.bto],
      ["BTO %", c.bto_pct, p.bto_pct],
      ["Average S2P (min)", c.avg_s2p, p.avg_s2p],
      ["Active riders", c.active_riders, p.active_riders],
      ["Cancelled", c.cancelled, p.cancelled],
    ].map(([k, cur, prev]) => ({
      Metric: k as string,
      [`${filters.from} to ${filters.to}`]: cur as number | null,
      [`Previous (${data.previous_from} to ${data.previous_to})`]: prev as number | null,
    })),
  };
  const trendSheet = {
    name: "14-day trend",
    rows: data.trend.map((t) => ({ "Business date": t.business_date, Orders: t.orders, BTOs: t.bto, "BTO %": t.bto_pct })),
  };
  const topOrdersSheet = { name: "Top riders by orders", rows: riderSheetRows(data.top_orders) };
  const topBtoSheet = { name: "Top riders by BTOs", rows: riderSheetRows(data.top_bto) };

  return (
    <>
      <PageHeader
        title="Overview"
        subtitle={rangeLabel(filters)}
        filters={filters}
        stores={meta.stores}
        actions={
          <ExportButton
            fileName={exportFileName("overview", filters)}
            filters={ef}
            sheets={[kpiSheet, trendSheet, topOrdersSheet, topBtoSheet]}
          />
        }
      />

      {!meta.latest_data_date && (
        <Panel title="No data yet">
          <EmptyState>Upload a LoadShare CSV to see rider performance here.</EmptyState>
        </Panel>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiTile label="Orders" value={formatNumber(c.orders)} current={c.orders} previous={p.orders} previousLabel={previousLabel} />
        <KpiTile label="BTOs" value={formatNumber(c.bto)} current={c.bto} previous={p.bto} upIsGood={false} previousLabel={previousLabel} />
        <KpiTile label="BTO %" value={formatPct(c.bto_pct)} current={c.bto_pct} previous={p.bto_pct} kind="points" upIsGood={false} previousLabel={previousLabel} />
        <KpiTile label="Average S2P" value={formatMinutes(c.avg_s2p)} current={c.avg_s2p} previous={p.avg_s2p} upIsGood={false} previousLabel={previousLabel} />
        <KpiTile label="Active riders" value={formatNumber(c.active_riders)} current={c.active_riders} previous={p.active_riders} previousLabel={previousLabel} />
      </div>

      <Panel
        title="Last 14 days"
        description={`Ending ${formatBusinessDate(filters.to)}`}
        action={<ExportButton fileName={exportFileName("overview-trend", filters)} filters={ef} sheets={[trendSheet]} label="Excel" size="xs" variant="ghost" />}
      >
        <TrendCharts data={data.trend} />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Top 5 riders by orders"
          description={filters.q ? `Matching “${filters.q}”` : undefined}
          action={<ExportButton fileName={exportFileName("top-orders", filters)} filters={ef} sheets={[topOrdersSheet]} label="Excel" size="xs" variant="ghost" />}
        >
          <TopList rows={data.top_orders} metric="orders" filters={filters} />
        </Panel>
        <Panel
          title="Top 5 riders by BTO count"
          description={filters.q ? `Matching “${filters.q}”` : undefined}
          action={<ExportButton fileName={exportFileName("top-bto", filters)} filters={ef} sheets={[topBtoSheet]} label="Excel" size="xs" variant="ghost" />}
        >
          <TopList rows={data.top_bto} metric="bto" filters={filters} />
        </Panel>
      </div>
    </>
  );
}
