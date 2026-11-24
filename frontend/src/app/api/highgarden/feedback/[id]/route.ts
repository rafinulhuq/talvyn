import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { FEEDBACK_STATUSES } from "@/lib/highgarden";
import { isSafeId } from "@/server/auth/require-user";
import { requireHighgardenApi } from "@/server/highgarden";
import { prisma } from "@/server/prisma";
import { readJson, rejectUnsafeMutation } from "@/server/request-guards";
import { errorJson } from "@/server/upstream";

type Ctx = { params: Promise<{ id: string }> };
const schema = z.object({ status: z.enum(FEEDBACK_STATUSES) });

/** Mark a feedback item unread / read / archived. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const unsafe = rejectUnsafeMutation(req);
  if (unsafe) return unsafe;
  const auth = await requireHighgardenApi(req);
  if (auth.response) return auth.response;
  const { id } = await params;
  if (!isSafeId(id)) return errorJson(404, "NOT_FOUND", "Feedback not found.");
  const parsed = schema.safeParse(await readJson(req));
  if (!parsed.success) return errorJson(400, "VALIDATION_ERROR", "Choose unread, read or archived.");
  // updateMany so a missing row is a clean 404 instead of a thrown P2025.
  const { count } = await prisma.highgardenFeedback.updateMany({ where: { id }, data: { status: parsed.data.status } });
  return count ? NextResponse.json({ ok: true }) : errorJson(404, "NOT_FOUND", "Feedback not found.");
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const unsafe = rejectUnsafeMutation(req, { requireJson: false });
  if (unsafe) return unsafe;
  const auth = await requireHighgardenApi(req);
  if (auth.response) return auth.response;
  const { id } = await params;
  if (!isSafeId(id)) return errorJson(404, "NOT_FOUND", "Feedback not found.");
  const { count } = await prisma.highgardenFeedback.deleteMany({ where: { id } });
  return count ? NextResponse.json({ ok: true }) : errorJson(404, "NOT_FOUND", "Feedback not found.");
}
