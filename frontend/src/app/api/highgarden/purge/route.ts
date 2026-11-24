import type { Prisma } from "@prisma/client";
import { TrackedEventType } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireHighgardenApi } from "@/server/highgarden";
import { dropEmptySessions } from "@/server/highgarden-data";
import { prisma } from "@/server/prisma";
import { readJson, rejectUnsafeMutation } from "@/server/request-guards";
import { errorJson } from "@/server/upstream";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const schema = z.discriminatedUnion("mode", [
  // The 90-day retention sweep.
  z.object({ mode: z.literal("retention") }),
  // A targeted purge: an event type and/or a UTC date range (inclusive days).
  z.object({ mode: z.literal("filter"), type: z.enum(TrackedEventType).optional(), from: day.optional(), to: day.optional() }),
]);

/**
 * Delete raw tracked events. Feedback is never touched here; it has its own
 * delete. Sessions left with no events and no feedback are removed too.
 */
export async function POST(req: NextRequest) {
  const unsafe = rejectUnsafeMutation(req);
  if (unsafe) return unsafe;
  const auth = await requireHighgardenApi(req);
  if (auth.response) return auth.response;
  const parsed = schema.safeParse(await readJson(req));
  if (!parsed.success) return errorJson(400, "VALIDATION_ERROR", "Choose what to delete.");

  const where: Prisma.TrackedEventWhereInput = {};
  if (parsed.data.mode === "retention") {
    where.createdAt = { lt: new Date(Date.now() - 90 * 86_400_000) };
  } else {
    const { type, from, to } = parsed.data;
    if (!type && !from && !to) return errorJson(400, "VALIDATION_ERROR", "Choose an event type or a date range first.");
    if (from && to && from > to) return errorJson(400, "VALIDATION_ERROR", "The start date is after the end date.");
    if (type) where.type = type;
    if (from || to) {
      where.createdAt = {
        ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
        ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
      };
    }
  }

  const deleted = await prisma.trackedEvent.deleteMany({ where });
  await dropEmptySessions();
  return NextResponse.json({ deletedEvents: deleted.count });
}
