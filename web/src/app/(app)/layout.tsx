import { Suspense } from "react";
import Link from "next/link";
import { BarChart3Icon, LogOutIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BottomTabs, SidebarNav } from "@/components/shell/nav";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { requireUser } from "@/lib/auth";
import { signOut } from "../login/actions";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const profile = await requireUser();
  const isSuperadmin = profile.role === "superadmin";

  const signOutButton = (
    <form action={signOut}>
      <Button type="submit" variant="ghost" size="sm">
        <LogOutIcon />
        Sign out
      </Button>
    </form>
  );

  return (
    <div className="flex min-h-dvh flex-1">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r bg-sidebar px-3 py-4 md:flex">
        <Link href="/" className="mb-6 flex items-center gap-2 px-2.5 font-semibold">
          <BarChart3Icon className="size-5 text-primary" />
          FastBeetle Riders
        </Link>
        <Suspense>
          <SidebarNav isSuperadmin={isSuperadmin} />
        </Suspense>
        <div className="mt-auto grid gap-2 border-t pt-3">
          <div className="px-2.5">
            <p className="truncate text-sm font-medium">{profile.full_name ?? profile.email}</p>
            <Badge variant="secondary" className="mt-1">
              {profile.role}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <ThemeToggle />
            {signOutButton}
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col pb-20 md:pb-0">
        {/* Phone top strip */}
        <header className="flex items-center gap-2 border-b px-4 py-2.5 md:hidden">
          <BarChart3Icon className="size-5 text-primary" />
          <span className="font-semibold">FastBeetle Riders</span>
          <Badge variant="secondary" className="ml-auto">
            {profile.role}
          </Badge>
        </header>
        <main className="flex flex-1 flex-col gap-4 p-4 md:p-6">{children}</main>
      </div>

      <Suspense>
        <BottomTabs isSuperadmin={isSuperadmin} footer={signOutButton} />
      </Suspense>
    </div>
  );
}
