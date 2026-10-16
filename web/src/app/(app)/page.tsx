import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";

// Placeholder until the Phase 4 overview.
export default async function Home() {
  const profile = await requireUser();
  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Welcome, {profile.full_name ?? profile.email}</CardTitle>
        <CardDescription>The rider dashboard arrives in Phase 4.</CardDescription>
      </CardHeader>
    </Card>
  );
}
