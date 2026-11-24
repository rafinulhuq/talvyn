/**
 * Highgarden helpers shared by the browser tracker and the analytics pages.
 * Client-safe: no secrets, no Prisma.
 */

// ─── Date ranges (?days=today|7|30|90; default 30) ───────────

export const RANGES = [
  { key: "today", label: "Today", days: 1 },
  { key: "7", label: "7 days", days: 7 },
  { key: "30", label: "30 days", days: 30 },
  { key: "90", label: "90 days", days: 90 },
] as const;
export type RangeKey = (typeof RANGES)[number]["key"];

export function parseRange(raw: string | string[] | undefined): { key: RangeKey; days: number; label: string } {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const r = RANGES.find((x) => x.key === value) ?? RANGES[2];
  return { key: r.key, days: r.days, label: r.label };
}

/** Start of the range. "Today" means since local midnight, not the last 24h. */
export function rangeStart(days: number, now = Date.now()): Date {
  const d = new Date(now - days * 86_400_000);
  if (days === 1) {
    const midnight = new Date(now);
    midnight.setHours(0, 0, 0, 0);
    return midnight;
  }
  return d;
}

// ─── Product areas, derived from the path ────────────────────

export const AREAS = [
  { key: "admin", label: "Admin app" },
  { key: "candidate_exam", label: "Candidate test" },
  { key: "candidate_apply", label: "Apply page" },
  { key: "blog", label: "Blog" },
  { key: "public", label: "Public site" },
] as const;
export type AreaKey = (typeof AREAS)[number]["key"];

export const EXAM_PREFIXES = ["/tests", "/test", "/exam"] as const;

const startsWithSegment = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

export function areaOf(path: string): AreaKey {
  if (startsWithSegment(path, "/dashboard")) return "admin";
  if (EXAM_PREFIXES.some((p) => startsWithSegment(path, p))) return "candidate_exam";
  if (startsWithSegment(path, "/apply")) return "candidate_apply";
  if (startsWithSegment(path, "/blog")) return "blog";
  return "public";
}

export const areaLabel = (path: string) => AREAS.find((a) => a.key === areaOf(path))?.label ?? "Public site";

export const DEVICES = ["desktop", "tablet", "mobile", "unknown"] as const;
export const deviceLabel = (d: string) => (d ? d.charAt(0).toUpperCase() + d.slice(1) : "Unknown");

// ─── Privacy: never read labels from these elements ──────────

export const BLOCKED_SELECTOR = [
  "[data-hg-ignore]",
  "[data-no-track]",
  "[data-candidate-answer]",
  "[data-testid*='answer' i]",
  "[aria-label*='answer' i]",
  "input",
  "textarea",
  "select",
  "[contenteditable]",
  "[role='textbox']",
  ".ProseMirror",
  ".tiptap",
  "[name*='password' i]",
  "[name*='passphrase' i]",
  "[name*='token' i]",
  "[name*='secret' i]",
  "[name*='email' i]",
  "[name*='phone' i]",
  "[type='password']",
  "[type='email']",
  "[type='file']",
  "[autocomplete='email']",
  "[autocomplete='current-password']",
  "[autocomplete='new-password']",
].join(",");

// ─── Anonymous visitor id (first-party cookie, 1 year) ───────

const SESSION_COOKIE = "hg_sid";

export function visitorId(): string {
  const found = document.cookie.split("; ").find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  if (found) return decodeURIComponent(found.slice(SESSION_COOKIE.length + 1));
  const id = crypto.randomUUID();
  document.cookie = `${SESSION_COOKIE}=${encodeURIComponent(id)}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  return id;
}

// ─── Formatting ──────────────────────────────────────────────

export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export const EVENT_LABEL: Record<string, string> = {
  PAGE_VIEW: "Page view",
  CLICK: "Click",
  CLIENT_ERROR: "Client error",
  DEAD_CLICK: "Dead click",
};

export const FEEDBACK_STATUSES = ["UNREAD", "READ", "ARCHIVED"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];
