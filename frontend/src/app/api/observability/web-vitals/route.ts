import { NextResponse } from "next/server";

const METRICS = new Set(["CLS", "FCP", "FID", "INP", "LCP", "TTFB", "Next.js-hydration", "Next.js-route-change-to-render", "Next.js-render"]);

/** Accepts Core Web Vitals beacons; logs them only when OBSERVABILITY_DEBUG=1. */
export async function POST(request: Request) {
  const p = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!p || typeof p.name !== "string" || !METRICS.has(p.name) || typeof p.value !== "number") {
    return NextResponse.json({ error: { code: "INVALID_METRIC", message: "Invalid metric." } }, { status: 400 });
  }
  if (process.env.OBSERVABILITY_DEBUG === "1") {
    const pick = (k: string, t: "string" | "number") => (typeof p[k] === t ? p[k] : undefined);
    console.info("[web-vital]", {
      id: pick("id", "string"),
      name: p.name,
      rating: pick("rating", "string"),
      value: p.value,
      delta: pick("delta", "number"),
      navigationType: pick("navigationType", "string"),
      entryCount: pick("entryCount", "number"),
    });
  }
  return new NextResponse(null, { status: 204 });
}
