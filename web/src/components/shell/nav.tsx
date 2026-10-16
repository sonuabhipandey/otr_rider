"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import {
  BikeIcon,
  ClockIcon,
  HistoryIcon,
  LayoutDashboardIcon,
  MenuIcon,
  SettingsIcon,
  StoreIcon,
  UploadIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./theme-toggle";

type Item = { href: string; label: string; icon: LucideIcon; dashboard?: boolean };

const DASHBOARD: Item[] = [
  { href: "/", label: "Overview", icon: LayoutDashboardIcon, dashboard: true },
  { href: "/riders", label: "Riders", icon: BikeIcon, dashboard: true },
  { href: "/stores", label: "Stores", icon: StoreIcon, dashboard: true },
  { href: "/hourly", label: "Hourly", icon: ClockIcon, dashboard: true },
];

function adminItems(isSuperadmin: boolean): Item[] {
  return [
    { href: "/admin/upload", label: "Upload", icon: UploadIcon },
    { href: "/admin/uploads", label: "Upload history", icon: HistoryIcon },
    ...(isSuperadmin
      ? [
          { href: "/admin/users", label: "Users", icon: UsersIcon },
          { href: "/admin/settings", label: "Settings", icon: SettingsIcon },
        ]
      : []),
  ];
}

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/** Dashboard links keep the current store/date/search filters. */
function useHref() {
  const params = useSearchParams();
  const keep = new URLSearchParams();
  for (const k of ["stores", "range", "from", "to", "q"]) {
    const v = params.get(k);
    if (v) keep.set(k, v);
  }
  const qs = keep.toString();
  return (item: Item) => (item.dashboard && qs ? `${item.href}?${qs}` : item.href);
}

export function SidebarNav({ isSuperadmin }: { isSuperadmin: boolean }) {
  const pathname = usePathname();
  const href = useHref();
  const link = (item: Item) => {
    const active = isActive(pathname, item.href);
    return (
      <Link
        key={item.href}
        href={href(item)}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors",
          active ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        <item.icon className="size-4" />
        {item.label}
      </Link>
    );
  };
  return (
    <nav className="grid gap-4">
      <div className="grid gap-0.5">{DASHBOARD.map(link)}</div>
      <div className="grid gap-0.5">
        <p className="px-2.5 pb-1 text-xs font-medium text-muted-foreground">Admin</p>
        {adminItems(isSuperadmin).map(link)}
      </div>
    </nav>
  );
}

export function BottomTabs({ isSuperadmin, footer }: { isSuperadmin: boolean; footer: React.ReactNode }) {
  const pathname = usePathname();
  const href = useHref();
  const [open, setOpen] = useState(false);
  const admin = adminItems(isSuperadmin);
  const adminActive = admin.some((i) => isActive(pathname, i.href));

  const tab = (active: boolean) =>
    cn(
      "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px]",
      active ? "font-medium text-primary" : "text-muted-foreground",
    );

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      {DASHBOARD.map((item) => (
        <Link key={item.href} href={href(item)} className={tab(isActive(pathname, item.href))}>
          <item.icon className="size-5" />
          {item.label}
        </Link>
      ))}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger render={<button type="button" className={tab(adminActive)} />}>
          <MenuIcon className="size-5" />
          More
        </SheetTrigger>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>More</SheetTitle>
          </SheetHeader>
          <div className="grid gap-1 px-4">
            {admin.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5",
                  isActive(pathname, item.href) ? "bg-primary/10 font-medium text-primary" : "hover:bg-muted",
                )}
              >
                <item.icon className="size-5" />
                {item.label}
              </Link>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2 border-t px-4 pt-3 pb-6">
            <ThemeToggle />
            {footer}
          </div>
        </SheetContent>
      </Sheet>
    </nav>
  );
}
