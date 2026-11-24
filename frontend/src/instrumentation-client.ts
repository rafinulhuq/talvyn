// GlitchTip (Sentry-compatible), only when a DSN is set at build time.
//
// The SDK is imported dynamically: a static import put ~140KB (gzip) of
// Sentry into every page's first load even with no DSN configured. With no
// DSN the branch is dead code and the bundler drops the import entirely; with
// one, the SDK loads as a separate async chunk. Tradeoff: an error thrown in
// the first moments before it loads isn't reported.
if (process.env.NEXT_PUBLIC_GLITCHTIP_DSN) {
  void import("@sentry/nextjs").then((Sentry) =>
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_GLITCHTIP_DSN,
      tracesSampleRate: 0.1,
      integrations: [],
      sendDefaultPii: false,
    }),
  );
}
