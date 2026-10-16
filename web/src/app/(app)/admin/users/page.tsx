import type { Metadata } from "next";
import { requireSuperadmin, type Role } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { AddUserDialog } from "./add-user-dialog";
import { UsersTable, type UserRow } from "./users-table";

export const metadata: Metadata = { title: "Users · FastBeetle Riders" };

type ProfileRow = {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  is_active: boolean;
  must_change_password: boolean;
  created_by: string | null;
  created_at: string;
};

export default async function UsersPage() {
  const me = await requireSuperadmin();
  const admin = createAdminClient();

  const [{ data: profiles, error }, { data: authList }] = await Promise.all([
    admin
      .from("profiles")
      .select("id, email, full_name, role, is_active, must_change_password, created_by, created_at")
      .order("created_at")
      .returns<ProfileRow[]>(),
    admin.auth.admin.listUsers({ perPage: 1000 }),
  ]);
  if (error) throw error;

  const lastSignIn = new Map(authList?.users.map((u) => [u.id, u.last_sign_in_at ?? null]));
  const nameById = new Map(profiles.map((p) => [p.id, p.full_name ?? p.email]));

  const users: UserRow[] = profiles.map((p) => ({
    id: p.id,
    name: p.full_name ?? "—",
    email: p.email,
    role: p.role,
    isActive: p.is_active,
    mustChangePassword: p.must_change_password,
    createdBy: p.created_by ? (nameById.get(p.created_by) ?? "—") : "Setup script",
    createdAt: p.created_at,
    lastSignInAt: lastSignIn.get(p.id) ?? null,
  }));

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Users</h1>
          <p className="text-sm text-muted-foreground">
            {users.filter((u) => u.isActive).length} active of {users.length}
          </p>
        </div>
        <AddUserDialog />
      </div>
      <UsersTable users={users} currentUserId={me.id} />
    </div>
  );
}
