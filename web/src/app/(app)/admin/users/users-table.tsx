"use client";

import { useState, useTransition } from "react";
import { MoreHorizontalIcon } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Role } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { changeRole, resetPassword, setActive } from "./actions";
import { TempPassword } from "./temp-password";

export type UserRow = {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  mustChangePassword: boolean;
  createdBy: string;
  createdAt: string;
  lastSignInAt: string | null;
};

type Pending =
  | { kind: "role"; user: UserRow; to: Role }
  | { kind: "reset"; user: UserRow }
  | { kind: "active"; user: UserRow; to: boolean };

function describe(p: Pending): { title: string; body: string; confirm: string; destructive?: boolean } {
  switch (p.kind) {
    case "role":
      return {
        title: `Make ${p.user.name} ${p.to === "superadmin" ? "a superadmin" : "an admin"}?`,
        body:
          p.to === "superadmin"
            ? "Superadmins can manage users and delete stored CSV files."
            : "Admins see all stores and upload data, but cannot manage users or delete files.",
        confirm: "Change role",
      };
    case "reset":
      return {
        title: `Reset ${p.user.name}'s password?`,
        body: "Their current password stops working. You'll get a new temporary password to send them, and they must change it when they sign in.",
        confirm: "Reset password",
        destructive: true,
      };
    case "active":
      return p.to
        ? { title: `Reactivate ${p.user.name}?`, body: "They will be able to sign in again.", confirm: "Reactivate" }
        : {
            title: `Deactivate ${p.user.name}?`,
            body: "They are signed out and cannot sign in until a superadmin reactivates them.",
            confirm: "Deactivate",
            destructive: true,
          };
  }
}

function StatusBadges({ user }: { user: UserRow }) {
  return (
    <div className="flex flex-wrap gap-1">
      {user.isActive ? <Badge variant="outline">Active</Badge> : <Badge variant="destructive">Deactivated</Badge>}
      {user.isActive && user.mustChangePassword && <Badge variant="secondary">Temp password</Badge>}
    </div>
  );
}

function RoleBadge({ role }: { role: Role }) {
  return <Badge variant={role === "superadmin" ? "default" : "secondary"}>{role}</Badge>;
}

export function UsersTable({ users, currentUserId }: { users: UserRow[]; currentUserId: string }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [newPassword, setNewPassword] = useState<{ email: string; tempPassword: string } | null>(null);
  const [busy, startTransition] = useTransition();

  function run() {
    if (!pending) return;
    const p = pending;
    startTransition(async () => {
      if (p.kind === "reset") {
        const res = await resetPassword(p.user.id);
        setPending(null);
        if (!res.ok) return void toast.error(res.error);
        setNewPassword(res.data);
        return;
      }
      const res = p.kind === "role" ? await changeRole(p.user.id, p.to) : await setActive(p.user.id, p.to);
      setPending(null);
      if (!res.ok) return void toast.error(res.error);
      toast.success(describe(p).confirm + " done");
    });
  }

  function Actions({ user }: { user: UserRow }) {
    const isSelf = user.id === currentUserId;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={`Actions for ${user.name}`} />}>
          <MoreHorizontalIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            disabled={isSelf}
            onClick={() =>
              setPending({ kind: "role", user, to: user.role === "superadmin" ? "admin" : "superadmin" })
            }
          >
            {user.role === "superadmin" ? "Make admin" : "Make superadmin"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setPending({ kind: "reset", user })}>Reset password</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={isSelf}
            variant={user.isActive ? "destructive" : "default"}
            onClick={() => setPending({ kind: "active", user, to: !user.isActive })}
          >
            {user.isActive ? "Deactivate" : "Reactivate"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  const dialog = pending ? describe(pending) : null;

  return (
    <>
      {/* Desktop table */}
      <div className="hidden rounded-lg border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created by</TableHead>
              <TableHead>Last sign-in</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id} className={u.isActive ? undefined : "text-muted-foreground"}>
                <TableCell className="font-medium">
                  {u.name}
                  {u.id === currentUserId && <span className="ml-1 text-xs text-muted-foreground">(you)</span>}
                </TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell>
                  <RoleBadge role={u.role} />
                </TableCell>
                <TableCell>
                  <StatusBadges user={u} />
                </TableCell>
                <TableCell>{u.createdBy}</TableCell>
                <TableCell>{u.lastSignInAt ? formatDateTime(u.lastSignInAt) : "Never"}</TableCell>
                <TableCell>
                  <Actions user={u} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <ul className="grid gap-2 md:hidden">
        {users.map((u) => (
          <li key={u.id} className="rounded-lg border p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {u.name}
                  {u.id === currentUserId && <span className="ml-1 text-xs text-muted-foreground">(you)</span>}
                </p>
                <p className="truncate text-sm text-muted-foreground">{u.email}</p>
              </div>
              <Actions user={u} />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1">
              <RoleBadge role={u.role} />
              <StatusBadges user={u} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Created by {u.createdBy} · Last sign-in {u.lastSignInAt ? formatDateTime(u.lastSignInAt) : "never"}
            </p>
          </li>
        ))}
      </ul>

      <AlertDialog open={!!pending} onOpenChange={(open) => !open && !busy && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dialog?.title}</AlertDialogTitle>
            <AlertDialogDescription>{dialog?.body}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <Button variant={dialog?.destructive ? "destructive" : "default"} onClick={run} disabled={busy}>
              {busy ? "Working…" : dialog?.confirm}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!newPassword} onOpenChange={(open) => !open && setNewPassword(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Password reset</DialogTitle>
          </DialogHeader>
          {newPassword && <TempPassword email={newPassword.email} password={newPassword.tempPassword} />}
          <DialogFooter>
            <Button onClick={() => setNewPassword(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
