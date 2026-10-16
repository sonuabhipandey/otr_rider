import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DEACTIVATED_MESSAGE } from "./messages";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in · FastBeetle Riders" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>FastBeetle Rider Dashboard</CardTitle>
          <CardDescription>Sign in with the email and password your superadmin gave you.</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm initialError={error === "deactivated" ? DEACTIVATED_MESSAGE : undefined} />
        </CardContent>
      </Card>
    </main>
  );
}
