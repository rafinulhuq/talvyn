/**
 * In-memory IP-keyed rate limit for the public /api/signup endpoint.
 * Same shape as the existing email-keyed loginRateLimit.ts, but keyed by IP
 * since a signup attempt has no existing account to key on yet, and uses a
 * longer window since signup abuse (spam registrations) is a slower attack
 * than credential stuffing.
 */

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_TRACKED_KEYS = 5_000;

interface AttemptRecord {
  count: number;
  windowStart: number;
}

const attempts = new Map<string, AttemptRecord>();

function isWindowExpired(record: AttemptRecord): boolean {
  return Date.now() - record.windowStart > WINDOW_MS;
}

export function isSignupRateLimited(key: string): boolean {
  const record = attempts.get(key);
  if (!record) return false;
  if (isWindowExpired(record)) {
    attempts.delete(key);
    return false;
  }
  return record.count >= MAX_ATTEMPTS;
}

export function recordSignupAttempt(key: string): void {
  const existing = attempts.get(key);
  if (!existing || isWindowExpired(existing)) {
    if (attempts.size >= MAX_TRACKED_KEYS) {
      const oldestKey = attempts.keys().next().value;
      if (oldestKey !== undefined) attempts.delete(oldestKey);
    }
    attempts.set(key, { count: 1, windowStart: Date.now() });
    return;
  }
  existing.count += 1;
}
