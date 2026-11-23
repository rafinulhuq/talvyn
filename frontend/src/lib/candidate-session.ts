/**
 * Candidate magic-link session. The emailed /test(s)/<token> or /exam/<token>
 * URL is redeemed once in src/proxy.ts: the token moves into an httpOnly
 * cookie and the browser is redirected to the tokenless /tests/session or
 * /exam/session route, so the token never sits in the address bar, history,
 * referrers, or anything client JS can read.
 */

// Name kept from the previous frontend so in-flight candidate sessions survive the deploy.
export const ATTEMPT_TOKEN_COOKIE = "ov_attempt_token";

/** Invitations expire server-side; the cookie only has to outlive the longest sitting. */
export const ATTEMPT_TOKEN_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

const RESERVED_SEGMENTS = new Set(["session", "complete", "expired"]);

/**
 *   /test/<t>, /tests/<t>     → /tests/session
 *   /test(s)/<t>/exam         → /tests/session/exam
 *   /exam/<t>                 → /exam/session
 *   /exam/<t>/section         → /exam/session/section
 */
export function redeemTokenPath(pathname: string): { token: string; redirectTo: string } | null {
  const match = pathname.match(/^\/(test|tests|exam)\/([^/]+)(\/.*)?$/);
  if (!match) return null;
  const [, family, segment = "", rest = ""] = match;
  if (RESERVED_SEGMENTS.has(segment)) return null;
  let token: string;
  try {
    token = decodeURIComponent(segment);
  } catch {
    return null; // malformed %-escape: not a token we issued
  }
  return { token, redirectTo: `${family === "exam" ? "/exam/session" : "/tests/session"}${rest}` };
}
