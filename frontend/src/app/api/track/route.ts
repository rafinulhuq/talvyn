import { TrackedEventType } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { browserName, osName, scrubMetadata, scrubPath, scrubReferrer, scrubText } from "@/server/analytics-sanitize";
import { prisma } from "@/server/prisma";
import { readJson } from "@/server/request-guards";

const schema = z.object({
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
  metadataJson: z.record(z.string().max(50), z.union([z.string().max(200), z.number(), z.boolean(), z.null()])).optional(),
});

const countryOf = (req: NextRequest) => {
  const v = req.headers.get("cf-ipcountry")?.toUpperCase();
  return v && /^[A-Z]{2}$/.test(v) ? v : null;
};

/** Public analytics ingestion. Always 204: analytics must never break the product. */
export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await readJson(req));
  if (!parsed.success) return new NextResponse(null, { status: 204 });
  const e = parsed.data;
  const ua = req.headers.get("user-agent")?.slice(0, 500) || null;
  const isClick = e.type === TrackedEventType.CLICK || e.type === TrackedEventType.DEAD_CLICK;

  try {
    await prisma.visitorSession.upsert({
      where: { id: e.sessionId },
      create: { id: e.sessionId, userAgent: ua || undefined },
      update: { lastSeenAt: new Date(), ...(ua ? { userAgent: ua } : {}) },
    });
    await prisma.trackedEvent.create({
      data: {
        sessionId: e.sessionId,
        type: e.type,
        path: scrubPath(e.path),
        targetLabel: scrubText(e.targetLabel, 200),
        targetSelector: scrubText(e.targetSelector, 200),
        referrer: scrubReferrer(e.referrer),
        viewportWidth: e.viewportWidth,
        viewportHeight: e.viewportHeight,
        deviceType: e.deviceType,
        browserName: ua ? browserName(ua) : null,
        osName: ua ? osName(ua) : null,
        country: countryOf(req),
        metadataJson: scrubMetadata(e.metadataJson),
        xPct: isClick ? e.xPct : undefined,
        yPct: isClick ? e.yPct : undefined,
      },
    });
  } catch (err) {
    console.error(`[highgarden.track] ${(err as Error).message}`);
  }
  return new NextResponse(null, { status: 204 });
}
