import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/server/auth/require-user";
import { UNLOCK_COOKIE } from "@/server/highgarden";
import { rejectUnsafeMutation } from "@/server/request-guards";

const EXPIRED = "Thu, 01 Jan 1970 00:00:00 GMT";

/**
 * Lock Highgarden. Clears the cookie at BOTH paths: it used to be scoped to
 * /dashboard/highgarden before being widened to /, and cookies().set() can
 * only clear one path per name, so raw Set-Cookie headers are appended.
 */
export async function POST(req: NextRequest) {
  const unsafe = rejectUnsafeMutation(req, { requireJson: false });
  if (unsafe) return unsafe;
  const auth = await requireUser(req, "SUPER_ADMIN");
  if (auth.response) return auth.response;
  const res = NextResponse.json({ ok: true });
  res.headers.append("Set-Cookie", `${UNLOCK_COOKIE}=; Path=/; Expires=${EXPIRED}; HttpOnly; SameSite=Lax`);
  res.headers.append("Set-Cookie", `${UNLOCK_COOKIE}=; Path=/dashboard/highgarden; Expires=${EXPIRED}; HttpOnly; SameSite=Lax`);
  return res;
}
