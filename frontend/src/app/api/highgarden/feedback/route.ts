import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { scrubPath, scrubText } from "@/server/analytics-sanitize";
import { prisma } from "@/server/prisma";
import { readJson } from "@/server/request-guards";

const schema = z.object({
  sessionId: z.string().min(1).max(100).optional(),
  path: z.string().min(1).max(500),
  rating: z.number().int().min(1).max(5),
  category: z.string().min(1).max(80),
  comment: z.string().max(1000).optional(),
});

/** Public in-product feedback widget. Always 204: feedback must never break a page. */
export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await readJson(req));
  if (!parsed.success) return new NextResponse(null, { status: 204 });
  const { sessionId, path, rating, category, comment } = parsed.data;
  try {
    if (sessionId) {
      await prisma.visitorSession.upsert({
        where: { id: sessionId },
        create: { id: sessionId, userAgent: req.headers.get("user-agent")?.slice(0, 500) || undefined },
        update: { lastSeenAt: new Date() },
      });
    }
    await prisma.highgardenFeedback.create({
      data: { sessionId, path: scrubPath(path), rating, category: category.slice(0, 80), comment: scrubText(comment, 1000) },
    });
  } catch (err) {
    console.error(`[highgarden.feedback] ${(err as Error).message}`);
  }
  return new NextResponse(null, { status: 204 });
}
