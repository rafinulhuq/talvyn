const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/**
 * The backend serializes UTC timestamps without a zone ("2026-11-23T10:43:58").
 * JS parses zone-less ISO date-times as LOCAL time, which shifted every time by
 * the viewer's UTC offset. Treat zone-less values as UTC.
 */
export function parseApiDate(iso: string): Date {
  const zoned = /([zZ]|[+-]\d{2}:?\d{2})$/.test(iso) || !iso.includes("T");
  return new Date(zoned ? iso : `${iso}Z`);
}

/** "3 minutes ago", "yesterday", or a date for anything older than a week. */
export function formatRelative(iso: string, now = Date.now()): string {
  const t = parseApiDate(iso).getTime();
  if (Number.isNaN(t)) return "";
  const s = Math.round((t - now) / 1000);
  const abs = Math.abs(s);
  if (abs < 45) return "just now";
  if (abs < 3600) return rtf.format(Math.round(s / 60), "minute");
  if (abs < 86_400) return rtf.format(Math.round(s / 3600), "hour");
  if (abs < 7 * 86_400) return rtf.format(Math.round(s / 86_400), "day");
  return formatDate(iso);
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(parseApiDate(iso));
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(parseApiDate(iso));
}
