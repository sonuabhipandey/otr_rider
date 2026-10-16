// Creates the first superadmin with a random temporary password, printed once.
// Usage (from /web):  node --env-file=.env.local scripts/seed-superadmin.mts [email] [full name]
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const email = (process.argv[2] ?? "abhijeet@fastbeetle.com").toLowerCase();
const fullName = process.argv[3] ?? "Abhijeet";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in web/.env.local");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

const { data: existing, error: existingErr } = await supabase
  .from("profiles")
  .select("id")
  .eq("email", email)
  .maybeSingle();
if (existingErr) throw existingErr;
if (existing) {
  console.error(`${email} already exists. Nothing changed.`);
  process.exit(1);
}

// 16 chars from base64url, guaranteed to contain a digit and a symbol.
const tempPassword = randomBytes(12).toString("base64url") + "7!";

const { data: created, error: createErr } = await supabase.auth.admin.createUser({
  email,
  password: tempPassword,
  email_confirm: true,
  user_metadata: { full_name: fullName },
});
if (createErr) throw createErr;

const { error: profileErr } = await supabase.from("profiles").insert({
  id: created.user.id,
  email,
  full_name: fullName,
  role: "superadmin",
  is_active: true,
  must_change_password: true,
});
if (profileErr) {
  await supabase.auth.admin.deleteUser(created.user.id);
  throw profileErr;
}

await supabase.from("audit_log").insert({
  actor_id: null,
  action: "user.seeded",
  target: created.user.id,
  details: { email, role: "superadmin" },
});

console.log(`Superadmin created: ${email}`);
console.log(`Temporary password (shown once): ${tempPassword}`);
console.log("You will be asked to change it on first login.");
