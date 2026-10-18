"use server";

import { revalidatePath } from "next/cache";
import { Prisma, TrackedEventType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireHighgardenAccess } from "@/lib/highgarden";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseRecipients(value: string): string[] {
  return [...new Set(
    value
      .split(/[\s,;]+/)
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean)
      .filter((entry) => EMAIL_RE.test(entry))
  )].slice(0, 10);
}

function appUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    "http://localhost:3003"
  ).replace(/\/$/, "");
}

export async function purgeOldHighgardenEvents() {
  await requireHighgardenAccess();
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const deleted = await prisma.trackedEvent.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  await prisma.visitorSession.deleteMany({
    where: { events: { none: {} }, lastSeenAt: { lt: cutoff } },
  });
  revalidatePath("/dashboard/highgarden");
  revalidatePath("/dashboard/highgarden/sessions");
  return { deletedEvents: deleted.count };
}

export async function saveHighgardenAlertSettings(formData: FormData) {
  await requireHighgardenAccess();
  const recipients = parseRecipients(String(formData.get("recipients") || ""));
  const enabled = formData.get("enabled") === "on";
  const weeklyDigestEnabled = formData.get("weeklyDigestEnabled") === "on";
  const errorThreshold = Math.max(1, Math.min(1000, Number(formData.get("errorThreshold") || 5)));
  const deadClickThreshold = Math.max(1, Math.min(1000, Number(formData.get("deadClickThreshold") || 10)));
  const dropThreshold = Math.max(1, Math.min(100, Number(formData.get("dropThreshold") || 25)));

  if ((enabled || weeklyDigestEnabled) && recipients.length === 0) {
    return { ok: false, message: "Add at least one valid recipient email." };
  }

  await prisma.highgardenAlertSettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      enabled,
      weeklyDigestEnabled,
      recipientsJson: JSON.stringify(recipients),
      errorThreshold,
      deadClickThreshold,
      dropThreshold,
    },
    update: {
      enabled,
      weeklyDigestEnabled,
      recipientsJson: JSON.stringify(recipients),
      errorThreshold,
      deadClickThreshold,
      dropThreshold,
    },
  });
  revalidatePath("/dashboard/highgarden");
  revalidatePath("/dashboard/highgarden/alerts");
  return { ok: true, message: "Alert settings saved." };
}

