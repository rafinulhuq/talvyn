import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const feedbackSchema = z.object({
  sessionId: z.string().min(1).max(100).optional(),
  path: z.string().min(1).max(500),
  rating: z.number().int().min(1).max(5),
  category: z.string().min(1).max(80),
  comment: z.string().max(1000).optional(),
});

function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

function sanitizeComment(value: string | undefined): string | undefined {
  const cleaned = value
    ?.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/(token|secret|password|passphrase|key)=([^&\s]+)/gi, "$1=[redacted]")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned ? cleaned.slice(0, 1000) : undefined;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = feedbackSchema.safeParse(body);
  if (!parsed.success) return noContent();

  const { sessionId, path, rating, category, comment } = parsed.data;

  try {
    if (sessionId) {
      await prisma.visitorSession.upsert({
        where: { id: sessionId },
        create: {
          id: sessionId,
          userAgent: req.headers.get("user-agent")?.slice(0, 500) || undefined,
        },
        update: { lastSeenAt: new Date() },
      });
    }
    await prisma.highgardenFeedback.create({
      data: {
        sessionId,
        path,
        rating,
        category,
        comment: sanitizeComment(comment),
      },
    });
  } catch (error) {
    console.error("[highgarden.feedback] submission failed:", error);
  }

  return noContent();
}
