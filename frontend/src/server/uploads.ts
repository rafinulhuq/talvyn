/**
 * Multipart upload pass-through. The generic /api/proxy reads small text
 * bodies; uploads need their own route that validates the file BEFORE
 * buffering it fully and re-forwards it as multipart.
 *
 * Client-side limits are a convenience — anyone can call these routes
 * directly, so every limit is enforced here too.
 */
import { NextResponse, type NextRequest } from "next/server";
import { backendBaseUrl, internalHeaders } from "@/server/internal-api";
import { errorJson } from "@/server/upstream";

const MB = 1024 * 1024;

export type UploadSpec = {
  backendPath: string;
  maxFileMb: number;
  /** Lower-case extensions including the dot. Omit to accept any type (the backend validates). */
  extensions?: readonly string[];
  typeError?: string;
  /** Extra string fields to pass through when present. */
  fields?: readonly string[];
  /** Ignore whitespace-only values for these fields. */
  nonBlankFields?: readonly string[];
};

const extOf = (name: string) => `.${name.split(".").pop()?.toLowerCase() ?? ""}`;

export async function forwardUpload(req: NextRequest, actorId: string, spec: UploadSpec): Promise<Response> {
  const maxFile = spec.maxFileMb * MB;
  const tooLarge = () => errorJson(413, "FILE_TOO_LARGE", `This file is larger than ${spec.maxFileMb} MB. Choose a smaller file.`);

  // Reject before buffering; +2 MB covers multipart overhead.
  if (Number(req.headers.get("content-length") ?? 0) > maxFile + 2 * MB) return tooLarge();

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return errorJson(400, "INVALID_MULTIPART_FORM", "The upload couldn't be read. Try again.");
  }

  const file = form.get("file");
  if (!(file instanceof File)) return errorJson(400, "NO_FILE", "Choose a file to upload.");
  if (file.size === 0) return errorJson(400, "EMPTY_FILE", "This file is empty.");
  if (file.size > maxFile) return tooLarge();
  if (spec.extensions && !spec.extensions.includes(extOf(file.name))) {
    return errorJson(400, "INVALID_FILE_TYPE", spec.typeError ?? "This file type isn't supported.");
  }

  const out = new FormData();
  out.append("file", file, file.name);
  for (const field of spec.fields ?? []) {
    const value = form.get(field);
    if (typeof value !== "string") continue;
    if (spec.nonBlankFields?.includes(field) && !value.trim()) continue;
    out.append(field, value);
  }

  try {
    const upstream = await fetch(`${backendBaseUrl()}${spec.backendPath}`, {
      method: "POST",
      headers: internalHeaders(actorId),
      body: out,
    });
    return relayJson(upstream);
  } catch (err) {
    console.error(`[upload ${spec.backendPath}] ${(err as Error).message}`);
    return errorJson(502, "UPLOAD_BACKEND_UNAVAILABLE", "The upload service is unavailable. Try again shortly.");
  }
}

/**
 * Relay an upstream JSON response, normalizing errors to { error: { code, message } }.
 * FastAPI returns either that shape or { detail }.
 */
export async function relayJson(upstream: Response): Promise<Response> {
  if (upstream.status === 204) return new NextResponse(null, { status: 204 });
  const body: unknown = await upstream.json().catch(() => ({}));
  if (upstream.ok) return NextResponse.json(body, { status: upstream.status });

  const record = (body ?? {}) as { error?: unknown; detail?: unknown };
  const error =
    record.error && typeof record.error === "object"
      ? record.error
      : {
          code: upstream.status >= 500 ? "BACKEND_ERROR" : "REJECTED",
          message:
            typeof record.detail === "string"
              ? record.detail
              : upstream.status >= 500
                ? "The service failed while processing this request."
                : "The request was rejected.",
        };
  return NextResponse.json({ error }, { status: upstream.status });
}
