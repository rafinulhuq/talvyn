import { NextResponse } from "next/server";

type WebVitalPayload = {
  id?: unknown;
  name?: unknown;
  rating?: unknown;
  value?: unknown;
  delta?: unknown;
  startTime?: unknown;
  navigationType?: unknown;
  entryCount?: unknown;
};

const allowedMetrics = new Set([
  "CLS",
  "FCP",
  "FID",
  "INP",
  "LCP",
  "TTFB",
  "Next.js-hydration",
  "Next.js-route-change-to-render",
  "Next.js-render",
]);

export async function POST(request: Request) {
  let payload: WebVitalPayload;
  try {
    payload = (await request.json()) as WebVitalPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (
    typeof payload.name !== "string" ||
    !allowedMetrics.has(payload.name) ||
    typeof payload.value !== "number"
  ) {
    return NextResponse.json({ error: "Invalid metric" }, { status: 400 });
  }

  if (process.env.OBSERVABILITY_DEBUG === "1") {
    console.info("[web-vital]", {
      id: typeof payload.id === "string" ? payload.id : undefined,
      name: payload.name,
      rating: typeof payload.rating === "string" ? payload.rating : undefined,
      value: payload.value,
      delta: typeof payload.delta === "number" ? payload.delta : undefined,
      navigationType:
        typeof payload.navigationType === "string" ? payload.navigationType : undefined,
      entryCount:
        typeof payload.entryCount === "number" ? payload.entryCount : undefined,
    });
  }

  return new NextResponse(null, { status: 204 });
}
