/**
 * Highgarden queries shared by the analytics pages and their API routes.
 * Pages read Prisma directly (server components); mutations go through
 * /api/highgarden/* routes guarded by requireHighgardenApi.
 */
import "server-only";
import type { Prisma } from "@prisma/client";
import { TrackedEventType } from "@prisma/client";
import { DEVICES, EXAM_PREFIXES, type AreaKey } from "@/lib/highgarden";
import { prisma } from "@/server/prisma";

const prefix = (p: string): Prisma.TrackedEventWhereInput => ({ OR: [{ path: p }, { path: { startsWith: `${p}/` } }] });

/** Mirrors areaOf() in lib/highgarden as a Prisma filter. */
export function areaWhere(area: string): Prisma.TrackedEventWhereInput | null {
  const exam: Prisma.TrackedEventWhereInput = { OR: EXAM_PREFIXES.map(prefix) };
  const map: Partial<Record<AreaKey, Prisma.TrackedEventWhereInput>> = {
    admin: prefix("/dashboard"),
    candidate_exam: exam,
    candidate_apply: prefix("/apply"),
    blog: prefix("/blog"),
    public: { NOT: { OR: [prefix("/dashboard"), exam, prefix("/apply"), prefix("/blog")] } },
  };
  return map[area as AreaKey] ?? null;
}

export const isDevice = (v: string | undefined): v is (typeof DEVICES)[number] => DEVICES.includes(v as (typeof DEVICES)[number]);

// ─── Alert settings ──────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Splits on commas/whitespace, lower-cases, de-dupes, keeps valid addresses, max 10 (the backend's cap). */
export function parseRecipients(value: string | string[]): string[] {
  const parts = Array.isArray(value) ? value : value.split(/[\s,;]+/);
  return [...new Set(parts.map((e) => e.trim().toLowerCase()).filter((e) => EMAIL_RE.test(e)))].slice(0, 10);
}

export type AlertSettings = {
  enabled: boolean;
  weeklyDigestEnabled: boolean;
  recipients: string[];
  errorThreshold: number;
  deadClickThreshold: number;
  dropThreshold: number;
  lastSentAt: string | null;
};

export async function readAlertSettings(): Promise<AlertSettings> {
  const s = await prisma.highgardenAlertSettings.findUnique({ where: { id: "default" } });
  let recipients: string[] = [];
  try {
    const parsed: unknown = JSON.parse(s?.recipientsJson ?? "[]");
    if (Array.isArray(parsed)) recipients = parseRecipients(parsed.filter((x): x is string => typeof x === "string"));
  } catch {
    recipients = [];
  }
  return {
    enabled: s?.enabled ?? false,
    weeklyDigestEnabled: s?.weeklyDigestEnabled ?? false,
    recipients,
    errorThreshold: s?.errorThreshold ?? 5,
    deadClickThreshold: s?.deadClickThreshold ?? 10,
    dropThreshold: s?.dropThreshold ?? 25,
    lastSentAt: s?.lastSentAt?.toISOString() ?? null,
  };
}

// ─── Weekly digest ───────────────────────────────────────────

export async function weeklyDigest() {
  const since = new Date(Date.now() - 7 * 86_400_000);
  const friction = { in: [TrackedEventType.CLIENT_ERROR, TrackedEventType.DEAD_CLICK] };
  const [views, sessions, errors, deadClicks, feedback, topFriction] = await Promise.all([
    prisma.trackedEvent.count({ where: { type: TrackedEventType.PAGE_VIEW, createdAt: { gte: since } } }),
    prisma.visitorSession.count({ where: { lastSeenAt: { gte: since } } }),
    prisma.trackedEvent.count({ where: { type: TrackedEventType.CLIENT_ERROR, createdAt: { gte: since } } }),
    prisma.trackedEvent.count({ where: { type: TrackedEventType.DEAD_CLICK, createdAt: { gte: since } } }),
    prisma.highgardenFeedback.count({ where: { createdAt: { gte: since } } }),
    prisma.trackedEvent.groupBy({
      by: ["path"],
      where: { type: friction, createdAt: { gte: since } },
      _count: { _all: true },
      orderBy: { _count: { path: "desc" } },
      take: 3,
    }),
  ]);
  const signals = errors + deadClicks;
  return {
    summary:
      signals > 0
        ? `Highgarden recorded ${signals} friction signal${signals === 1 ? "" : "s"} (client errors and dead clicks) in the last 7 days.`
        : "Highgarden recorded no client errors or dead clicks in the last 7 days.",
    metrics: [
      { label: "Page views", value: views },
      { label: "Visitor sessions", value: sessions },
      { label: "Client errors", value: errors },
      { label: "Dead clicks", value: deadClicks },
      { label: "Feedback submissions", value: feedback },
      ...topFriction.map((r) => ({ label: `Friction: ${r.path}`.slice(0, 80), value: r._count._all })),
    ],
  };
}

/** Deletes sessions left with no events and no feedback after a purge. */
export const dropEmptySessions = () => prisma.visitorSession.deleteMany({ where: { events: { none: {} }, feedback: { none: {} } } });
