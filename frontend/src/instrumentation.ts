import type { Instrumentation } from "next";

/**
 * Server-side GlitchTip. The previous frontend skipped this file because the
 * Edge middleware bundle would pull in the whole SDK; src/proxy.ts runs on
 * Node in Next 16, so that constraint is gone. Still a no-op without the DSN.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.GLITCHTIP_DSN) {
    const Sentry = await import("@sentry/nextjs");
    Sentry.init({ dsn: process.env.GLITCHTIP_DSN, tracesSampleRate: 0.1, sendDefaultPii: false });
  }
}

export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (!process.env.GLITCHTIP_DSN) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(err, request, context);
};
