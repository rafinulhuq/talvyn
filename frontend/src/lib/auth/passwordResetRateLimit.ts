// Same single-process deployment scope as loginRateLimit. Resets on restart.
const buckets = new Map<string, { count: number; expires: number }>();
const WINDOW_MS = 15 * 60 * 1000;

export function takePasswordResetAttempt(key: string, limit: number, now = Date.now()): boolean {
  const existing = buckets.get(key);
  if (existing && existing.expires > now) {
    if (existing.count >= limit) return false;
    existing.count += 1;
    return true;
  }
  if (buckets.size >= 5000) {
    for (const [id, bucket] of buckets) if (bucket.expires <= now) buckets.delete(id);
    // Fail closed instead of evicting an active bucket and bypassing its limit.
    if (buckets.size >= 5000) return false;
  }
  buckets.set(key, { count: 1, expires: now + WINDOW_MS });
  return true;
}
