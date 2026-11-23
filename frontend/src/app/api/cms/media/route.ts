import type { NextRequest } from "next/server";
import { requireUser } from "@/server/auth/require-user";
import { forwardUpload } from "@/server/uploads";

// Content-management media (blog covers, landing images). Super Admin only.
export async function POST(req: NextRequest) {
  const auth = await requireUser(req, "SUPER_ADMIN");
  if (auth.response) return auth.response;
  return forwardUpload(req, auth.user.id, {
    backendPath: "/api/v1/cmp/media",
    maxFileMb: 8,
    fields: ["title", "alt_text"],
  });
}
