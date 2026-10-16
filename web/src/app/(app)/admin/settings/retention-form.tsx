"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setRetentionDays } from "./actions";

export function RetentionForm({ current }: { current: number | null }) {
  const [keepAll, setKeepAll] = useState(current === null);
  const [days, setDays] = useState(String(current ?? 120));
  const [pending, start] = useTransition();

  function save() {
    start(async () => {
      const res = await setRetentionDays(keepAll ? null : Number(days));
      if (res.ok) toast.success(keepAll ? "Order rows will be kept forever." : `Order rows will be kept for ${days} days.`);
      else toast.error(res.error);
    });
  }

  return (
    <div className="grid max-w-md gap-3">
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={keepAll} onCheckedChange={(v) => setKeepAll(!!v)} />
        Keep all order rows (no automatic deletion)
      </label>
      <div className="grid gap-1.5">
        <Label htmlFor="days">Keep order rows for (days)</Label>
        <div className="flex gap-2">
          <Input
            id="days"
            type="number"
            min={30}
            max={3650}
            step={1}
            value={days}
            disabled={keepAll}
            onChange={(e) => setDays(e.target.value)}
            className="w-32"
          />
          <Button onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          A daily job at 2 AM deletes order rows older than this. Rider daily stats are never deleted, so totals,
          leaderboards and trends keep working for older dates.
        </p>
      </div>
    </div>
  );
}
