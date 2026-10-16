"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { authorize, NOT_ALLOWED, type ActionResult, type Role } from "@/lib/auth";
import { generateTempPassword } from "@/lib/passwords";
import { createAdminClient } from "@/lib/supabase/admin";

// Every action here re-checks the caller on the server. Hiding buttons in the UI is not security.

const ROLES: readonly Role[] = ["superadmin", "admin"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BAN_FOREVER = "876000h"; // ~100 years; Supabase has no permanent-ban flag

type Admin = ReturnType<typeof createAdminClient>;
type Target = { id: string; email: string; role: Role; is_active: boolean };

async function loadTarget(admin: Admin, userId: unknown): Promise<Target | null> {
  if (typeof userId !== "string" || !UUID_RE.test(userId)) return null;
  const { data } = await admin
    .from("profiles")
    .select("id, email, role, is_active")
    .eq("id", userId)
    .maybeSingle<Target>();
  return data;
}

/** True if `target` is the only active superadmin left. */
async function isLastActiveSuperadmin(admin: Admin, target: Target): Promise<boolean> {
  if (target.role !== "superadmin" || !target.is_active) return false;
  const { count } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "superadmin")
    .eq("is_active", true)
    .neq("id", target.id);
  return (count ?? 0) === 0;
}

export async function createUser(input: {
  fullName: unknown;
  email: unknown;
  role: unknown;
}): Promise<ActionResult<{ email: string; tempPassword: string }>> {
  const actor = await authorize(["superadmin"]);
  if (!actor) return { ok: false, error: NOT_ALLOWED };

  const fullName = typeof input.fullName === "string" ? input.fullName.trim() : "";
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const role = input.role as Role;
  if (!fullName) return { ok: false, error: "Enter the person's name." };
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Enter a valid email address." };
  if (!ROLES.includes(role)) return { ok: false, error: "Choose a role." };

  const admin = createAdminClient();
  const { data: existing } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
  if (existing) return { ok: false, error: "A user with this email already exists." };

  const tempPassword = generateTempPassword();
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (createErr || !created.user) {
    return {
      ok: false,
      error: createErr?.code === "email_exists" ? "A user with this email already exists." : (createErr?.message ?? "Could not create the user."),
    };
  }

  const { error: profileErr } = await admin.from("profiles").insert({
    id: created.user.id,
    email,
    full_name: fullName,
    role,
    is_active: true,
    must_change_password: true,
    created_by: actor.id,
  });
  if (profileErr) {
    await admin.auth.admin.deleteUser(created.user.id);
    return { ok: false, error: "Could not save the user's profile. Nothing was created." };
  }

  await audit(actor.id, "user.created", created.user.id, { email, full_name: fullName, role });
  revalidatePath("/admin/users");
  return { ok: true, data: { email, tempPassword } };
}

export async function changeRole(userId: unknown, role: unknown): Promise<ActionResult> {
  const actor = await authorize(["superadmin"]);
  if (!actor) return { ok: false, error: NOT_ALLOWED };
  if (!ROLES.includes(role as Role)) return { ok: false, error: "Choose a role." };

  const admin = createAdminClient();
  const target = await loadTarget(admin, userId);
  if (!target) return { ok: false, error: "User not found." };
  if (target.id === actor.id) return { ok: false, error: "You cannot change your own role." };
  if (target.role === role) return { ok: true, data: null };
  if (role === "admin" && (await isLastActiveSuperadmin(admin, target))) {
    return { ok: false, error: "This is the last active superadmin and cannot be demoted." };
  }

  const { error } = await admin.from("profiles").update({ role }).eq("id", target.id);
  if (error) return { ok: false, error: "Could not change the role." };

  await audit(actor.id, "user.role_changed", target.id, { email: target.email, from: target.role, to: role });
  revalidatePath("/admin/users");
  return { ok: true, data: null };
}

export async function resetPassword(
  userId: unknown,
): Promise<ActionResult<{ email: string; tempPassword: string }>> {
  const actor = await authorize(["superadmin"]);
  if (!actor) return { ok: false, error: NOT_ALLOWED };

  const admin = createAdminClient();
  const target = await loadTarget(admin, userId);
  if (!target) return { ok: false, error: "User not found." };

  const tempPassword = generateTempPassword();
  const { error: authErr } = await admin.auth.admin.updateUserById(target.id, { password: tempPassword });
  if (authErr) return { ok: false, error: "Could not reset the password." };

  const { error } = await admin.from("profiles").update({ must_change_password: true }).eq("id", target.id);
  if (error) return { ok: false, error: "Password was reset, but forcing a change failed. Try again." };

  await audit(actor.id, "user.password_reset", target.id, { email: target.email });
  revalidatePath("/admin/users");
  return { ok: true, data: { email: target.email, tempPassword } };
}

export async function setActive(userId: unknown, active: unknown): Promise<ActionResult> {
  const actor = await authorize(["superadmin"]);
  if (!actor) return { ok: false, error: NOT_ALLOWED };
  if (typeof active !== "boolean") return { ok: false, error: "Invalid request." };

  const admin = createAdminClient();
  const target = await loadTarget(admin, userId);
  if (!target) return { ok: false, error: "User not found." };
  if (target.is_active === active) return { ok: true, data: null };
  if (!active) {
    if (target.id === actor.id) return { ok: false, error: "You cannot deactivate yourself." };
    if (await isLastActiveSuperadmin(admin, target)) {
      return { ok: false, error: "This is the last active superadmin and cannot be deactivated." };
    }
  }

  // Ban/unban in Auth (blocks sign-in and token refresh) and flip is_active (blocks every page at once).
  const { error: authErr } = await admin.auth.admin.updateUserById(target.id, {
    ban_duration: active ? "none" : BAN_FOREVER,
  });
  if (authErr) return { ok: false, error: `Could not ${active ? "reactivate" : "deactivate"} the user.` };

  const { error } = await admin.from("profiles").update({ is_active: active }).eq("id", target.id);
  if (error) return { ok: false, error: "Could not update the user's status." };

  await audit(actor.id, active ? "user.reactivated" : "user.deactivated", target.id, { email: target.email });
  revalidatePath("/admin/users");
  return { ok: true, data: null };
}
