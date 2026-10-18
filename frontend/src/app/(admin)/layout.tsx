/**
 * Admin shell layout — wraps all /dashboard/* pages.
 * Provides: generation context, sidebar nav, session context, top header.
 * Mobile navigation is handled by AdminShell (hamburger + slide-in drawer).
 */

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { AdminShell } from "@/components/admin/AdminShell";
import type { SidebarSystemStatus } from "@/components/admin/Sidebar";
import { SessionProvider } from "@/components/admin/SessionProvider";
import { GenerationProvider } from "@/contexts/GenerationContext";
import { serverFetchRaw } from "@/lib/api/serverFetch";
import type { HealthReadyResponse, ServiceCheck } from "@/lib/api/health";
import { prisma } from "@/lib/prisma";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }

  // Drives the sidebar's "All systems operational" footer indicator on
  // every admin page — a fast, cheap call (health/ready is already polled
  // elsewhere) so it's not worth gating navigation on, hence the catch.
  const [health, pendingSignupCount] = await Promise.all([
    serverFetchRaw<HealthReadyResponse>("/api/v1/health/ready"),
    session.user?.role === "SUPER_ADMIN"
      ? prisma.user.count({ where: { signupStatus: "PENDING" } }).catch(() => 0)
      : Promise.resolve(0),
  ]);
  const degradedCount = health.data
    ? Object.values(health.data.checks).filter(
        (check): check is ServiceCheck => !!check && check.status !== "ok"
      ).length
    : 0;
  const systemStatus: SidebarSystemStatus = {
    status: !health.data ? "unknown" : degradedCount > 0 ? "degraded" : "ok",
    degradedCount,
    version: health.data?.version,
  };

  return (
    <SessionProvider session={session}>
      <GenerationProvider>
        <AdminShell
          userId={session.user?.id}
          userEmail={session.user?.email}
          userName={session.user?.name}
          userRole={session.user?.role}
          systemStatus={systemStatus}
          pendingSignupCount={pendingSignupCount}
        >
          {children}
        </AdminShell>
      </GenerationProvider>
    </SessionProvider>
  );
}
