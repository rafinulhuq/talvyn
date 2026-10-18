/**
 * Server-only validation for the candidate invitation magic-link token.
 *
 * This hits FastAPI's internal URL directly (not via apiClient/serverFetch)
 * because /api/v1/invitations/validate/{token} is intentionally PUBLIC — no
 * X-Internal-Token — unlike every other internal endpoint those helpers call.
 *
 * Shared by SectionedExamInvitationLanding (bank-mode) and
 * TestInvitationLanding (legacy single-test) — both flows validate the same
 * token shape before rendering their invitation landing page.
 */

import type { TokenValidationResponse } from "@/types/invitation";

export const INVALID_INVITATION_RESPONSE: TokenValidationResponse = {
  valid: false,
  reason: "not_found",
  candidate_name: null,
  jd_title: null,
  test_titles: [],
  invitation_status: null,
  expires_at: null,
  next_test_index: null,
  total_tests: 0,
};

export async function validateInvitationToken(
  token: string | null
): Promise<TokenValidationResponse> {
  if (!token) return INVALID_INVITATION_RESPONSE;
  const baseUrl = process.env.FASTAPI_INTERNAL_URL ?? "http://localhost:8000";
  try {
    const res = await fetch(
      `${baseUrl}/api/v1/invitations/validate/${encodeURIComponent(token)}?mark_opened=true`,
      { cache: "no-store" }
    );
    if (!res.ok) return INVALID_INVITATION_RESPONSE;
    return res.json();
  } catch {
    return INVALID_INVITATION_RESPONSE;
  }
}

/** Derives the "hours left" and formatted countdown values shared by both landing flows. */
export function computeExpiry(expiresAtIso: string | null) {
  if (!expiresAtIso) return { expiresAt: null, hoursLeft: null };
  const expiresAt = new Date(expiresAtIso).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
  const hoursLeft = Math.max(
    0,
    Math.ceil((new Date(expiresAtIso).getTime() - Date.now()) / (1000 * 60 * 60))
  );
  return { expiresAt, hoursLeft };
}
