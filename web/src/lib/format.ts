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

const timeFmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: IST,
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
});

const numberFmt = new Intl.NumberFormat("en-IN");
const dec1 = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const dec2 = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  return dateTimeFmt.format(typeof value === "string" ? new Date(value) : value);
}

/** Time of day in IST, e.g. "2:28:27 pm". */
export function formatTime(value: string | null | undefined): string {
  return value ? timeFmt.format(new Date(value)) : "—";
}

/** IST date-time as "YYYY-MM-DD HH:MM:SS" (for Excel cells). */
export function istStamp(value: string | null | undefined): string {
  if (!value) return "";
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: IST,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(value))
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

export function formatNumber(value: number | null | undefined): string {
  return value == null ? "—" : numberFmt.format(value);
}

export function formatDecimal(value: number | null | undefined, digits: 1 | 2 = 1): string {
  return value == null ? "—" : (digits === 1 ? dec1 : dec2).format(value);
}

export function formatPct(value: number | null | undefined): string {
  return value == null ? "—" : `${dec1.format(value)}%`;
}

/** Minutes, e.g. "0.61 min". */
export function formatMinutes(value: number | null | undefined): string {
  return value == null ? "—" : `${dec2.format(value)} min`;
}

/** Hour of the business day: 6 -> "6 AM", 0 -> "12 AM". */
export function formatHour(h: number): string {
  const suffix = h < 12 ? "AM" : "PM";
  const v = h % 12 === 0 ? 12 : h % 12;
  return `${v} ${suffix}`;
}

/** Hours in business-day order: 6 AM … 11 PM, 12 AM … 5 AM. */
export const BUSINESS_HOURS = [...Array.from({ length: 18 }, (_, i) => i + 6), 0, 1, 2, 3, 4, 5];
