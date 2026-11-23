import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

// next/image may optimise remote images only from our own origins:
//   APP_URL  — CMS-uploaded media served by the app (blog covers, avatars)
//   SITE_URL — the public marketing host once www/app are split
const imageOrigins = [
  process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  process.env.NEXT_PUBLIC_SITE_URL,
].filter((value): value is string => Boolean(value));

const remotePatterns = Array.from(new Set(imageOrigins)).flatMap((origin) => {
  try {
    const url = new URL(origin);
    return [
      {
        protocol: url.protocol.replace(":", "") as "http" | "https",
        hostname: url.hostname,
        port: url.port,
      },
    ];
  } catch {
    console.warn(`[next.config] Ignoring invalid image origin: ${origin}`);
    return [];
  }
});

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

// Deliberately NOT ported from the old config: the `/backend/:path*` rewrite.
// It exposed FastAPI to the browser without passing through the authenticated
// /api/proxy layer, and no app code used it. See docs/internal/frontend-contract.md.
const nextConfig: NextConfig = {
  images: { remotePatterns },
  // The old per-role results pages are now one "Results" tab per job description.
  async redirects() {
    return [
      { source: "/dashboard/results/by-jd", destination: "/dashboard/jds", permanent: true },
      { source: "/dashboard/results/jd/:jdId", destination: "/dashboard/jds/:jdId/results", permanent: true },
      { source: "/dashboard/results/leaderboard/:jdId", destination: "/dashboard/jds/:jdId/results", permanent: true },
      { source: "/dashboard/results/report/:jdId", destination: "/dashboard/jds/:jdId/results", permanent: true },
      // Companies was a "coming soon" placeholder; hidden until it does something.
      { source: "/dashboard/companies", destination: "/dashboard", permanent: false },
    ];
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

// GlitchTip wrapper only when a DSN is configured; a plain pass-through otherwise.
// Source maps stay local (self-hosted GlitchTip, nothing uploaded).
export default process.env.NEXT_PUBLIC_GLITCHTIP_DSN
  ? withSentryConfig(nextConfig, { silent: true, sourcemaps: { disable: true } })
  : nextConfig;
