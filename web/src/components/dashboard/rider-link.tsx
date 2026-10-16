import Link from "next/link";
import { filtersToQuery, type Filters } from "@/lib/filters";

/** Link to a rider's profile that keeps the current filters. */
export function RiderLink({
  id,
  name,
  last4,
  filters,
  className,
}: {
  id: string;
  name: string;
  last4: string | null;
  filters: Filters;
  className?: string;
}) {
  return (
    <Link href={`/riders/${id}${filtersToQuery({ ...filters, q: "" })}`} className={className ?? "font-medium hover:underline"}>
      {name}
      {last4 && <span className="ml-1 text-xs font-normal text-muted-foreground tabular-nums">…{last4}</span>}
    </Link>
  );
}
