import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const ENV_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "AUTOMATION_UPLOAD_KEY",
] as const;

// Phase 0 placeholder. Renders on the server, so it only reports whether each variable is set, never its value.
export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>FastBeetle Rider Dashboard</CardTitle>
          <CardDescription>Setup check — the dashboard arrives in Phase 4.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1 text-sm">
            {ENV_VARS.map((name) => {
              const set = Boolean(process.env[name]);
              return (
                <li key={name} className="flex items-center justify-between gap-2">
                  <code className="truncate text-xs">{name}</code>
                  <span className={set ? "text-emerald-600" : "text-destructive"}>
                    {set ? "set" : "missing"}
                  </span>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </main>
  );
}
