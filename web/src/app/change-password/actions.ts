"use server";

import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { getCurrentProfile } from "@/lib/auth";
import { MIN_PASSWORD_LENGTH } from "@/lib/passwords";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type ChangePasswordState = { error?: string };

export async function changePassword(
  _prev: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const profile = await getCurrentProfile();
  if (!profile || !profile.is_active) redirect("/login");

  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Use at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (password !== confirm) return { error: "The two passwords do not match." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (error.code === "same_password") {
      return { error: "Choose a password different from your temporary one." };
    }
    if (error.code === "weak_password") return { error: "That password is too weak. Try a longer one." };
    return { error: error.message };
  }

  const { error: updateErr } = await createAdminClient()
    .from("profiles")
    .update({ must_change_password: false })
    .eq("id", profile.id);
  if (updateErr) return { error: "Password changed, but saving your profile failed. Try again." };

  await audit(profile.id, "user.password_changed", profile.id, { email: profile.email });
  redirect("/");
}
