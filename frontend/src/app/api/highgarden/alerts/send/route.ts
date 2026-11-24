import { NextResponse, type NextRequest } from "next/server";
import { getAppUrl } from "@/lib/site-url";
import { requireHighgardenApi } from "@/server/highgarden";
import { readAlertSettings, weeklyDigest } from "@/server/highgarden-data";
import { backendFetch } from "@/server/internal-api";
import { prisma } from "@/server/prisma";
import { rejectUnsafeMutation } from "@/server/request-guards";
import { errorJson } from "@/server/upstream";

/**
 * Send the 7-day digest now. Metrics are computed here (Highgarden data lives
 * in this app's tables); the backend only renders and sends the email.
 */
export async function POST(req: NextRequest) {
  const unsafe = rejectUnsafeMutation(req, { requireJson: false });
  if (unsafe) return unsafe;
  const auth = await requireHighgardenApi(req);
  if (auth.response) return auth.response;

  const settings = await readAlertSettings();
  if (settings.recipients.length === 0) return errorJson(400, "NO_RECIPIENTS", "Save at least one recipient before sending.");

  const digest = await weeklyDigest();
  const res = await backendFetch<{ sent: number; failed: number }>("/api/v1/admin/highgarden-alerts/send", {
    method: "POST",
    actorId: auth.user.id,
    cache: "no-store",
    body: JSON.stringify({
      recipients: settings.recipients,
      subject: "Highgarden weekly digest",
      summary: digest.summary,
      metrics: digest.metrics.slice(0, 12),
      action_url: `${getAppUrl()}/dashboard/highgarden`,
    }),
  });
  if (!res.ok) return errorJson(502, "SEND_FAILED", `The email service didn't accept the digest (HTTP ${res.status}).`);
  if (res.data.sent === 0) return errorJson(502, "SEND_FAILED", "No digest emails were sent. Check the mail settings.");

  await prisma.highgardenAlertSettings.update({ where: { id: "default" }, data: { lastSentAt: new Date() } });
  return NextResponse.json(res.data);
}
