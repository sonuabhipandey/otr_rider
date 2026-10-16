"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { authorize, NOT_ALLOWED, type ActionResult } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const MIN_DAYS = 30;
const MAX_DAYS = 3650;

/** Superadmins only. days = null keeps every order row ("keep all", e.g. on a paid plan). */
export async function setRetentionDays(days: unknown): Promise<ActionResult> {
  const actor = await authorize(["superadmin"]);
  if (!actor) return { ok: false, error: NOT_ALLOWED };

  let value: number | null;
  if (days === null) value = null;
  else if (typeof days === "number" && Number.isInteger(days) && days >= MIN_DAYS && days <= MAX_DAYS) value = days;
  else return { ok: false, error: `Enter a whole number of days between ${MIN_DAYS} and ${MAX_DAYS}, or choose Keep all.` };

  const admin = createAdminClient();
  const { data: before } = await admin.from("app_settings").select("value").eq("key", "order_retention_days").maybeSingle();
  const { error } = await admin
    .from("app_settings")
    .upsert({ key: "order_retention_days", value, updated_at: new Date().toISOString(), updated_by: actor.id });
  if (error) return { ok: false, error: "Could not save the setting." };

  await audit(actor.id, "settings.changed", "order_retention_days", { from: before?.value ?? null, to: value });
  revalidatePath("/admin/settings");
  return { ok: true, data: null };
}
