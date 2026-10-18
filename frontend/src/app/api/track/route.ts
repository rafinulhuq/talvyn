import { NextRequest, NextResponse } from "next/server";
import { TrackedEventType } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const MAX_METADATA_KEYS = 20;
const MAX_METADATA_BYTES = 2000;
const SENSITIVE_METADATA_KEY_RE = /(answer|candidate|cv|email|file|name|pass|password|phone|resume|secret|token)/i;

const trackSchema = z.object({
  sessionId: z.string().min(1).max(100),
  type: z.enum(TrackedEventType),
  path: z.string().min(1).max(500),
  targetLabel: z.string().max(200).optional(),
  targetSelector: z.string().max(200).optional(),
  referrer: z.string().max(500).optional(),
  viewportWidth: z.number().int().positive().max(10000).optional(),
  viewportHeight: z.number().int().positive().max(10000).optional(),
  deviceType: z.enum(["desktop", "tablet", "mobile", "unknown"]).optional(),
  xPct: z.number().min(0).max(100).optional(),
  yPct: z.number().min(0).max(100).optional(),
  metadataJson: z
    .record(z.string().max(50), z.union([z.string().max(200), z.number(), z.boolean(), z.null()]))
    .optional(),
});

function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

function browserName(userAgent: string): string | null {
  if (/Edg\//.test(userAgent)) return "Edge";
  if (/Chrome\//.test(userAgent) && !/Chromium/.test(userAgent)) return "Chrome";
  if (/Firefox\//.test(userAgent)) return "Firefox";
  if (/Safari\//.test(userAgent) && !/Chrome\//.test(userAgent)) return "Safari";
  return null;
}

function osName(userAgent: string): string | null {
  if (/Windows NT/.test(userAgent)) return "Windows";
  if (/Android/.test(userAgent)) return "Android";
  if (/(iPhone|iPad|iPod)/.test(userAgent)) return "iOS";
  if (/Mac OS X/.test(userAgent)) return "macOS";
  if (/Linux/.test(userAgent)) return "Linux";
  return null;
}

function requestCountry(req: NextRequest): string | null {
  const value = req.headers.get("cf-ipcountry")?.toUpperCase();
  return value && /^[A-Z]{2}$/.test(value) ? value : null;
}

function sanitizeText(value: string | undefined, max: number): string | undefined {
  const cleaned = value
    ?.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/(token|secret|password|passphrase|key)=([^&\s]+)/gi, "$1=[redacted]")
    .replace(/[0-9a-f]{24,}/gi, "[id]")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned ? cleaned.slice(0, max) : undefined;
}

function sanitizePath(value: string): string {
  try {
    return new URL(value, "https://talvyn.local").pathname.slice(0, 500) || "/";
  } catch {
    return value.split(/[?#]/)[0]?.slice(0, 500) || "/";
  }
}

function sanitizeReferrer(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`.slice(0, 500);
  } catch {
    return sanitizeText(value.split(/[?#]/)[0], 500);
  }
}

function sanitizeMetadata(
  metadata: Record<string, string | number | boolean | null> | undefined
): Record<string, string | number | boolean | null> | undefined {
  if (!metadata) return undefined;
  const entries = Object.entries(metadata)
    .filter(([key]) => !SENSITIVE_METADATA_KEY_RE.test(key))
    .slice(0, MAX_METADATA_KEYS)
    .map(([key, value]) => [key, typeof value === "string" ? sanitizeText(value, 200) ?? null : value]);
  const safe = Object.fromEntries(entries);
  return JSON.stringify(safe).length <= MAX_METADATA_BYTES ? safe : undefined;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = trackSchema.safeParse(body);

  // Analytics must never break the product experience.
  if (!parsed.success) return noContent();

  const {
    sessionId,
    type,
    path,
    targetLabel,
    targetSelector,
    referrer,
    viewportWidth,
    viewportHeight,
    deviceType,
    xPct,
    yPct,
    metadataJson,
  } = parsed.data;
  const userAgent = req.headers.get("user-agent")?.slice(0, 500) || null;
  const metadata = sanitizeMetadata(metadataJson);
  const storesCoordinates = type === TrackedEventType.CLICK || type === TrackedEventType.DEAD_CLICK;

  try {
    await prisma.visitorSession.upsert({
      where: { id: sessionId },
      create: { id: sessionId, userAgent: userAgent || undefined },
      update: { lastSeenAt: new Date(), ...(userAgent ? { userAgent } : {}) },
    });
    await prisma.trackedEvent.create({
      data: {
        sessionId,
        type,
        path: sanitizePath(path),
        targetLabel: sanitizeText(targetLabel, 200),
        targetSelector: sanitizeText(targetSelector, 200),
        referrer: sanitizeReferrer(referrer),
        viewportWidth,
        viewportHeight,
        deviceType,
        browserName: userAgent ? browserName(userAgent) : null,
        osName: userAgent ? osName(userAgent) : null,
        country: requestCountry(req),
        metadataJson: metadata,
        xPct: storesCoordinates ? xPct : undefined,
        yPct: storesCoordinates ? yPct : undefined,
      },
    });
  } catch (error) {
    console.error("[highgarden.track] ingestion failed:", error);
  }

  return noContent();
}
