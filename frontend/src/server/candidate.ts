import "server-only";
import { DEFAULT_CANDIDATE_COPY, mergeCopy, type CandidateCopy } from "@/lib/cms/candidate-copy";
import { backendBaseUrl } from "@/server/internal-api";
import type { PublicLinkResolve, TokenValidation } from "@/types/attempt";

const INVALID: TokenValidation = {
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

/**
 * Validates the invitation token from the httpOnly cookie. The validate
 * endpoint is public on the backend (no internal token), and marks the
 * invitation OPENED the first time it's checked.
 */
export async function validateInvitation(token: string | null): Promise<TokenValidation> {
  if (!token) return INVALID;
  try {
    const res = await fetch(`${backendBaseUrl()}/api/v1/invitations/validate/${encodeURIComponent(token)}?mark_opened=true`, { cache: "no-store" });
    return res.ok ? ((await res.json()) as TokenValidation) : INVALID;
  } catch {
    return INVALID;
  }
}

export async function resolvePublicLink(slug: string): Promise<PublicLinkResolve> {
  const fallback: PublicLinkResolve = { valid: false, jd_title: null, link_title: null, tests: [], reason: "not_found" };
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(slug)) return fallback;
  try {
    const res = await fetch(`${backendBaseUrl()}/api/v1/public-links/resolve/${slug}`, { cache: "no-store" });
    return res.ok ? ((await res.json()) as PublicLinkResolve) : fallback;
  } catch {
    return fallback;
  }
}

/** Candidate copy with any Website content overrides applied. Falls back to defaults if the CMS is unreachable. */
export async function candidateCopy(): Promise<CandidateCopy> {
  try {
    const res = await fetch(`${backendBaseUrl()}/api/v1/cmp/public/content`, { cache: "no-store" });
    if (!res.ok) return DEFAULT_CANDIDATE_COPY;
    const data = (await res.json()) as { candidate_experience?: unknown };
    return mergeCopy(DEFAULT_CANDIDATE_COPY, data.candidate_experience);
  } catch {
    return DEFAULT_CANDIDATE_COPY;
  }
}
