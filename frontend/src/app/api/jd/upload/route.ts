import type { NextRequest } from "next/server";
import { requireUser } from "@/server/auth/require-user";
import { forwardUpload } from "@/server/uploads";

// `extracted_text` comes from the in-browser WASM parser; when present the backend skips its own parse.
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  return forwardUpload(req, auth.user.id, {
    backendPath: "/api/v1/jd/upload",
    maxFileMb: 10,
    extensions: [".pdf", ".docx"],
    typeError: "Upload a PDF or DOCX file.",
    fields: ["extracted_text"],
    nonBlankFields: ["extracted_text"],
  });
}
