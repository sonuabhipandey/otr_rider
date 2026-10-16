import type { Metadata } from "next";
import { TriangleAlertIcon } from "lucide-react";
import { Panel } from "@/components/dashboard/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { requireSuperadmin } from "@/lib/auth";
import { formatBusinessDate } from "@/lib/filters";
import { formatDecimal, formatNumber } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { RetentionForm } from "./retention-form";

export const metadata: Metadata = { title: "Settings · FastBeetle Riders" };

const PLAN_BYTES = 500 * 1024 * 1024; // Supabase free plan database limit
const WARN_AT = 0.8;

export default async function SettingsPage() {
  await requireSuperadmin();
  const supabase = await createClient();

  const [{ data: size, error: sizeErr }, { data: setting }, { data: cutoff }, { count: orderRows }] = await Promise.all([
    supabase.rpc("get_db_size"),
    supabase.from("app_settings").select("value, updated_at").eq("key", "order_retention_days").maybeSingle(),
    supabase.rpc("order_retention_cutoff"),
    supabase.from("orders").select("order_id", { count: "exact", head: true }),
  ]);
  if (sizeErr) throw sizeErr;

  const bytes = Number(size);
  const used = bytes / PLAN_BYTES;
  const warn = used >= WARN_AT;
  const retention = (setting?.value as number | null) ?? null;

  return (
    <div className="grid max-w-3xl gap-4">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Superadmins only.</p>
      </div>

      <Panel title="Database size" description="Supabase free plan limit: 500 MB">
        <div className="grid gap-2">
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-semibold">{formatDecimal(bytes / 1048576)} MB</span>
            <span className="text-sm text-muted-foreground">{formatDecimal(used * 100)}% of 500 MB</span>
          </div>
          <div
            className="h-2.5 rounded-full"
            style={{ background: warn ? "color-mix(in oklch, var(--delta-bad) 20%, transparent)" : "color-mix(in oklch, var(--primary) 18%, transparent)" }}
            role="meter"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(used * 100)}
            aria-label="Database size used"
          >
            <div
              className="h-2.5 rounded-full"
              style={{ width: `${Math.min(100, used * 100)}%`, background: warn ? "var(--delta-bad)" : "var(--primary)" }}
            />
          </div>
          <p className="text-xs text-muted-foreground">{formatNumber(orderRows ?? 0)} order rows stored.</p>
          {warn && (
            <Alert variant="destructive">
              <TriangleAlertIcon />
              <AlertTitle>The database is over 80% full</AlertTitle>
              <AlertDescription>
                Lower the retention below, or move to a paid Supabase plan and choose Keep all. See the runbook section
                “Database nearing its limit”.
              </AlertDescription>
            </Alert>
          )}
        </div>
      </Panel>

      <Panel
        title="Order retention"
        description={
          retention === null
            ? "Currently keeping all order rows."
            : `Currently ${retention} days${cutoff ? `: order rows before ${formatBusinessDate(String(cutoff))} are deleted daily` : ""}.`
        }
      >
        <RetentionForm current={retention} />
      </Panel>
    </div>
  );
}
