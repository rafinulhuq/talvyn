/**
 * Candidate magic-link session (A8-4).
 *
 * The invitation email links to /test/<token>, /tests/<token> or
 * /exam/<token>. Middleware redeems that one-time URL hit into an
 * httpOnly cookie and redirects to the tokenless /tests/session or
 * /exam/session routes; from then on the token only travels
 * server-side (Next server components read the cookie to validate,
 * and the /api/candidate proxy injects it upstream). Client JS never
 * sees it.
 *
 * This module is imported by Edge middleware — keep it dependency-free.
 */

export const ATTEMPT_TOKEN_COOKIE = "ov_attempt_token";

/**
 * Invitations expire server-side (validate/attempt auth re-check on every
 * request); the cookie just has to outlive the longest plausible sitting.
 */
export const ATTEMPT_TOKEN_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

/**
 * Static segments that can follow /test, /tests or /exam without being a
 * magic-link token. "session" is the tokenless route family itself.
 */
const RESERVED_SEGMENTS = new Set(["session", "complete", "expired"]);

interface TokenRedemption {
  token: string;
  redirectTo: string;
}

/**
 * If `pathname` is a candidate URL still carrying a magic-link token,
 * return the token and the tokenless path to redirect to. Otherwise null.
 *
 *   /test/<t>            → /tests/session        (legacy family folds into /tests)
 *   /tests/<t>           → /tests/session
 *   /test(s)/<t>/exam    → /tests/session/exam
 *   /exam/<t>            → /exam/session
 *   /exam/<t>/section    → /exam/session/section
 */
export function redeemTokenPath(pathname: string): TokenRedemption | null {
  const match = pathname.match(/^\/(test|tests|exam)\/([^/]+)(\/.*)?$/);
  if (!match) return null;

  const [, family, segment, rest = ""] = match;
  if (RESERVED_SEGMENTS.has(segment)) return null;

  const base = family === "exam" ? "/exam/session" : "/tests/session";
  return { token: decodeURIComponent(segment), redirectTo: `${base}${rest}` };
}
