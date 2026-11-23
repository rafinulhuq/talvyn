import * as Sentry from "@sentry/nextjs";

// GlitchTip (Sentry-compatible). Disabled — zero overhead — unless the DSN is set.
if (process.env.NEXT_PUBLIC_GLITCHTIP_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_GLITCHTIP_DSN,
    tracesSampleRate: 0.1,
    integrations: [],
    sendDefaultPii: false,
  });
}
