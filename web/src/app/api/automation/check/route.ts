import type { NextRequest } from "next/server";
import { hasBearer, unauthorized } from "@/lib/bearer";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/automation/check?date=YYYY-MM-DD  (Authorization: Bearer AUTOMATION_UPLOAD_KEY)
// Returns { count }: orders whose Created At falls on that calendar date in IST (midnight to midnight,
// not the 6 AM business day).
export async function GET(request: NextRequest) {
  if (!hasBearer(request, process.env.AUTOMATION_UPLOAD_KEY)) return unauthorized();

  const date = request.nextUrl.searchParams.get("date") ?? "";
  const start = new Date(`${date}T00:00:00+05:30`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(start.getTime())) {
    return Response.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }
  const end = new Date(start.getTime() + 86_400_000);

  const { count, error } = await createAdminClient()
    .from("orders")
    .select("order_id", { count: "exact", head: true })
    .gte("created_at", start.toISOString())
    .lt("created_at", end.toISOString());
  if (error) return Response.json({ error: "Query failed." }, { status: 500 });

  return Response.json({ date, count: count ?? 0 });
}
