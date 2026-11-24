import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireHighgardenApi } from "@/server/highgarden";
import { parseRecipients } from "@/server/highgarden-data";
import { prisma } from "@/server/prisma";
import { readJson, rejectUnsafeMutation } from "@/server/request-guards";
import { errorJson } from "@/server/upstream";

const schema = z.object({
  enabled: z.boolean(),
  weeklyDigestEnabled: z.boolean(),
  recipients: z.string().max(2000),
  errorThreshold: z.number().int().min(1).max(1000),
  deadClickThreshold: z.number().int().min(1).max(1000),
  dropThreshold: z.number().int().min(1).max(100),
});

/** Save the single alert-settings row. */
export async function PUT(req: NextRequest) {
  const unsafe = rejectUnsafeMutation(req);
  if (unsafe) return unsafe;
  const auth = await requireHighgardenApi(req);
  if (auth.response) return auth.response;
  const parsed = schema.safeParse(await readJson(req));
  if (!parsed.success) return errorJson(400, "VALIDATION_ERROR", "Check the thresholds: each must be a whole number in range.");

  const { recipients: raw, ...rest } = parsed.data;
  const recipients = parseRecipients(raw);
  if ((rest.enabled || rest.weeklyDigestEnabled) && recipients.length === 0) {
    return errorJson(400, "VALIDATION_ERROR", "Add at least one valid recipient email.");
  }
  const data = { ...rest, recipientsJson: JSON.stringify(recipients) };
  await prisma.highgardenAlertSettings.upsert({ where: { id: "default" }, create: { id: "default", ...data }, update: data });
  return NextResponse.json({ ok: true, recipients });
}
