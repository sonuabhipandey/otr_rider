import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/** Appends a row to audit_log. actorId null = automation / system. */
export async function audit(
  actorId: string | null,
  action: string,
  target: string | null,
  details: Record<string, unknown> = {},
) {
  const { error } = await createAdminClient()
    .from("audit_log")
    .insert({ actor_id: actorId, action, target, details });
  if (error) console.error("audit_log insert failed", action, error.message);
}
