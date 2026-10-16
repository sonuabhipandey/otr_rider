import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Role = "superadmin" | "admin";

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  is_active: boolean;
  must_change_password: boolean;
};

/** The signed-in user's profile, or null. Cached per request. */
export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, is_active, must_change_password")
    .eq("id", user.id)
    .maybeSingle<Profile>();
  return data;
});

/** For pages: an active user who has already changed their temporary password. */
export async function requireUser(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!profile.is_active) redirect("/login?error=deactivated");
  if (profile.must_change_password) redirect("/change-password");
  return profile;
}

/** For pages: superadmins only. Everyone else gets a 404, so the page's existence is not revealed. */
export async function requireSuperadmin(): Promise<Profile> {
  const profile = await requireUser();
  if (profile.role !== "superadmin") notFound();
  return profile;
}

export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

export const NOT_ALLOWED = "You are not allowed to do this.";

/**
 * For server actions and route handlers: returns the caller's profile if they hold one of `roles`,
 * otherwise null. Never trust the UI to have hidden the button.
 */
export async function authorize(roles: Role[]): Promise<Profile | null> {
  const profile = await getCurrentProfile();
  if (!profile || !profile.is_active || profile.must_change_password) return null;
  return roles.includes(profile.role) ? profile : null;
}
