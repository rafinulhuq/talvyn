import "server-only";
import { backendFetch, type BackendResult } from "@/server/internal-api";
import { requireAppUser } from "@/server/session";

/**
 * FastAPI GET for server components, as the signed-in user. Always fresh
 * (dashboard data must not be cached across users). The backend scopes
 * results to the actor (USER sees only their own data).
 */
export async function serverGet<T>(path: string): Promise<BackendResult<T>> {
  const user = await requireAppUser();
  return backendFetch<T>(path, { actorId: user.id, cache: "no-store" });
}

/** Message for a failed load, in the interface's voice. */
export function loadErrorMessage(status: number): string {
  if (status === 0) return "The Talvyn service isn't reachable right now. Try again in a moment.";
  if (status === 403) return "You don't have access to this.";
  if (status === 404) return "This doesn't exist or was deleted.";
  return "Something went wrong while loading this page.";
}
