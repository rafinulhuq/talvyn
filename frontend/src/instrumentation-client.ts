/**
 * Sentry/GlitchTip browser-side init.
 *
 * Migrated from the old `sentry.client.config.ts` (Sentry SDK v10's Next.js
 * integration deprecated that file in favor of Next.js's own
 * `instrumentation-client.ts` convention — and explicitly stopped honoring
 * the old file under Turbopack, which `npm run dev` uses). Content is
 * unchanged from the old file, just relocated.
 */

import * as Sentry from "@sentry/nextjs";

// Only initialise when NEXT_PUBLIC_GLITCHTIP_DSN is set.
// Leaving the env var unset (the default) disables Sentry with zero overhead.
if (process.env.NEXT_PUBLIC_GLITCHTIP_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_GLITCHTIP_DSN,
    tracesSampleRate: 0.1,
    // Don't capture browser console errors — only unhandled exceptions.
    integrations: [],
    // Keep PII out of error reports.
    sendDefaultPii: false,
  });
}
