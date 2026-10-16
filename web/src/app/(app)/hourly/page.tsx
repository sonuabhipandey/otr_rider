import type { Metadata } from "next";
import { InfoIcon } from "lucide-react";
import { ExportButton } from "@/components/dashboard/export-button";
import { PageHeader, Panel } from "@/components/dashboard/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { loadPage, rpc, type HeatCell } from "@/lib/dashboard";
import { addDays, daysBetween, exportFileName, exportFilters, formatBusinessDate, rangeLabel, storesParam } from "@/lib/filters";
import { BUSINESS_HOURS, formatHour } from "@/lib/format";
import { HeatmapView } from "./heatmap-view";

export const metadata: Metadata = { title: "Hourly · FastBeetle Riders" };

export default async function HourlyPage({ searchParams }: PageProps<"/hourly">) {
  const { meta, filters } = await loadPage(searchParams);
  // Exactly one store selected: rows become dates. Otherwise rows are stores.
  const byDate = filters.stores.length === 1;
  const cells = await rpc<HeatCell[]>("get_hourly_heatmap", {
    p_from: filters.from,
    p_to: filters.to,
    p_stores: storesParam(filters),
    p_by: byDate ? "date" : "store",
  });

  const rowKeys = byDate
    ? Array.from({ length: daysBetween(filters.from, filters.to) }, (_, i) => addDays(filters.from, i))
    : filters.stores.length
      ? filters.stores
      : meta.stores;

  const byKey = new Map(cells.map((c) => [`${c.row_key}|${c.hour}`, c]));
  const sheet = {
    name: byDate ? `Hourly by date ${filters.stores[0]}` : "Hourly by store",
    rows: rowKeys.flatMap((k) =>
      BUSINESS_HOURS.map((h) => {
        const c = byKey.get(`${k}|${h}`);
        return {
          [byDate ? "Business date" : "Store"]: k,
          Hour: formatHour(h),
          Orders: c?.orders ?? 0,
          BTOs: c?.bto ?? 0,
          "Avg S2P (min)": c?.avg_s2p ?? null,
        };
      }),
    ),
  };
  const ef = exportFilters(filters);
  const cutoff = meta.retention_cutoff;

  return (
    <>
      <PageHeader
        title="Hourly"
        subtitle={`${rangeLabel(filters)} · hours of the business day, 6 AM to 5 AM`}
        filters={filters}
        stores={meta.stores}
        actions={<ExportButton fileName={exportFileName("hourly", filters)} filters={ef} sheets={[sheet]} />}
      />
      {cutoff && filters.from < cutoff && (
        <Alert>
          <InfoIcon />
          <AlertDescription>
            Hourly figures come from order rows, which are kept from {formatBusinessDate(cutoff)} onward. Earlier days
            in this range show as empty.
          </AlertDescription>
        </Alert>
      )}
      <Panel
        title={byDate ? `${filters.stores[0]} by date and hour` : "Stores by hour"}
        description={byDate ? "One store selected, so rows are business dates." : "Select exactly one store to see dates instead."}
        action={<ExportButton fileName={exportFileName("hourly", filters)} filters={ef} sheets={[sheet]} label="Excel" size="xs" variant="ghost" />}
      >
        <HeatmapView cells={cells} rowKeys={rowKeys} rowLabel={byDate ? "Date" : "Store"} />
      </Panel>
    </>
  );
}
