// Role-guard check: signs in as a NON-superadmin and proves the server refuses superadmin-only things,
// even when the UI is bypassed and the server actions are called directly.
//
// Run against a production build (server action IDs come from .next/server):
//   npm run build && npx next start -p 3100        (in one terminal)
//   node --env-file=.env.local scripts/check-role-guards.mts [http://localhost:3100]   (in another)
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

const base = process.argv[2] ?? "http://localhost:3100";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function ask(question: string, hidden = false): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (hidden) {
    // Hide what is typed after the prompt.
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => {
      if (s.startsWith(question)) process.stdout.write(question);
    };
  }
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer.trim());
    }),
  );
}

// --- sign in, capturing the exact cookies @supabase/ssr would set in a browser -------------------
const jar = new Map<string, string>();
const ssr = createServerClient(url, anon, {
  cookies: {
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    setAll: (cookies) => cookies.forEach(({ name, value }) => (value ? jar.set(name, value) : jar.delete(name))),
  },
});

const email = await ask("Admin (non-superadmin) email: ");
const password = await ask("Password: ", true);
const { data: signIn, error: signInErr } = await ssr.auth.signInWithPassword({ email, password });
if (signInErr || !signIn.session) {
  console.error("Sign-in failed:", signInErr?.message);
  process.exit(1);
}
const cookieHeader = [...jar].map(([n, v]) => `${n}=${v}`).join("; ");

// A plain client acting as this user, for direct database attempts.
const asUser = createClient(url, anon, {
  global: { headers: { Authorization: `Bearer ${signIn.session.access_token}` } },
  auth: { persistSession: false },
});

const { data: me } = await asUser.from("profiles").select("role, must_change_password").eq("id", signIn.user.id).single();
if (me?.role !== "admin") {
  console.error(`This account's role is "${me?.role}". Use an admin (not superadmin) account.`);
  process.exit(1);
}
if (me.must_change_password) {
  console.error("Sign in through the app once and change the temporary password first.");
  process.exit(1);
}

// --- checks -----------------------------------------------------------------------------------
const results: { check: string; pass: boolean; detail: string }[] = [];
const record = (check: string, pass: boolean, detail: string) => results.push({ check, pass, detail });

// 1. The page itself
{
  const res = await fetch(`${base}/admin/users`, { headers: { Cookie: cookieHeader }, redirect: "manual" });
  record("GET /admin/users returns 404", res.status === 404, `status ${res.status}`);
}

// 2. Server actions called directly, bypassing the UI
const manifest = JSON.parse(readFileSync(".next/server/server-reference-manifest.json", "utf8"));
const actionId = (name: string, page: string) =>
  Object.entries<{ exportedName: string; workers: Record<string, unknown> }>(manifest.node).find(
    ([, v]) => v.exportedName === name && `app/(app)${page}/page` in v.workers,
  )?.[0];

const NOT_ALLOWED = "You are not allowed to do this.";
const someone = signIn.user.id; // target: the caller themself (harmless if the guard held)
const { data: anyUpload } = await asUser.from("uploads").select("id").limit(1).maybeSingle();
const calls: [string, string, unknown[]][] = [
  ["/admin/users", "createUser", [{ fullName: "Guard Test", email: "guard-test@example.test", role: "superadmin" }]],
  ["/admin/users", "changeRole", [someone, "superadmin"]],
  ["/admin/users", "resetPassword", [someone]],
  ["/admin/users", "setActive", [someone, false]],
  ["/admin/uploads", "deleteFile", [anyUpload?.id ?? "00000000-0000-0000-0000-000000000000"]],
  ["/admin/uploads", "deleteAllFiles", []],
];
for (const [page, name, args] of calls) {
  const id = actionId(name, page);
  if (!id) {
    record(`action ${name} refused`, false, "action id not found; run `npm run build` first");
    continue;
  }
  const res = await fetch(`${base}${page}`, {
    method: "POST",
    headers: {
      Cookie: cookieHeader,
      "Next-Action": id,
      Accept: "text/x-component",
      Origin: base,
      "Content-Type": "text/plain;charset=UTF-8",
    },
    body: JSON.stringify(args),
    redirect: "manual",
  });
  const body = await res.text();
  record(`action ${name} refused`, body.includes(NOT_ALLOWED), `status ${res.status}`);
}

// 3. Direct database writes with the admin's own token (RLS / grants)
{
  const { data, error } = await asUser.from("profiles").update({ role: "superadmin" }).eq("id", someone).select();
  record("DB: promote self in profiles", !!error || (data?.length ?? 0) === 0, error?.message ?? `${data?.length} rows`);
}
{
  const { error } = await asUser.from("audit_log").insert({ action: "guard.test" });
  record("DB: write audit_log", !!error, error?.message ?? "insert succeeded!");
}
{
  const { error } = await asUser.from("stores").insert({ code: "ZZZ9", display_name: "guard test" });
  record("DB: insert store", !!error, error?.message ?? "insert succeeded!");
}
{
  const { error } = await asUser.rpc("process_upload", { p_upload_id: "00000000-0000-0000-0000-000000000000" });
  record("DB: call process_upload", !!error, error?.message ?? "call succeeded!");
}
{
  const { error } = await asUser.rpc("get_db_size");
  record("DB: call get_db_size (superadmin only)", !!error, error?.message ?? "call succeeded!");
}

await ssr.auth.signOut();

console.table(results.map((r) => ({ result: r.pass ? "PASS" : "FAIL", check: r.check, detail: r.detail })));
const failed = results.filter((r) => !r.pass).length;
console.log(failed ? `${failed} check(s) FAILED` : "All role guards held.");
process.exit(failed ? 1 : 0);
