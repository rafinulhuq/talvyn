import { NextRequest } from "next/server";

const IP_HEADER_CANDIDATES = [
  "cf-connecting-ip",
  "x-real-ip",
  "x-forwarded-for",
];

function firstHeaderIp(value: string | null): string | null {
  if (!value) return null;
  const first = value.split(",")[0]?.trim();
  if (!first || first.length > 64) return null;

  // Keep this conservative; the backend does the actual ipaddress parsing.
  if (!/^[0-9a-fA-F:.]+$/.test(first)) return null;
  return first;
}

export function getForwardedClientIp(req: NextRequest): string | null {
  for (const header of IP_HEADER_CANDIDATES) {
    const ip = firstHeaderIp(req.headers.get(header));
    if (ip) return ip;
  }
  return null;
}
