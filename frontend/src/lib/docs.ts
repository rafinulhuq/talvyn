import "server-only";

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// ADMIN, SUPER_ADMIN, and DEV (docs-only, unranked — see types/index.ts
// ROLE_RANK) are the only roles allowed to reach the internal docs site.
const DOCS_ROLES = ["ADMIN", "SUPER_ADMIN", "DEV"];

export async function requireDocsAccess() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (!DOCS_ROLES.includes(session.user.role)) redirect("/dashboard");
  return session;
}
