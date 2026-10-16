import "server-only";
import { cache } from "react";
import { requireUser } from "@/lib/auth";
import { parseFilters, type DashboardMeta, type Filters } from "@/lib/filters";
import { createClient } from "@/lib/supabase/server";

// Data access for dashboard pages. Every call runs as the signed-in user (RLS applies) after requireUser.

export const getMeta = cache(async (): Promise<DashboardMeta> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_dashboard_meta");
  if (error) throw error;
  return data as DashboardMeta;
});

/** Checks the user, then resolves the URL filters. Call at the top of every dashboard page. */
export async function loadPage(searchParams: Promise<Record<string, string | string[] | undefined>>) {
  const profile = await requireUser();
  const [params, meta] = await Promise.all([searchParams, getMeta()]);
  const filters: Filters = parseFilters(params, meta);
  return { profile, meta, filters, supabase: await createClient() };
}

export async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(`${name}: ${error.message}`);
  return data as T;
}

// ---- Result shapes ---------------------------------------------------------------------------

export type Kpis = {
  orders: number;
  bto: number;
  cancelled: number;
  bto_pct: number | null;
  avg_s2p: number | null;
  active_riders: number;
  days_active: number;
};

export type RiderSummary = {
  rider_id: string;
  display_name: string;
  phone_last4: string | null;
  orders: number;
  bto: number;
  avg_s2p: number | null;
};

export type Overview = {
  current: Kpis;
  previous: Kpis;
  previous_from: string;
  previous_to: string;
  trend: { business_date: string; orders: number | null; bto: number | null; bto_pct: number | null }[];
  top_orders: RiderSummary[];
  top_bto: RiderSummary[];
};

export type LeaderboardRow = {
  rider_id: string;
  display_name: string;
  phone_last4: string | null;
  stores: string[];
  days_active: number;
  orders: number;
  orders_per_day: number | null;
  bto: number;
  bto_pct: number | null;
  cancelled: number;
  avg_s2p: number | null;
};

export type RiderProfile = {
  rider: {
    id: string;
    display_name: string;
    phone_last4: string | null;
    first_seen_date: string | null;
    last_seen_date: string | null;
    stores_all_time: string[];
    stores_in_range: string[];
  };
  kpis: Kpis;
  daily: { business_date: string; orders: number; bto: number; avg_s2p: number | null }[];
};

export type RiderOrder = {
  order_id: string;
  store_code: string | null;
  business_date: string;
  created_at: string;
  staged_at: string | null;
  pickup_at: string | null;
  s2p_min: number | null;
  status: string | null;
  bto_flag: number;
};

export type StoreRow = {
  store_code: string;
  orders: number;
  riders_active: number;
  bto: number;
  bto_pct: number | null;
  cancelled: number;
  avg_s2p: number | null;
};

export type HeatCell = { row_key: string; hour: number; orders: number; bto: number; avg_s2p: number | null };
