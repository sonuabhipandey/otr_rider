import type { Metadata } from "next";
import { ExportButton } from "@/components/dashboard/export-button";
import { PageHeader, Panel } from "@/components/dashboard/page-header";
import { loadPage, rpc, type LeaderboardRow } from "@/lib/dashboard";
import { exportFileName, exportFilters, filtersToQuery, rangeLabel, storesParam } from "@/lib/filters";
import { formatNumber } from "@/lib/format";
import { LeaderboardTable } from "./leaderboard-table";

export const metadata: Metadata = { title: "Riders · FastBeetle Riders" };

export default async function RidersPage({ searchParams }: PageProps<"/riders">) {
  const { meta, filters } = await loadPage(searchParams);
  const rows = await rpc<LeaderboardRow[]>("get_leaderboard", {
    p_from: filters.from,
    p_to: filters.to,
    p_stores: storesParam(filters),
    p_search: filters.q || null,
  });

  const sheet = {
    name: "Rider leaderboard",
    rows: rows.map((r) => ({
      Rider: r.display_name,
      "Last 4": r.phone_last4,
      Stores: r.stores.join(", "),
      "Days active": r.days_active,
      Orders: r.orders,
      "Orders/day": r.orders_per_day,
      BTOs: r.bto,
      "BTO %": r.bto_pct,
      Cancelled: r.cancelled,
      "Avg S2P (min)": r.avg_s2p,
    })),
  };
  const ef = exportFilters(filters);

  return (
    <>
      <PageHeader
        title="Riders"
        subtitle={`${rangeLabel(filters)} · ${formatNumber(rows.length)} riders`}
        filters={filters}
        stores={meta.stores}
        actions={<ExportButton fileName={exportFileName("riders", filters)} filters={ef} sheets={[sheet]} />}
      />
      <Panel
        title="Rider leaderboard"
        description="Every order with a rider counts, including BTO and cancelled. Click a rider for their profile."
        action={<ExportButton fileName={exportFileName("riders", filters)} filters={ef} sheets={[sheet]} label="Excel" size="xs" variant="ghost" />}
      >
        <LeaderboardTable rows={rows} profileQuery={filtersToQuery({ ...filters, q: "" })} />
      </Panel>
    </>
  );
}
