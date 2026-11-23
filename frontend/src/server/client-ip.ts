import type { NextRequest } from "next/server";

// Cloudflare's header first: behind the tunnel, x-forwarded-for can be client-controlled.
const IP_HEADERS = ["cf-connecting-ip", "x-real-ip", "x-forwarded-for"] as const;

/** Best-effort client IP for rate-limit keys and audit fields. Conservative charset; the backend does real parsing. */
export function getClientIp(req: NextRequest): string | null {
  for (const header of IP_HEADERS) {
    const first = req.headers.get(header)?.split(",")[0]?.trim();
    if (first && first.length <= 64 && /^[0-9a-fA-F:.]+$/.test(first)) return first;
  }
  return null;
}
