"use client";

import { useState, useTransition } from "react";
import { PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createUser } from "./actions";
import { TempPassword } from "./temp-password";

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export function AddUserDialog() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [created, setCreated] = useState<{ email: string; tempPassword: string }>();
  const [pending, startTransition] = useTransition();

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setError(undefined);
      setCreated(undefined);
    }
  }

  function onSubmit(formData: FormData) {
    setError(undefined);
    startTransition(async () => {
      const res = await createUser({
        fullName: formData.get("fullName"),
        email: formData.get("email"),
        role: formData.get("role"),
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setCreated(res.data);
      toast.success(`User ${res.data.email} created`);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button />}>
        <PlusIcon />
        Add user
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{created ? "User created" : "Add user"}</DialogTitle>
          {!created && (
            <DialogDescription>A temporary password is generated and shown once.</DialogDescription>
          )}
        </DialogHeader>

        {created ? (
          <>
            <TempPassword email={created.email} password={created.tempPassword} />
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <form action={onSubmit} className="grid gap-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="grid gap-2">
              <Label htmlFor="fullName">Name</Label>
              <Input id="fullName" name="fullName" required autoComplete="off" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required autoComplete="off" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="role">Role</Label>
              <select id="role" name="role" defaultValue="admin" className={selectClass}>
                <option value="admin">Admin: sees all stores, uploads data</option>
                <option value="superadmin">Superadmin: also manages users and files</option>
              </select>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {pending ? "Creating…" : "Create user"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
