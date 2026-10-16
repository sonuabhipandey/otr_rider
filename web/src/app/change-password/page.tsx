import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentProfile } from "@/lib/auth";
import { MIN_PASSWORD_LENGTH } from "@/lib/passwords";
import { signOut } from "../login/actions";
import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: "Change password · FastBeetle Riders" };

export default async function ChangePasswordPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!profile.must_change_password) redirect("/");

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Set your password</CardTitle>
          <CardDescription>
            Signed in as {profile.email}. Replace your temporary password before continuing.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <ChangePasswordForm minLength={MIN_PASSWORD_LENGTH} />
          <form action={signOut}>
            <Button type="submit" variant="ghost" size="sm" className="w-full">
              Sign out
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
