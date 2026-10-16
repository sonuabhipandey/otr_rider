// Display formatting: all times in IST, numbers Indian-style (1,21,861).

const IST = "Asia/Kolkata";

const dateTimeFmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: IST,
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const numberFmt = new Intl.NumberFormat("en-IN");

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  return dateTimeFmt.format(typeof value === "string" ? new Date(value) : value);
}

export function formatNumber(value: number | null | undefined): string {
  return value == null ? "—" : numberFmt.format(value);
}
