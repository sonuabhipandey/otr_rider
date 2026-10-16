import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, InfoIcon } from "lucide-react";
import { RiderDailyCharts } from "@/components/charts/rider-daily-charts";
import { ExportButton } from "@/components/dashboard/export-button";
import { StatTile } from "@/components/dashboard/kpi-tile";
import { EmptyState, PageHeader, Panel } from "@/components/dashboard/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { loadPage, rpc, type RiderOrder, type RiderProfile } from "@/lib/dashboard";
import { exportFileName, exportFilters, filtersToQuery, formatBusinessDate, rangeLabel, storesParam } from "@/lib/filters";
import { formatDecimal, formatMinutes, formatNumber, formatPct, formatTime, istStamp } from "@/lib/format";

export const metadata: Metadata = { title: "Rider · FastBeetle Riders" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function RiderPage({ params, searchParams }: PageProps<"/riders/[id]">) {
  const [{ id }, { meta, filters }] = await Promise.all([params, loadPage(searchParams)]);
  if (!UUID_RE.test(id)) notFound();

  const args = { p_rider_id: id, p_from: filters.from, p_to: filters.to, p_stores: storesParam(filters) };
  const [profile, orders] = await Promise.all([
    rpc<RiderProfile | null>("get_rider_profile", args),
    rpc<RiderOrder[]>("get_rider_orders", args),
  ]);
  if (!profile) notFound();

  const { rider, kpis: k, daily } = profile;
  const cutoff = meta.retention_cutoff;
  const partlyPurged = cutoff != null && filters.from < cutoff;
  const ef = exportFilters(filters);
  const safeName = rider.display_name.replace(/[^A-Za-z0-9]+/g, "-");

  const dailySheet = {
    name: "Daily",
    rows: daily.map((d) => ({ "Business date": d.business_date, Orders: d.orders, BTOs: d.bto, "Avg S2P (min)": d.avg_s2p })),
  };
  const ordersSheet = {
    name: "Orders",
    rows: orders.map((o) => ({
      "Order ID": o.order_id,
      Store: o.store_code,
      "Business date": o.business_date,
      "Created (IST)": istStamp(o.created_at),
      "Staged (IST)": istStamp(o.staged_at),
      "Pickup (IST)": istStamp(o.pickup_at),
      "S2P (min)": o.s2p_min,
      Status: o.status,
      BTO: o.bto_flag,
    })),
  };
  const kpiSheet = {
    name: "Summary",
    rows: [
      { Metric: "Rider", Value: rider.display_name },
      { Metric: "Last 4", Value: rider.phone_last4 },
      { Metric: "Orders", Value: k.orders },
      { Metric: "BTOs", Value: k.bto },
      { Metric: "BTO %", Value: k.bto_pct },
      { Metric: "Cancelled", Value: k.cancelled },
      { Metric: "Avg S2P (min)", Value: k.avg_s2p },
      { Metric: "Days active", Value: k.days_active },
    ],
  };
  const back = `/riders${filtersToQuery(filters)}`;

  return (
    <>
      <Link href={back} className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" />
        All riders
      </Link>
      <PageHeader
        title={
          <>
            {rider.display_name}
            <span className="ml-2 text-base font-normal text-muted-foreground tabular-nums">…{rider.phone_last4 ?? "NA"}</span>
          </>
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="flex flex-wrap gap-1">
              {rider.stores_all_time.map((s) => (
                <Badge key={s} variant="secondary">
                  {s}
                </Badge>
              ))}
            </span>
            <span>
              First seen {rider.first_seen_date ? formatBusinessDate(rider.first_seen_date) : "—"} · Last seen{" "}
              {rider.last_seen_date ? formatBusinessDate(rider.last_seen_date) : "—"}
            </span>
          </span>
        }
        filters={filters}
        stores={meta.stores}
        actions={
          <ExportButton
            fileName={exportFileName(`rider_${safeName}`, filters)}
            filters={ef}
            sheets={[kpiSheet, dailySheet, ordersSheet]}
          />
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile label="Orders" value={formatNumber(k.orders)} note={rangeLabel(filters)} />
        <StatTile label="BTOs" value={formatNumber(k.bto)} note={`${formatNumber(k.cancelled)} cancelled`} />
        <StatTile label="BTO %" value={formatPct(k.bto_pct)} />
        <StatTile label="Average S2P" value={formatMinutes(k.avg_s2p)} />
        <StatTile
          label="Days active"
          value={formatNumber(k.days_active)}
          note={k.days_active ? `${formatDecimal(k.orders / k.days_active)} orders/day` : undefined}
        />
      </div>

      <Panel
        title="Daily performance"
        description={rangeLabel(filters)}
        action={<ExportButton fileName={exportFileName(`rider_${safeName}_daily`, filters)} filters={ef} sheets={[dailySheet]} label="Excel" size="xs" variant="ghost" />}
      >
        {k.orders === 0 ? <EmptyState>No orders for this rider in the selected stores and dates.</EmptyState> : <RiderDailyCharts data={daily} />}
      </Panel>

      <Panel
        title="Orders"
        description={`${formatNumber(orders.length)} orders${orders.length >= 5000 ? " (first 5,000 shown)" : ""}`}
        action={<ExportButton fileName={exportFileName(`rider_${safeName}_orders`, filters)} filters={ef} sheets={[ordersSheet]} label="Excel" size="xs" variant="ghost" />}
      >
        {partlyPurged && (
          <Alert className="mb-3">
            <InfoIcon />
            <AlertDescription>
              Order-level rows before {formatBusinessDate(cutoff)} have been removed under the retention setting. The
              totals and daily chart above still include those days; this list does not.
            </AlertDescription>
          </Alert>
        )}
        {orders.length === 0 ? (
          <EmptyState>No orders to list.</EmptyState>
        ) : (
          <>
            <div className="hidden max-h-[32rem] overflow-auto rounded-lg border md:block">
              <Table>
                <TableHeader className="sticky top-0 bg-card">
                  <TableRow>
                    <TableHead>Order ID</TableHead>
                    <TableHead>Store</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Staged</TableHead>
                    <TableHead>Pickup</TableHead>
                    <TableHead className="text-right">S2P</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>BTO</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((o) => (
                    <TableRow key={o.order_id}>
                      <TableCell className="font-mono text-xs">{o.order_id}</TableCell>
                      <TableCell>{o.store_code}</TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        <span className="text-xs text-muted-foreground">{o.business_date.slice(5)} </span>
                        {formatTime(o.created_at)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">{formatTime(o.staged_at)}</TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">{formatTime(o.pickup_at)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMinutes(o.s2p_min)}</TableCell>
                      <TableCell className="text-xs">{o.status}</TableCell>
                      <TableCell>{o.bto_flag ? <Badge variant="destructive">BTO</Badge> : null}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <ul className="grid gap-2 md:hidden">
              {orders.slice(0, 300).map((o) => (
                <li key={o.order_id} className="rounded-lg border p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-mono text-xs">{o.order_id}</span>
                    {o.bto_flag ? <Badge variant="destructive">BTO</Badge> : <span className="text-xs text-muted-foreground">{o.status}</span>}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                    {o.store_code} · {o.business_date} · created {formatTime(o.created_at)}
                  </p>
                  <p className="mt-0.5 text-xs tabular-nums">
                    Staged {formatTime(o.staged_at)} → pickup {formatTime(o.pickup_at)} ·{" "}
                    <span className="font-medium">{formatMinutes(o.s2p_min)}</span>
                  </p>
                </li>
              ))}
              {orders.length > 300 && (
                <li className="text-center text-xs text-muted-foreground">
                  Showing 300 of {formatNumber(orders.length)}. Export to Excel for the full list.
                </li>
              )}
            </ul>
          </>
        )}
      </Panel>
    </>
  );
}
