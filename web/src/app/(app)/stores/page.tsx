import type { Metadata } from "next";
import { ExportButton } from "@/components/dashboard/export-button";
import { PageHeader, Panel } from "@/components/dashboard/page-header";
import { loadPage, rpc, type StoreRow } from "@/lib/dashboard";
import { exportFileName, exportFilters, filtersToQuery, rangeLabel, storesParam } from "@/lib/filters";
import { StoresView } from "./stores-view";

export const metadata: Metadata = { title: "Stores · FastBeetle Riders" };

export default async function StoresPage({ searchParams }: PageProps<"/stores">) {
  const { meta, filters } = await loadPage(searchParams);
  const rows = await rpc<StoreRow[]>("get_store_comparison", {
    p_from: filters.from,
    p_to: filters.to,
    p_stores: storesParam(filters),
  });

  const sheet = {
    name: "Store comparison",
    rows: rows.map((r) => ({
      Store: r.store_code,
      Orders: r.orders,
      "Riders active": r.riders_active,
      BTOs: r.bto,
      "BTO %": r.bto_pct,
      Cancelled: r.cancelled,
      "Avg S2P (min)": r.avg_s2p,
    })),
  };
  const ef = exportFilters(filters);
  // Query strings for each store's leaderboard, built here so the client gets plain data.
  const queries = Object.fromEntries(
    rows.map((r) => [r.store_code, `/riders${filtersToQuery({ ...filters, stores: [r.store_code], q: "" })}`]),
  );

  return (
    <>
      <PageHeader
        title="Stores"
        subtitle={rangeLabel(filters)}
        filters={filters}
        stores={meta.stores}
        actions={<ExportButton fileName={exportFileName("stores", filters)} filters={ef} sheets={[sheet]} />}
      />
      <Panel
        title="Store comparison"
        description="Store totals include orders with no rider. Click a store to see its riders."
        action={<ExportButton fileName={exportFileName("stores", filters)} filters={ef} sheets={[sheet]} label="Excel" size="xs" variant="ghost" />}
      >
        <StoresView rows={rows} links={queries} />
      </Panel>
    </>
  );
}
