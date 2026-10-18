import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Unauthorized" } },
        { status: 401 }
      );
    }

    const { id } = await params;
    const fastapiUrl = process.env.FASTAPI_INTERNAL_URL ?? "http://localhost:8000";
    const internalToken = process.env.INTERNAL_API_SECRET ?? "";

    const upstreamRes = await fetch(`${fastapiUrl}/api/v1/jd/${id}/analyze`, {
      method: "POST",
      headers: {
        "X-Internal-Token": internalToken,
        "Content-Type": "application/json",
      },
      // Forward a long timeout — analysis can take up to 2 minutes on first load
      signal: AbortSignal.timeout(150_000),
    });

    const responseBody = await upstreamRes.json().catch(() => ({}));
    return NextResponse.json(responseBody, { status: upstreamRes.status });

  } catch (err: unknown) {
    console.error("[jd/analyze] error:", err);

    if (err instanceof Error && err.name === "TimeoutError") {
      return NextResponse.json(
        { error: { code: "TIMEOUT", message: "Analysis timed out. Try again." } },
        { status: 504 }
      );
    }

    return NextResponse.json(
      { error: { code: "ANALYZE_PROXY_ERROR", message: "Analysis request failed." } },
      { status: 500 }
    );
  }
}
