import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { ErrorState } from "@/components/ui/ErrorState";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { UserRoleSelect } from "@/components/admin/UserRoleSelect";
import { UserStatusToggle } from "@/components/admin/UserStatusToggle";
import { UserPasswordResetButton } from "@/components/admin/UserPasswordResetButton";
import { UserDeleteButton } from "@/components/admin/UserDeleteButton";
import { UserRestoreButton } from "@/components/admin/UserRestoreButton";
import { AddAdminSection } from "@/components/admin/AddAdminSection";
import { SignupRequestRow } from "@/components/admin/SignupRequestRow";
import { isProtectedSuperAdminId } from "@/lib/protectedAccounts";
import type { UserRole } from "@/types";

export const metadata: Metadata = { title: "Users" };
export const revalidate = 0;

function formatDate(iso: Date): string {
  return iso.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Keyed by UserRole rather than written as `SUPER_ADMIN ? … : …` ternaries:
// typing it as a full Record makes TypeScript fail the build if a role is
// ever added to the enum without being given a label here. The previous
// two-branch form silently labelled every USER as "Admin".
const ROLE_BADGE: Record<UserRole, { label: string; variant: BadgeVariant; icon?: typeof ShieldCheck }> = {
  SUPER_ADMIN: { label: "Super Admin", variant: "blue", icon: ShieldCheck },
  ADMIN: { label: "Admin", variant: "default" },
  USER: { label: "User", variant: "slate" },
  // Docs-only — see src/lib/docs.ts. Not part of the ADMIN/SUPER_ADMIN
  // privilege ladder (src/types/index.ts ROLE_RANK deliberately excludes it).
  DEV: { label: "Dev", variant: "purple" },
};

export default async function UsersPage() {
  const session = await getServerSession(authOptions);

  // The Sidebar already hides this nav item for non-Super-Admins, but the
  // URL itself is guessable — re-check here rather than relying on nav
  // visibility as the only access control.
  if (session?.user?.role !== "SUPER_ADMIN") {
    return (
      <div className="w-full">
        <PageHeader title="Users" className="mb-8" />
        <ErrorState
          icon={<ShieldAlert className="h-6 w-6" />}
          title="Super Admin access required"
          description="Only a Super Admin can view or manage admin accounts."
        />
      </div>
    );
  }

  const [users, signupRequests, removedUsers] = await Promise.all([
    prisma.user.findMany({
      where: { signupStatus: "APPROVED", deletedAt: null },
      orderBy: { createdAt: "asc" },
    }),
    prisma.user.findMany({
      where: { signupStatus: { in: ["PENDING", "REJECTED"] }, deletedAt: null },
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.findMany({
      where: { deletedAt: { not: null } },
      orderBy: { deletedAt: "desc" },
    }),
  ]);
  // These mirror the two distinct lockout guards enforced server-side: the
  // role API counts all Super Admins regardless of status (demoting the
  // last one removes role-management capability for good), while the
  // status API counts only active ones (deactivating the last active one
  // removes anyone able to act right now, even if an inactive Super Admin
  // could theoretically be reactivated later). Both counts are now scoped
  // to `users` (signupStatus: APPROVED only) — a Super Admin whose
  // signup request is still pending/rejected can't be Super Admin in
  // practice (signups create USER — see api/signup/route.ts), so this
  // doesn't change which accounts these counts see today, but keep it in
  // mind if that ever changes via the separate role-change route.
  const superAdminCount = users.filter((u) => u.role === "SUPER_ADMIN").length;
  const activeSuperAdminCount = users.filter(
    (u) => u.role === "SUPER_ADMIN" && u.isActive
  ).length;

  return (
    <div className="w-full">
      <PageHeader
        title="Users"
        subtitle="Admin accounts, roles, and account status. Super Admin access is required to view this page."
        className="mb-8"
      />

      <AddAdminSection />

      {signupRequests.length > 0 && (
        <div className="mb-6 rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 border-b border-slate-100 pb-3 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Access Requests
              </h2>
              <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-950/40 dark:text-amber-400">
                {signupRequests.length}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Company signups awaiting review. Approving grants a normal Admin account.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            {signupRequests.map((req) => (
              <SignupRequestRow
                key={req.id}
                userId={req.id}
                companyName={req.companyName}
                name={req.name}
                email={req.email}
                username={req.username}
                roleInCompany={req.roleInCompany}
                companyWebsite={req.companyWebsite}
                phoneNumber={req.phoneNumber}
                signupStatus={req.signupStatus as "PENDING" | "REJECTED"}
                requestedAt={formatDate(req.createdAt)}
              />
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {users.map((user) => {
          const isSelf = user.id === session.user.id;
          const isLastSuperAdmin = user.role === "SUPER_ADMIN" && superAdminCount <= 1;
          const isLastActiveSuperAdmin =
            user.role === "SUPER_ADMIN" && user.isActive && activeSuperAdminCount <= 1;
          const isProtected = isProtectedSuperAdminId(user.id);
          const badgeConfig = ROLE_BADGE[user.role];

          return (
            <div
              key={user.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-xs transition-colors hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
            >
              <div className="flex items-center gap-3.5 min-w-0 flex-1">
                <UserAvatar
                  userId={user.id}
                  name={user.name}
                  size={40}
                  className="rounded-full ring-2 ring-slate-100 dark:ring-slate-800"
                  fallbackClassName={
                    user.isActive
                      ? "bg-indigo-600 text-white font-semibold"
                      : "bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                  }
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p
                      className={`truncate text-sm font-semibold ${
                        user.isActive
                          ? "text-slate-900 dark:text-slate-100"
                          : "text-slate-400 line-through dark:text-slate-500"
                      }`}
                    >
                      {user.name}
                    </p>
                    {isSelf && (
                      <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        You
                      </span>
                    )}
                    <span
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium ${
                        user.role === "SUPER_ADMIN"
                          ? "bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-700/10 dark:bg-indigo-950/40 dark:text-indigo-400 dark:ring-indigo-500/20"
                          : user.role === "ADMIN"
                          ? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                          : "bg-slate-50 text-slate-600 dark:bg-slate-800/60 dark:text-slate-400"
                      }`}
                    >
                      {badgeConfig.icon && <badgeConfig.icon className="h-3 w-3" />}
                      {badgeConfig.label}
                    </span>
                    {!user.isActive && (
                      <span className="inline-flex items-center rounded-md bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700 ring-1 ring-inset ring-rose-600/20 dark:bg-rose-950/40 dark:text-rose-400">
                        Inactive
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{user.email}</p>
                  <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
                    Joined {formatDate(user.createdAt)}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center sm:flex-col sm:items-end gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800">
                <UserRoleSelect
                  userId={user.id}
                  currentRole={user.role}
                  disabled={isLastSuperAdmin}
                />
                <div className="flex items-center gap-1">
                  <UserPasswordResetButton
                    userId={user.id}
                    userName={user.name}
                    userEmail={user.email}
                  />
                  <UserStatusToggle
                    userId={user.id}
                    userName={user.name}
                    isActive={user.isActive}
                    disabled={isSelf || isLastActiveSuperAdmin}
                  />
                  <UserDeleteButton
                    userId={user.id}
                    userName={user.name}
                    disabled={isSelf || isProtected || isLastActiveSuperAdmin}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">
        Deactivating an account blocks future sign-in · sessions expire after 8 hours.
      </p>

      {removedUsers.length > 0 && (
        <div className="mt-8">
          <div className="mb-4 border-b border-slate-200/80 pb-3 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                Removed Users
              </h2>
              <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                {removedUsers.length}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Removed accounts cannot sign in but are preserved for restoration.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            {removedUsers.map((user) => (
              <div
                key={user.id}
                className="flex items-center justify-between gap-4 rounded-xl border border-slate-200/60 bg-slate-50/50 p-4 opacity-80 dark:border-slate-800/60 dark:bg-slate-900/40"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <UserAvatar
                    userId={user.id}
                    name={user.name}
                    size={36}
                    className="rounded-full ring-1 ring-slate-200 dark:ring-slate-700"
                    fallbackClassName="bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-xs font-medium text-slate-500 line-through dark:text-slate-400">
                        {user.name}
                      </p>
                      <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                        {ROLE_BADGE[user.role].label}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-slate-400 dark:text-slate-500">{user.email}</p>
                    <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
                      Removed {user.deletedAt ? formatDate(user.deletedAt) : ""}
                    </p>
                  </div>
                </div>
                <UserRestoreButton userId={user.id} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
