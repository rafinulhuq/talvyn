import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024; // 10MB file + multipart overhead
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = [".pdf", ".docx"];

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Unauthorized" } },
        { status: 401 }
      );
    }

    const fastapiUrl = process.env.FASTAPI_INTERNAL_URL ?? "http://localhost:8000";
    const internalToken = process.env.INTERNAL_API_SECRET ?? "";
    if (!fastapiUrl || !internalToken) {
      return NextResponse.json(
        {
          error: {
            code: "AI_CHECKER_PROXY_MISCONFIGURED",
            message: "AI Checker extraction service is not configured correctly.",
          },
        },
        { status: 500 }
      );
    }

    const contentLength = Number(req.headers.get("content-length") ?? 0);
    if (contentLength > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        {
          error: {
            code: "FILE_TOO_LARGE",
            message: "File is too large. Maximum size is 10MB.",
          },
        },
        { status: 413 }
      );
    }

    let incomingFormData: FormData;
    try {
      incomingFormData = await req.formData();
    } catch {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_MULTIPART_FORM",
            message: "The file upload could not be read. Please try again.",
          },
        },
        { status: 400 }
      );
    }

    const file = incomingFormData.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: { code: "NO_FILE", message: "No file uploaded." } },
        { status: 400 }
      );
    }

    if (file.size === 0) {
      return NextResponse.json(
        { error: { code: "EMPTY_FILE", message: "The selected file is empty." } },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        {
          error: {
            code: "FILE_TOO_LARGE",
            message: "File is too large. Maximum size is 10MB.",
          },
        },
        { status: 413 }
      );
    }

    const ext = "." + (file.name.split(".").pop()?.toLowerCase() ?? "");
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_FILE_TYPE",
            message: "Server extraction supports PDF and DOCX files.",
          },
        },
        { status: 400 }
      );
    }

    const forwardFormData = new FormData();
    forwardFormData.append("file", file, file.name);

    const upstreamRes = await fetch(`${fastapiUrl}/api/v1/ai-checker/extract`, {
      method: "POST",
      headers: {
        "X-Internal-Token": internalToken,
        "X-Actor-Id": session.user.id,
      },
      body: forwardFormData,
    });

    if (!upstreamRes.ok) {
      const errorBody = await upstreamRes.json().catch(() => ({}));
      const error =
        errorBody?.error ??
        {
          code: upstreamRes.status >= 500 ? "AI_CHECKER_BACKEND_ERROR" : "AI_CHECKER_FILE_REJECTED",
          message:
            typeof errorBody?.detail === "string"
              ? errorBody.detail
              : upstreamRes.status >= 500
                ? "The AI Checker extraction service failed while processing the file."
                : "The file could not be extracted.",
        };
      return NextResponse.json({ error }, { status: upstreamRes.status });
    }

    const responseBody = await upstreamRes.json().catch(() => ({}));
    return NextResponse.json(responseBody, { status: upstreamRes.status });
  } catch (err) {
    console.error("[ai-checker/extract] error:", err);
    return NextResponse.json(
      {
        error: {
          code: "AI_CHECKER_BACKEND_UNAVAILABLE",
          message: "The AI Checker extraction service is temporarily unavailable.",
        },
      },
      { status: 502 }
    );
  }
}
