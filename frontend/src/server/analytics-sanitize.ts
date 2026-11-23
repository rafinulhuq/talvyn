/**
 * Scrubbing for data that arrives from the unauthenticated tracking endpoints.
 * Analytics must never store candidate PII, secrets, or full URLs with tokens.
 */
export function scrubText(value: string | undefined, max: number): string | undefined {
  const cleaned = value
    ?.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/(token|secret|password|passphrase|key)=([^&\s]+)/gi, "$1=[redacted]")
    .replace(/[0-9a-f]{24,}/gi, "[id]")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned ? cleaned.slice(0, max) : undefined;
}

/** Path only: drops query and hash (magic-link tokens, search terms). */
export function scrubPath(value: string): string {
  try {
    return new URL(value, "https://talvyn.local").pathname.slice(0, 500) || "/";
  } catch {
    return value.split(/[?#]/)[0]?.slice(0, 500) || "/";
  }
}

export function scrubReferrer(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`.slice(0, 500);
  } catch {
    return scrubText(value.split(/[?#]/)[0], 500);
  }
}

const SENSITIVE_KEY = /(answer|candidate|cv|email|file|name|pass|password|phone|resume|secret|token)/i;
type MetaValue = string | number | boolean | null;

export function scrubMetadata(meta: Record<string, MetaValue> | undefined): Record<string, MetaValue> | undefined {
  if (!meta) return undefined;
  const safe = Object.fromEntries(
    Object.entries(meta)
      .filter(([key]) => !SENSITIVE_KEY.test(key))
      .slice(0, 20)
      .map(([key, v]) => [key, typeof v === "string" ? (scrubText(v, 200) ?? null) : v]),
  );
  return JSON.stringify(safe).length <= 2000 ? safe : undefined;
}

export function browserName(ua: string): string | null {
  if (/Edg\//.test(ua)) return "Edge";
  if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) return "Chrome";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return "Safari";
  return null;
}

export function osName(ua: string): string | null {
  if (/Windows NT/.test(ua)) return "Windows";
  if (/Android/.test(ua)) return "Android";
  if (/(iPhone|iPad|iPod)/.test(ua)) return "iOS";
  if (/Mac OS X/.test(ua)) return "macOS";
  if (/Linux/.test(ua)) return "Linux";
  return null;
}

/** Neutralize spreadsheet formula injection, then CSV-quote. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const toCsv = (headers: string[], rows: unknown[][]) =>
  [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
