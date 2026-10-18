/**
 * In-memory login lockout for the credentials provider.
 *
 * Not Redis-backed like the backend's per-route limiter (app/core/ratelimit.py) —
 * this app runs as a single Next.js process (no multi-worker fan-out like
 * uvicorn's 4 workers), so an in-process Map is consistent on its own and
 * needs no shared store. It resets on deploy/restart, which is acceptable
 * for slowing down credential-stuffing against a small admin-only user base,
 * not for airtight enforcement across a horizontally-scaled fleet.
 *
 * Locks by normalized email rather than IP: the realistic threat here is
 * brute-forcing the handful of real admin accounts, and IP isn't reliably
 * available from NextAuth's `authorize(credentials, req)` second argument
 * across deployments (proxies, the App Router route handler, etc.).
 */

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_TRACKED_KEYS = 5_000; // bound memory against an attacker cycling fake emails

interface AttemptRecord {
  count: number;
  windowStart: number;
}

const attempts = new Map<string, AttemptRecord>();

function isWindowExpired(record: AttemptRecord): boolean {
  return Date.now() - record.windowStart > WINDOW_MS;
}

/** Returns true if this email is currently locked out from further attempts. */
export function isLockedOut(email: string): boolean {
  const record = attempts.get(email);
  if (!record) return false;
  if (isWindowExpired(record)) {
    attempts.delete(email);
    return false;
  }
  return record.count >= MAX_ATTEMPTS;
}

/** Record a failed login attempt for this email. */
export function recordFailedAttempt(email: string): void {
  const existing = attempts.get(email);
  if (!existing || isWindowExpired(existing)) {
    if (attempts.size >= MAX_TRACKED_KEYS) {
      // Evict the oldest entry rather than let the map grow unbounded.
      const oldestKey = attempts.keys().next().value;
      if (oldestKey !== undefined) attempts.delete(oldestKey);
    }
    attempts.set(email, { count: 1, windowStart: Date.now() });
    return;
  }
  existing.count += 1;
}

/** Clear the lockout window on a successful login. */
export function clearAttempts(email: string): void {
  attempts.delete(email);
}
