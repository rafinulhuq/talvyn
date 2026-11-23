import "server-only";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/server/auth/options";

export type AppUser = { id: string; email: string; name: string; role: string };

/**
 * Current user for server components. getServerSession runs the jwt callback,
 * which re-validates the session against the DB (revoked → empty id).
 */
export async function getAppUser(): Promise<AppUser | null> {
  const session = await getServerSession(authOptions);
  const u = session?.user;
  return u?.id ? { id: u.id, email: u.email, name: u.name, role: u.role } : null;
}

export async function requireAppUser(): Promise<AppUser> {
  const user = await getAppUser();
  if (!user) redirect("/login");
  return user;
}
