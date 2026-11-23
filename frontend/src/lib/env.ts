/**
 * Read a required server env var at request time; throw instead of silently
 * falling back. A missing INTERNAL_API_SECRET used to become an empty
 * X-Internal-Token (a confusing generic 401 downstream) — failing here names
 * the actual misconfiguration.
 *
 * Call inside a function body, never at module top level: `next build`
 * imports modules before runtime env vars exist.
 */
export function requireServerEnv(name: string, devFallback?: string): string {
  const value = process.env[name];
  if (value) return value;
  if (devFallback !== undefined && process.env.NODE_ENV !== "production") return devFallback;
  throw new Error(`Missing required environment variable: ${name}`);
}
