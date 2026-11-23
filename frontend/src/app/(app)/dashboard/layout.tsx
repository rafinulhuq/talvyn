import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";
import type { SystemStatus } from "@/components/shell/shell-context";
import { backendFetch } from "@/server/internal-api";
import { prisma } from "@/server/prisma";
import { requireAppUser } from "@/server/session";

type Health = { status: string; version?: string; checks?: Record<string, { status?: string } | null> };

async function systemStatus(actorId: string): Promise<SystemStatus> {
  // /health/ready answers 503 with the same body when degraded, so read the body either way.
  const res = await backendFetch<Health>("/api/v1/health/ready", { actorId, cache: "no-store", signal: AbortSignal.timeout(3000) });
  const body = (res.ok ? res.data : res.data) as Health | null;
  if (!body?.checks) return { state: "unknown", degraded: 0 };
  const degraded = Object.values(body.checks).filter((c) => c && c.status !== "ok").length;
  return { state: degraded > 0 ? "degraded" : "ok", degraded, version: body.version };
}

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await requireAppUser();
  const [status, pendingSignups] = await Promise.all([
    systemStatus(user.id),
    user.role === "SUPER_ADMIN"
      ? prisma.user.count({ where: { signupStatus: "PENDING", deletedAt: null } }).catch(() => 0)
      : Promise.resolve(0),
  ]);
  return (
    <AppShell user={user} status={status} pendingSignups={pendingSignups}>
      {children}
    </AppShell>
  );
}
