"use client";

import { useEffect, useState } from "react";
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

const ORDER = ["system", "light", "dark"] as const;
const ICON = { system: MonitorIcon, light: SunIcon, dark: MoonIcon };
const LABEL = { system: "System theme", light: "Light theme", dark: "Dark theme" };

/** Cycles system → light → dark. */
export function ThemeToggle() {
  const { theme = "system", setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- standard next-themes hydration guard
  useEffect(() => setMounted(true), []);

  const current = (mounted ? theme : "system") as (typeof ORDER)[number];
  const Icon = ICON[current] ?? MonitorIcon;
  const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];

  return (
    <Button variant="ghost" size="sm" onClick={() => setTheme(next)} aria-label={`${LABEL[current]}. Switch to ${LABEL[next]}`}>
      <Icon />
      <span className="text-xs">{mounted ? LABEL[current] : "Theme"}</span>
    </Button>
  );
}
