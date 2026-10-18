import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// Hosts next/image is allowed to optimise remote images from. Derived from
// the same env vars that define each origin rather than hardcoded:
//   APP_URL  — CMS-uploaded media served by the app itself (blog covers…)
//   SITE_URL — the public marketing host, once www/app are split
// Duplicates and unset values are dropped, so this stays correct before and
// after the split.
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
    // A malformed origin must not take the whole build down.
    console.warn(`[next.config] Ignoring invalid image origin: ${origin}`);
    return [];
  }
});

const nextConfig: NextConfig = {
  images: {
    remotePatterns,
  },

  // ─── Security headers ───────────────────────────────────────
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },

  // ─── Rewrites — proxy /backend/* to FastAPI ─────────────────
  // Used in development so Next.js and FastAPI share the same origin
  async rewrites() {
    return [
      {
        source: "/backend/:path*",
        destination: `${process.env.FASTAPI_INTERNAL_URL ?? "http://localhost:8000"}/:path*`,
      },
    ];
  },

  // ─── Proxy timeout for long-running rewrites (e.g. Ollama analyze/generate) ──
  // 3 Ollama calls dispatched concurrently; Ollama queues them (NUM_PARALLEL=1).
  // With GPU + gemma3:4b each takes ~30-90 s → worst-case total ~270 s.
  // 480 s gives comfortable headroom.
  experimental: {
    proxyTimeout: 480_000,
    optimizePackageImports: ["lucide-react"],
  },
};

// Wrap with Sentry only when NEXT_PUBLIC_GLITCHTIP_DSN is set.
// When the env var is absent (local dev default) this is a transparent pass-through.
export default process.env.NEXT_PUBLIC_GLITCHTIP_DSN
  ? withSentryConfig(nextConfig, {
      // Suppress Sentry CLI output during builds
      silent: true,
      // Don't upload source maps to Sentry cloud (we're self-hosting GlitchTip)
      sourcemaps: {
        disable: true,
      },
    })
  : nextConfig;