export async function sendHighgardenAlertDigest() {
  const session = await requireHighgardenAccess();
  const settings = await prisma.highgardenAlertSettings.findUnique({ where: { id: "default" } });
  const storedRecipients = ((): string[] => {
    if (!settings?.recipientsJson) return [];
    try {
      const parsed = JSON.parse(settings.recipientsJson);
      return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : [];
    } catch {
      return [];
    }
  })();
  const recipients = parseRecipients(storedRecipients.join(","));
  if (recipients.length === 0) {
    return { ok: false, message: "Add at least one valid recipient before sending." };
  }

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [views, sessions, errors, deadClicks, feedback, topFriction] = await Promise.all([
    prisma.trackedEvent.count({ where: { type: TrackedEventType.PAGE_VIEW, createdAt: { gte: since } } }),
    prisma.visitorSession.count({ where: { lastSeenAt: { gte: since } } }),
    prisma.trackedEvent.count({ where: { type: TrackedEventType.CLIENT_ERROR, createdAt: { gte: since } } }),
    prisma.trackedEvent.count({ where: { type: TrackedEventType.DEAD_CLICK, createdAt: { gte: since } } }),
    prisma.highgardenFeedback.count({ where: { createdAt: { gte: since } } }),
    prisma.trackedEvent.groupBy({
      by: ["path"],
      where: { type: { in: [TrackedEventType.CLIENT_ERROR, TrackedEventType.DEAD_CLICK] }, createdAt: { gte: since } },
      _count: { _all: true },
      orderBy: { _count: { path: "desc" } },
      take: 3,
    }),
  ]);

  const fastapiUrl = process.env.FASTAPI_INTERNAL_URL;
  const internalToken = process.env.INTERNAL_API_SECRET;
  if (!fastapiUrl || !internalToken) {
    return { ok: false, message: "FASTAPI_INTERNAL_URL or INTERNAL_API_SECRET is missing." };
  }

  const response = await fetch(`${fastapiUrl}/api/v1/admin/highgarden-alerts/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Token": internalToken,
      "X-Actor-Id": session.user.id,
    },
    body: JSON.stringify({
      recipients,
      subject: "Highgarden weekly digest",
      summary:
        topFriction.length > 0
          ? `Highgarden found ${errors + deadClicks} friction signal${errors + deadClicks === 1 ? "" : "s"} in the last 7 days.`
          : "Highgarden did not find client-error or dead-click friction in the last 7 days.",
      action_url: `${appUrl()}/dashboard/highgarden`,
      metrics: [
        { label: "Page views", value: views },
        { label: "Unique sessions", value: sessions },
        { label: "Client errors", value: errors },
        { label: "Dead clicks", value: deadClicks },
        { label: "Feedback submissions", value: feedback },
        ...topFriction.map((row) => ({ label: `Friction: ${row.path}`.slice(0, 80), value: row._count._all })),
      ],
    }),
  });

  if (!response.ok) {
    return { ok: false, message: `Email send failed with HTTP ${response.status}.` };
  }
  const result = (await response.json().catch(() => null)) as { sent?: number; failed?: number } | null;
  await prisma.highgardenAlertSettings.update({
    where: { id: "default" },
    data: { lastSentAt: new Date() },
  });
  revalidatePath("/dashboard/highgarden/alerts");
  return { ok: true, message: `Digest sent to ${result?.sent ?? recipients.length} recipient${(result?.sent ?? recipients.length) === 1 ? "" : "s"}.` };
}

export async function purgeHighgardenEventsByFilter(formData: FormData) {
  await requireHighgardenAccess();

  const eventType = String(formData.get("eventType") || "ALL");
  const beforeRaw = String(formData.get("before") || "");
  const fromRaw = String(formData.get("from") || "");
  const toRaw = String(formData.get("to") || "");

  const where: Prisma.TrackedEventWhereInput = {};
  if (Object.values(TrackedEventType).includes(eventType as TrackedEventType)) {
    where.type = eventType as TrackedEventType;
  }

  const createdAt: Prisma.DateTimeFilter = {};
  const before = beforeRaw ? new Date(`${beforeRaw}T23:59:59.999Z`) : null;
  const from = fromRaw ? new Date(`${fromRaw}T00:00:00.000Z`) : null;
  const to = toRaw ? new Date(`${toRaw}T23:59:59.999Z`) : null;

  if (before && Number.isFinite(before.getTime())) createdAt.lte = before;
  if (from && Number.isFinite(from.getTime())) createdAt.gte = from;
  if (to && Number.isFinite(to.getTime())) createdAt.lte = to;
  if (createdAt.gte || createdAt.lte) where.createdAt = createdAt;

  if (!where.type && !where.createdAt) {
    return { deletedEvents: 0, error: "Choose an event type or date range before purging." };
  }

  const deleted = await prisma.trackedEvent.deleteMany({ where });
  await prisma.visitorSession.deleteMany({
    where: { events: { none: {} }, feedback: { none: {} } },
  });
  revalidatePath("/dashboard/highgarden");
  revalidatePath("/dashboard/highgarden/sessions");
  revalidatePath("/dashboard/highgarden/heatmaps");
  return { deletedEvents: deleted.count };
}

export async function updateHighgardenFeedbackStatus(
  id: string,
  status: "UNREAD" | "READ" | "ARCHIVED"
) {
  await requireHighgardenAccess();
  await prisma.highgardenFeedback.update({
    where: { id },
    data: { status },
  });
  revalidatePath("/dashboard/highgarden");
  revalidatePath("/dashboard/highgarden/feedback");
}

export async function deleteHighgardenFeedback(id: string) {
  await requireHighgardenAccess();
  await prisma.highgardenFeedback.delete({ where: { id } });
  revalidatePath("/dashboard/highgarden");
  revalidatePath("/dashboard/highgarden/feedback");
}
