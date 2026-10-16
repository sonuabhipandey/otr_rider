"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CalendarIcon, ChevronDownIcon, Loader2Icon, SearchIcon, SlidersHorizontalIcon, StoreIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  filtersToQuery,
  RANGE_LABELS,
  rangeLabel,
  storesLabel,
  type Filters,
  type RangePreset,
} from "@/lib/filters";

const selectClass =
  "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

function useApply(filters: Filters) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const apply = (patch: Partial<Filters>) =>
    start(() => router.push(`${pathname}${filtersToQuery({ ...filters, ...patch })}`, { scroll: false }));
  return { apply, pending };
}

function StoreChecklist({
  all,
  selected,
  onChange,
}: {
  all: string[];
  selected: string[];
  onChange: (stores: string[]) => void;
}) {
  const toggle = (code: string) =>
    onChange(selected.includes(code) ? selected.filter((s) => s !== code) : [...selected, code].sort());
  return (
    <div className="grid gap-1">
      <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted">
        <Checkbox checked={selected.length === 0} onCheckedChange={() => onChange([])} />
        <span className="font-medium">All stores</span>
      </label>
      <div className="grid grid-cols-2 gap-1 border-t pt-1">
        {all.map((code) => (
          <label key={code} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted">
            <Checkbox checked={selected.includes(code)} onCheckedChange={() => toggle(code)} />
            <span className="tabular-nums">{code}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function RangeControls({
  filters,
  apply,
  stacked,
}: {
  filters: Filters;
  apply: (p: Partial<Filters>) => void;
  stacked?: boolean;
}) {
  // Local draft state; callers pass a `key` built from the applied range so it resets after navigation.
  const [range, setRange] = useState<RangePreset>(filters.range);
  const [from, setFrom] = useState(filters.from);
  const [to, setTo] = useState(filters.to);

  return (
    <div className={stacked ? "grid gap-2" : "flex flex-wrap items-center gap-2"}>
      <div className="flex items-center gap-1.5">
        <CalendarIcon className="size-4 text-muted-foreground" aria-hidden />
        <select
          aria-label="Business date range"
          className={`${selectClass} ${stacked ? "flex-1" : ""}`}
          value={range}
          onChange={(e) => {
            const next = e.target.value as RangePreset;
            setRange(next);
            if (next !== "custom") apply({ range: next });
          }}
        >
          {(Object.keys(RANGE_LABELS) as RangePreset[]).map((k) => (
            <option key={k} value={k}>
              {RANGE_LABELS[k]}
            </option>
          ))}
        </select>
      </div>
      {range === "custom" ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <Input type="date" aria-label="From" className="h-8 w-auto" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          <span className="text-muted-foreground">to</span>
          <Input type="date" aria-label="To" className="h-8 w-auto" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          <Button size="sm" onClick={() => from && to && apply({ range: "custom", from, to })}>
            Apply
          </Button>
        </div>
      ) : (
        <span className="text-sm text-muted-foreground tabular-nums">{rangeLabel(filters)}</span>
      )}
    </div>
  );
}

function SearchBox({ filters, apply }: { filters: Filters; apply: (p: Partial<Filters>) => void }) {
  // Keeps its own text while typing; pushes to the URL after a short pause.
  const [q, setQ] = useState(filters.q);
  useEffect(() => {
    if (q.trim() === filters.q) return;
    const t = setTimeout(() => apply({ q: q.trim() }), 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="relative">
      <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        placeholder="Search rider or last 4"
        aria-label="Search riders"
        className="h-8 pl-8"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
    </div>
  );
}

export function FilterBar({ filters, stores }: { filters: Filters; stores: string[] }) {
  const { apply, pending } = useApply(filters);
  const [sheetOpen, setSheetOpen] = useState(false);
  const rangeKey = `${filters.range}|${filters.from}|${filters.to}`;

  return (
    <>
      {/* Desktop / tablet: one row */}
      <div className="hidden flex-wrap items-center gap-2 md:flex">
        <Popover>
          <PopoverTrigger
            render={
              <Button variant="default" className="max-w-xs justify-between gap-2 font-medium" aria-label="Choose stores" />
            }
          >
            <StoreIcon />
            <span className="truncate">{storesLabel(filters.stores)}</span>
            <ChevronDownIcon className="opacity-70" />
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64">
            <StoreChecklist all={stores} selected={filters.stores} onChange={(s) => apply({ stores: s })} />
          </PopoverContent>
        </Popover>
        <RangeControls key={rangeKey} filters={filters} apply={apply} />
        <div className="ml-auto w-56">
          <SearchBox filters={filters} apply={apply} />
        </div>
        {pending && <Loader2Icon className="size-4 animate-spin text-muted-foreground" aria-label="Loading" />}
      </div>

      {/* Phone: summary button opening a bottom sheet */}
      <div className="md:hidden">
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger
            render={<Button variant="outline" className="h-auto w-full justify-between gap-2 py-2 text-left" />}
          >
            <span className="min-w-0">
              <span className="block truncate font-medium">{storesLabel(filters.stores)}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {rangeLabel(filters)}
                {filters.q ? ` · “${filters.q}”` : ""}
              </span>
            </span>
            {pending ? <Loader2Icon className="animate-spin" /> : <SlidersHorizontalIcon />}
          </SheetTrigger>
          <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
            <SheetHeader>
              <SheetTitle>Filters</SheetTitle>
            </SheetHeader>
            <div className="grid gap-5 px-4 pb-6">
              <div className="grid gap-2">
                <Label>Stores</Label>
                <StoreChecklist all={stores} selected={filters.stores} onChange={(s) => apply({ stores: s })} />
              </div>
              <div className="grid gap-2">
                <Label>Business dates</Label>
                <RangeControls key={rangeKey} filters={filters} apply={apply} stacked />
              </div>
              <div className="grid gap-2">
                <Label>Rider</Label>
                <SearchBox filters={filters} apply={apply} />
              </div>
              <Button onClick={() => setSheetOpen(false)}>
                <XIcon />
                Done
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
