/**
 * Emails for the HighGarden OTP gate. Wraps the backend's SuperAdminActor-
 * gated /admin/highgarden-otp/* endpoints (see backend/app/api/v1/admin.py)
 * via the shared serverFetch helper. The recipient address is fixed
 * server-side in the backend (settings.highgarden_otp_email) — never
 * caller-supplied — so a hijacked Super Admin session still can't redirect
 * the code to itself.
 */

import { serverFetch } from "@/lib/api/serverFetch";

interface OtpDispatchResponse {
  sent: boolean;
}

/** Sends the OTP + "someone is attempting to unlock HighGarden" email. Returns whether it actually sent. */
export async function sendHighgardenOtpEmail(code: string): Promise<boolean> {
  const result = await serverFetch<OtpDispatchResponse>("/api/v1/admin/highgarden-otp/send", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
  return result?.sent ?? false;
}

/** Best-effort "HighGarden was unlocked" confirmation — never blocks granting access. */
export async function notifyHighgardenUnlocked(): Promise<void> {
  await serverFetch<OtpDispatchResponse>("/api/v1/admin/highgarden-otp/confirm", { method: "POST" });
}
