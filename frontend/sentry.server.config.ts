/**
 * Sentry SDK v10's Next.js integration recommends adding `src/instrumentation.ts`
 * (a `register()` hook re-exporting this file) and an `onRequestError` hook,
 * warning this setup is otherwise "incomplete." Deliberately not added:
 * `register()` runs unconditionally on every server/middleware boot, and an
 * unconditional `await import("./sentry.server.config")` from it pulls the
 * whole Sentry SDK into the Edge Middleware bundle regardless of whether
 * GLITCHTIP_DSN is set — Edge Middleware compiles to one bundle with no
 * code-splitting, so even gating the import behind the same env check
 * inside `register()` didn't help (measured: 53.5kB disabled either way,
 * but ungated it became 136kB even when disabled). That directly
 * contradicts this project's "zero overhead when disabled" design, so the
 * two harmless build-time warnings are the accepted trade-off — this file's
 * own init still runs correctly without it.
 */
import * as Sentry from "@sentry/nextjs";

if (process.env.GLITCHTIP_DSN) {
  Sentry.init({
    dsn: process.env.GLITCHTIP_DSN,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
  });
}
