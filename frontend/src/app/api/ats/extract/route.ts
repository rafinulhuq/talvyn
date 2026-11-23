import type { NextRequest } from "next/server";
import { requireUser } from "@/server/auth/require-user";
import { forwardUpload } from "@/server/uploads";

// The response's `extraction_method` is passed back to /ats/check by the client:
// "ocr" (no text layer) is the worst case for a real applicant tracking system.
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  return forwardUpload(req, auth.user.id, {
    backendPath: "/api/v1/ats/extract",
    maxFileMb: 10,
    extensions: [".pdf", ".docx"],
    typeError: "Server extraction supports PDF and DOCX files.",
  });
}
