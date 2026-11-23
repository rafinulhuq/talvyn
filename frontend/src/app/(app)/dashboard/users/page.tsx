import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AddUser } from "@/components/users/add-user";
import { UserAvatar } from "@/components/users/user-avatar";
import { ActiveSwitch, RequestActions, RestoreButton, RoleSelect, UserMenu } from "@/components/users/user-actions";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { roleAtLeast } from "@/lib/roles";
import { formatDate } from "@/lib/format";
import { prisma } from "@/server/prisma";
import { isProtectedSuperAdminId } from "@/server/protected-accounts";
import { requireAppUser } from "@/server/session";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage() {
  const me = await requireAppUser();
  // The proxy already gates this route; re-check here so the page never renders for anyone else.
  if (!roleAtLeast(me.role, "SUPER_ADMIN")) redirect("/dashboard");

  const [users, requests, removed] = await Promise.all([
    prisma.user.findMany({ where: { signupStatus: "APPROVED", deletedAt: null }, orderBy: { createdAt: "asc" } }),
    prisma.user.findMany({ where: { signupStatus: { in: ["PENDING", "REJECTED"] }, deletedAt: null }, orderBy: { createdAt: "desc" } }),
    prisma.user.findMany({ where: { deletedAt: { not: null } }, orderBy: { deletedAt: "desc" } }),
  ]);
  // Mirrors the server's single guard (src/server/admin-users.ts): the last active Super Admin
  // can't be demoted, deactivated or removed.
  const activeSuperAdmins = users.filter((u) => u.role === "SUPER_ADMIN" && u.isActive).length;
  const pending = requests.filter((r) => r.signupStatus === "PENDING").length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Users" description="Who can sign in to this workspace, and what they can do." actions={<AddUser />} className="pb-0" />

      {requests.length > 0 && (
        <Panel title={pending ? `Access requests (${pending} waiting)` : "Declined access requests"} description="People who signed up for an account. Approving gives them the User role; you can change it after." bodyClassName="p-0">
          <Table aria-label="Access requests">
            <THead>
              <tr>
                <TH>Person</TH>
                <TH>Company</TH>
                <TH>Requested</TH>
                <TH className="text-right">Decision</TH>
              </tr>
            </THead>
            <tbody>
              {requests.map((r) => (
                <TR key={r.id}>
                  <TD>
                    <span className="block font-medium text-ink">{r.name}</span>
                    <span className="text-sm text-ink-muted">
                      {r.email}
                      {r.phoneNumber ? `, ${r.phoneNumber}` : ""}
                    </span>
                  </TD>
                  <TD>
                    <span className="block text-ink">{r.companyName ?? "Not given"}</span>
                    <span className="text-sm text-ink-muted">{[r.roleInCompany, r.companyWebsite].filter(Boolean).join(", ") || "No details"}</span>
                  </TD>
                  <TD className="text-ink-muted">
                    {formatDate(r.createdAt.toISOString())}
                    {r.signupStatus === "REJECTED" && (
                      <Badge tone="neutral" className="ml-2">
                        Declined
                      </Badge>
                    )}
                  </TD>
                  <TD className="text-right">
                    <RequestActions id={r.id} name={r.name} status={r.signupStatus as "PENDING" | "REJECTED"} />
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Panel>
      )}

      <Panel title={`Team (${users.length})`} bodyClassName="p-0">
        <Table aria-label="Team">
          <THead>
            <tr>
              <TH>Person</TH>
              <TH>Role</TH>
              <TH>Status</TH>
              <TH>Joined</TH>
              <TH className="w-12">
                <span className="sr-only">Actions</span>
              </TH>
            </tr>
          </THead>
          <tbody>
            {users.map((u) => {
              const self = u.id === me.id;
              const locked = isProtectedSuperAdminId(u.id);
              const lastActiveSA = u.role === "SUPER_ADMIN" && u.isActive && activeSuperAdmins <= 1;
              return (
                <TR key={u.id}>
                  <TD>
                    <span className="flex items-center gap-3">
                      <UserAvatar id={u.id} name={u.name} />
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 font-medium text-ink">
                          {u.name}
                          {self && <span className="text-sm font-normal text-ink-muted">(you)</span>}
                          {locked && <ShieldCheck aria-label="Protected account" className="size-3.5 text-accent" />}
                        </span>
                        <span className="block text-sm text-ink-muted">{u.email}</span>
                      </span>
                    </span>
                  </TD>
                  <TD>
                    <RoleSelect
                      id={u.id}
                      role={u.role}
                      disabled={self || locked || lastActiveSA}
                      reason={locked ? "This account is always a Super Admin." : self ? "You can't change your own role." : "The workspace needs at least one active Super Admin."}
                    />
                  </TD>
                  <TD>
                    <ActiveSwitch
                      id={u.id}
                      name={u.name}
                      active={u.isActive}
                      disabled={self || lastActiveSA}
                      reason={self ? "You can't deactivate yourself." : "The workspace needs at least one active Super Admin."}
                    />
                  </TD>
                  <TD className="text-ink-muted">{formatDate(u.createdAt.toISOString())}</TD>
                  <TD>
                    <UserMenu
                      id={u.id}
                      name={u.name}
                      email={u.email}
                      canRemove={!self && !locked && !lastActiveSA}
                      removeReason={self ? "You can't remove yourself." : locked ? "This account can't be removed." : lastActiveSA ? "The last active Super Admin can't be removed." : undefined}
                    />
                  </TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      </Panel>

      {removed.length > 0 && (
        <Panel title="Removed accounts" description="They can't sign in. Restoring brings their access back as it was." bodyClassName="p-0">
          <Table aria-label="Removed accounts">
            <tbody>
              {removed.map((u) => (
                <TR key={u.id}>
                  <TD>
                    <span className="block text-ink">{u.name}</span>
                    <span className="text-sm text-ink-muted">{u.email}</span>
                  </TD>
                  <TD className="text-ink-muted">Removed {u.deletedAt ? formatDate(u.deletedAt.toISOString()) : ""}</TD>
                  <TD className="text-right">
                    <RestoreButton id={u.id} name={u.name} />
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Panel>
      )}
    </div>
  );
}
