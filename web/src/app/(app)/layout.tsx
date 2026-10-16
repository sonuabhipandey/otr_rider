import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { signOut } from "../login/actions";

// Interim shell. Phase 4 replaces this with the sidebar / bottom tab bar and global filters.
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const profile = await requireUser();
  const isSuperadmin = profile.role === "superadmin";

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-3">
        <Link href="/" className="font-semibold">
          FastBeetle Riders
        </Link>
        <nav className="flex items-center gap-3 text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground">
            Overview
          </Link>
          {isSuperadmin && (
            <Link href="/admin/users" className="hover:text-foreground">
              Users
            </Link>
          )}
        </nav>
        <div className="ml-auto flex items-center gap-2 text-sm">
          <span className="hidden text-muted-foreground sm:inline">{profile.full_name ?? profile.email}</span>
          <Badge variant={isSuperadmin ? "default" : "secondary"}>{profile.role}</Badge>
          <form action={signOut}>
            <Button type="submit" variant="ghost" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </header>
      <main className="flex flex-1 flex-col p-4">{children}</main>
    </div>
  );
}
