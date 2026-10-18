/**
 * requireServerEnv — fail loudly instead of silently falling back.
 *
 * Several server-only modules used to do `process.env.X ?? "<default>"`,
 * so a missing INTERNAL_API_SECRET in production silently became an empty
 * string forwarded as X-Internal-Token, and a missing FASTAPI_INTERNAL_URL
 * silently became "http://localhost:8000" — which doesn't resolve inside a
 * container. Both produce a confusing downstream failure (a generic 401 or
 * a connection error) instead of pointing at the actual misconfiguration.
 *
 * Call this inside a function body (request time), not at module top
 * level — top-level `const x = requireServerEnv(...)` would throw the
 * moment the module is first imported, which can happen during `next
 * build`'s static analysis before runtime env vars are necessarily set.
 */
export function requireServerEnv(name: string, devFallback?: string): string {
  const value = process.env[name];
  if (value) return value;

  if (devFallback !== undefined && process.env.NODE_ENV !== "production") {
    return devFallback;
  }

  throw new Error(`Missing required environment variable: ${name}`);
}
