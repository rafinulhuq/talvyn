/**
 * In-process fixed-window rate limiter.
 *
 * Why in-memory and not Redis: the frontend runs as ONE Next.js process, so a
 * Map is already consistent; it resets on deploy, which is acceptable for
 * slowing credential stuffing and signup spam. If the frontend is ever scaled
 * to multiple instances, move this to Redis like the backend's limiter.
 *
 * `whenFull` decides what happens when the key table is at capacity:
 *   "evict-oldest" — keep accepting new keys (login/signup: availability)
 *   "reject"       — refuse new keys (password reset: never let an attacker
 *                    flush an active bucket by flooding fake keys)
 */
type Bucket = { count: number; windowStart: number };

export function createRateLimiter({
  max,
  windowMs,
  maxKeys = 5_000,
  whenFull = "evict-oldest",
}: {
  max: number;
  windowMs: number;
  maxKeys?: number;
  whenFull?: "evict-oldest" | "reject";
}) {
  const buckets = new Map<string, Bucket>();
  const live = (b: Bucket | undefined, now: number): b is Bucket => !!b && now - b.windowStart <= windowMs;

  function makeRoom(now: number): boolean {
    if (buckets.size < maxKeys) return true;
    for (const [key, b] of buckets) if (!live(b, now)) buckets.delete(key);
    if (buckets.size < maxKeys) return true;
    if (whenFull === "reject") return false;
    const oldest = buckets.keys().next().value;
    if (oldest !== undefined) buckets.delete(oldest);
    return true;
  }

  return {
    /** True if the key has used up its window. Does not count an attempt. */
    isLimited(key: string, now = Date.now()): boolean {
      const b = buckets.get(key);
      if (!live(b, now)) {
        buckets.delete(key);
        return false;
      }
      return b.count >= max;
    },
    /** Count one attempt. Returns false if the attempt is over the limit (or the table is full in "reject" mode). */
    hit(key: string, now = Date.now()): boolean {
      const b = buckets.get(key);
      if (live(b, now)) {
        if (b.count >= max) return false;
        b.count += 1;
        return true;
      }
      if (!makeRoom(now)) return false;
      buckets.set(key, { count: 1, windowStart: now });
      return true;
    },
    reset(key: string): void {
      buckets.delete(key);
    },
  };
}

// Login: 5 failures per email per 15 min. Keyed by normalized email — IP isn't
// reliably available inside NextAuth's authorize(), and the threat is
// brute-forcing a handful of real admin accounts.
export const loginLimiter = createRateLimiter({ max: 5, windowMs: 15 * 60_000 });
// Signup: 5 per IP per hour (no account to key on yet).
export const signupLimiter = createRateLimiter({ max: 5, windowMs: 60 * 60_000 });
// Password reset, 15-min windows, fail closed when the key table is full.
// Separate tables per purpose so each limit can't starve the others.
export const resetRequestIpLimiter = createRateLimiter({ max: 10, windowMs: 15 * 60_000, whenFull: "reject" });
export const resetRequestEmailLimiter = createRateLimiter({ max: 3, windowMs: 15 * 60_000, whenFull: "reject" });
export const resetRedeemIpLimiter = createRateLimiter({ max: 20, windowMs: 15 * 60_000, whenFull: "reject" });
