"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DEACTIVATED_MESSAGE } from "./messages";

export type LoginState = { error?: string; email?: string };

export async function signIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password.", email };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.code === "user_banned") return { error: DEACTIVATED_MESSAGE, email };
    return { error: "Wrong email or password.", email };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_active, must_change_password")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!profile || !profile.is_active) {
    await supabase.auth.signOut();
    return { error: DEACTIVATED_MESSAGE, email };
  }

  redirect(profile.must_change_password ? "/change-password" : "/");
}

export async function signOut() {
  const supabase = await createClient();
  // This browser only; the person may also be signed in on their phone.
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login");
}
