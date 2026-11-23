import type { NextRequest } from "next/server";
import { requireUser } from "@/server/auth/require-user";
import { forwardUpload } from "@/server/uploads";

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  return forwardUpload(req, auth.user.id, {
    backendPath: "/api/v1/ai-checker/extract",
    maxFileMb: 10,
    extensions: [".pdf", ".docx"],
    typeError: "Server extraction supports PDF and DOCX files.",
  });
}
