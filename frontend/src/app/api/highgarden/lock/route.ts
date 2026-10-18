import { NextResponse } from "next/server";
import { HIGHGARDEN_UNLOCK_COOKIE, requireHighgardenAccess } from "@/lib/highgarden";

const EXPIRED = "Thu, 01 Jan 1970 00:00:00 GMT";

/**
 * Signs out of Highgarden — clears the unlock cookie. Returns plain JSON
 * rather than a redirect; the client navigates itself afterward (see
 * SignOutButton.tsx) using the browser's own current origin instead of a
 * Location header the server would have to reconstruct from the request —
 * one less thing that can point the browser at an address it can't reach.
 *
 * Two Set-Cookie headers, not one: the cookie used to be scoped to
 * path=/dashboard/highgarden before that was widened to path=/ (see
 * lib/highgarden.ts), so a browser mid-transition may be holding either
 * scope. `next/headers`' cookies().set() stores entries in a Map keyed by
 * name alone — calling it twice with the same name silently overwrites the
 * first call, so it can only ever clear one of the two paths. Building the
 * headers directly with `.append()` (which Fetch's Headers API explicitly
 * supports for repeated names) is the only way to actually clear both in
 * one response.
 */
export async function POST() {
  await requireHighgardenAccess();
  const response = NextResponse.json({ ok: true });
  response.headers.append("Set-Cookie", `${HIGHGARDEN_UNLOCK_COOKIE}=; Path=/; Expires=${EXPIRED}`);
  response.headers.append(
    "Set-Cookie",
    `${HIGHGARDEN_UNLOCK_COOKIE}=; Path=/dashboard/highgarden; Expires=${EXPIRED}`
  );
  return response;
}
