/**
 * Admin sidebar navigation.
 * Dark graphite chrome (Step 2 of the admin rebrand) — fixed on desktop,
 * rendered inside a slide-in drawer on mobile by AdminShell.
 *
 * Desktop-only: collapsible to an icon-only rail via `collapsed` +
 * `onToggleCollapse`. The mobile drawer instance never passes these (it
 * already has its own show/hide affordance — the hamburger + slide
 * animation — so collapsing it too would be redundant).
 */

"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import {
  LayoutDashboard,
  FileText,
  Users as UsersIcon,
  ClipboardList,
  Trophy,
  Settings,
  LogOut,
  BrainCircuit,
  FileSearch,
  ChevronLeft,
  ChevronRight,
  LayoutTemplate,
  Building2,
  ShieldCheck,
  Trash2,
  PanelsTopLeft,
  Sprout,
  BookOpen,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { BrandMark, BrandWordmark } from "@/components/BrandLogo";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { roleAtLeast, type UserRole } from "@/types";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  matchExact?: boolean;
  /** Not built yet — shown to everyone with a "Soon" tag, not a real page. */
  soon?: boolean;
  /** Minimum role required to see this item. Absent = visible to USER+.
   * Uses the ranked hierarchy (roleAtLeast) — not compatible with DEV,
   * which sits outside that ladder. For items DEV should see, use `roles`
   * instead (exact-match allow-list). */
  minRole?: UserRole;
  /** Exact-match allow-list, for items visible to a specific set of roles
   * rather than "this rank or higher" — e.g. Docs, which DEV can see
   * without DEV being "ADMIN or higher" anywhere else. */
  roles?: UserRole[];
  /** Badge count shown next to the label — used for the pending signup-request count. */
  count?: number;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    label: "Workflow",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, matchExact: true },
      { label: "Job Descriptions", href: "/dashboard/jds", icon: FileText },
      { label: "Candidates", href: "/dashboard/candidates", icon: UsersIcon },
      { label: "Results", href: "/dashboard/results", icon: ClipboardList },
      { label: "Templates", href: "/dashboard/templates", icon: LayoutTemplate, minRole: "ADMIN" },
    ],
  },
  {
    label: "AI & Insights",
    items: [
      { label: "Leaderboard", href: "/dashboard/leaderboard", icon: Trophy },
      { label: "AI Checker", href: "/dashboard/ai-checker", icon: BrainCircuit },
      { label: "ATS Checker", href: "/dashboard/ats-checker", icon: FileSearch },
    ],
  },
  {
    label: "System",
    items: [
      { label: "CMP", href: "/dashboard/cmp", icon: PanelsTopLeft, minRole: "SUPER_ADMIN" },
      { label: "Highgarden", href: "/dashboard/highgarden", icon: Sprout, minRole: "SUPER_ADMIN" },
      { label: "Companies", href: "/dashboard/companies", icon: Building2, soon: true, minRole: "ADMIN" },
      { label: "Users", href: "/dashboard/users", icon: ShieldCheck, minRole: "SUPER_ADMIN" },
      { label: "Trash", href: "/dashboard/trash", icon: Trash2, minRole: "SUPER_ADMIN" },
      { label: "Settings", href: "/dashboard/settings", icon: Settings, minRole: "ADMIN" },
      { label: "Docs", href: "/dashboard/docs", icon: BookOpen, roles: ["ADMIN", "SUPER_ADMIN", "DEV"] },
    ],
  },
];

const publicAppUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "");
const signOutCallbackUrl = publicAppUrl ? `${publicAppUrl}/login` : "/login";

export interface SidebarSystemStatus {
  /** "ok" when every backing service reports healthy, otherwise "degraded". */
  status: "ok" | "degraded" | "unknown";
  degradedCount: number;
  version?: string;
}

interface SidebarProps {
  onNavigate?: () => void;
  userId?: string | null;
  userEmail?: string | null;
  userName?: string | null;
  userRole?: string | null;
  systemStatus?: SidebarSystemStatus;
  pendingSignupCount?: number;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

/**
 * The clicked nav item's pending state. `useLinkStatus` has to be read from a
 * *descendant* of the <Link>, which is why the whole nav item body lives in
 * this component rather than in SidebarNavLink itself.
 *
 * Prefetched routes resolve instantly and never reach `pending`, so this only
 * ever shows up on the genuinely slow navigations — which is the point.
 */
function SidebarNavLinkBody({
  item,
  active,
  collapsed,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
}) {
  const { pending } = useLinkStatus();
  const Icon = item.icon;

  return (
    <>
      <Icon
        className={clsx(
          "h-4 w-4 shrink-0 transition-colors duration-200",
          pending && "animate-pulse-dot",
          active ? "text-[#F2D74E]" : "text-white group-hover:text-white"
        )}
      />
      <span
        className={clsx(
          "flex-1 overflow-hidden whitespace-nowrap transition-all duration-200 text-sm font-medium text-white",
          collapsed ? "w-0 opacity-0" : "w-auto opacity-100"
        )}
      >
        {item.label}
      </span>
      {item.soon && !collapsed && (
        <span className="shrink-0 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-white/80">
          Soon
        </span>
      )}
      {item.minRole && item.minRole !== "USER" && !collapsed && (
        <span
          className={clsx(
            "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold border",
            active
              ? "bg-[#F2D74E]/20 text-[#F2D74E] border-[#F2D74E]/40"
              : "bg-white/10 text-white border-white/15"
          )}
        >
          {item.minRole === "SUPER_ADMIN" ? "SUPER" : "ADMIN"}
        </span>
      )}
      {!!item.count && item.count > 0 && !collapsed && (
        <span
          className={clsx(
            "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold",
            active
              ? "bg-[#F2D74E] text-[#1A1600]"
              : "bg-[#F2D74E]/20 text-[#F2D74E] border border-[#F2D74E]/40"
          )}
        >
          {item.count}
        </span>
      )}
    </>
  );
}

function SidebarNavLink({
  item,
  active,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      className={clsx(
        "group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-all duration-150 ease-out",
        active
          ? "bg-[#181A1F] text-[#F2D74E] font-semibold border border-[#F2D74E]/30 shadow-xs"
          : "border border-transparent text-white hover:text-white hover:bg-white/10"
      )}
    >
      <SidebarNavLinkBody item={item} active={active} collapsed={collapsed} />
    </Link>
  );
}

function SidebarNavGroup({
  group,
  collapsed,
  isActive,
  onNavigate,
}: {
  group: NavGroup;
  collapsed: boolean;
  isActive: (item: NavItem) => boolean;
  onNavigate?: () => void;
}) {
  return (
    <div>
      <p
        className={clsx(
          "mb-1.5 overflow-hidden whitespace-nowrap px-3 text-[11px] font-bold uppercase tracking-wider text-white/80 transition-all duration-200",
          collapsed ? "h-0 opacity-0" : "h-auto opacity-100"
        )}
      >
        {group.label}
      </p>
      <div className="flex flex-col gap-0.5">
        {group.items.map((item) => (
          <SidebarNavLink
            key={item.href}
            item={item}
            active={isActive(item)}
            collapsed={collapsed}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </div>
  );
}

function SidebarSystemStatusLink({ systemStatus, collapsed }: { systemStatus: SidebarSystemStatus; collapsed: boolean }) {
  return (
    <Link
      href="/dashboard/settings"
      title={collapsed ? "System status" : undefined}
      className="mb-2 flex items-center gap-2 rounded-lg border border-white/8 bg-[#181A1F] p-2 text-xs text-white hover:bg-white/10 hover:border-white/15 transition-colors shadow-2xs"
    >
      <span
        className={clsx(
          "h-2 w-2 rounded-full shrink-0",
          systemStatus.status === "ok" && "bg-[#4ADE80]",
          systemStatus.status === "degraded" && "bg-[#F87171] animate-pulse-dot",
          systemStatus.status === "unknown" && "bg-white/40"
        )}
      />
      <span
        className={clsx(
          "flex-1 truncate overflow-hidden whitespace-nowrap transition-all duration-200 text-xs font-medium text-white",
          collapsed ? "w-0 opacity-0" : "w-auto opacity-100"
        )}
      >
        {systemStatus.status === "ok"
          ? "Operational"
          : systemStatus.status === "degraded"
            ? `${systemStatus.degradedCount} Issues`
            : "Unknown Status"}
      </span>
    </Link>
  );
}

function SidebarProfile({
  userId,
  userEmail,
  userName,
  roleLabel,
  collapsed,
}: {
  userId?: string | null;
  userEmail?: string | null;
  userName?: string | null;
  roleLabel: string;
  collapsed: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5 border-t border-white/8 pt-3">
      <Link
        href="/dashboard/profile"
        title={collapsed ? (userEmail ?? undefined) : "Edit your profile picture"}
        className="shrink-0 transition-transform hover:scale-105"
      >
        {userId ? (
          <UserAvatar userId={userId} name={userName} size={30} />
        ) : (
          <div className="flex h-7.5 w-7.5 shrink-0 items-center justify-center rounded-full bg-[#181A1F] border border-[#F2D74E]/30 text-xs font-semibold text-[#F2D74E]">
            {userName?.charAt(0).toUpperCase() ?? "A"}
          </div>
        )}
      </Link>
      <div
        className={clsx(
          "min-w-0 flex-1 overflow-hidden transition-all duration-200",
          collapsed ? "w-0 opacity-0" : "w-auto opacity-100"
        )}
      >
        <p className="truncate whitespace-nowrap text-xs font-semibold text-white">{userName}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="rounded-full bg-[#F2D74E]/10 border border-[#F2D74E]/30 text-[#F2D74E] px-1.5 py-0.2 text-[9px] font-semibold">
            {roleLabel}
          </span>
        </div>
      </div>
      {!collapsed && (
        <button
          onClick={handleSignOut}
          aria-label="Sign out"
          title="Sign out"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-[#181A1F] text-white/70 hover:text-[#F87171] hover:border-[#F87171]/40 hover:bg-[#F87171]/10 transition-colors shadow-2xs"
        >
          <LogOut className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

async function handleSignOut() {
  const result = await signOut({
    callbackUrl: signOutCallbackUrl,
    redirect: false,
  });
  window.location.assign(result.url ?? signOutCallbackUrl);
}

export function Sidebar({
  onNavigate,
  userId,
  userEmail,
  userName,
  userRole,
  systemStatus,
  pendingSignupCount,
  collapsed = false,
  onToggleCollapse,
}: SidebarProps = {}) {
  const pathname = usePathname();
  const roleLabel =
    userRole === "SUPER_ADMIN"
      ? "Super Admin"
      : userRole === "ADMIN"
        ? "Admin"
        : userRole === "DEV"
          ? "Dev"
          : "User";

  const groupsWithCounts = navGroups
    .map((group) => ({
      ...group,
      items: group.items.reduce<NavItem[]>((visible, item) => {
        if (item.minRole && !roleAtLeast(userRole, item.minRole)) return visible;
        if (item.roles && !item.roles.includes(userRole as UserRole)) return visible;
        visible.push(item.href === "/dashboard/users" ? { ...item, count: pendingSignupCount } : item);
        return visible;
      }, []),
    }))
    .filter((group) => group.items.length > 0);

  function isActive(item: NavItem): boolean {
    if (item.matchExact) return pathname === item.href;
    return pathname.startsWith(item.href);
  }

  return (
    <aside
      className={clsx(
        "relative flex h-full flex-col bg-[#121317] text-white border-r border-white/8 shadow-2xl",
        "transition-[width] duration-300 ease-in-out",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Collapse/expand toggle — desktop only */}
      {onToggleCollapse && (
        <button
          onClick={onToggleCollapse}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={clsx(
            "absolute -right-3 top-16 z-10 flex h-6 w-6 items-center justify-center rounded-full",
            "border border-white/10 bg-[#181A1F] text-white/70 shadow-xs",
            "transition-colors hover:bg-white/10 hover:text-white"
          )}
        >
          {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
        </button>
      )}

      {/* Logo — the mark when collapsed, the full wordmark when expanded. */}
      <div className="flex h-14 items-center border-b border-white/8 px-5 bg-[#121317]">
        {collapsed ? (
          <BrandMark className="h-6 w-auto shrink-0" />
        ) : (
          <BrandWordmark variant="white" className="h-6 w-auto" />
        )}
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden px-3 py-4">
        {groupsWithCounts.map((group) => (
          <SidebarNavGroup
            key={group.label}
            group={group}
            collapsed={collapsed}
            isActive={isActive}
            onNavigate={onNavigate}
          />
        ))}
      </nav>

      {/* System status + admin profile */}
      <div className="border-t border-white/8 p-3 bg-[#121317]">
        {systemStatus && <SidebarSystemStatusLink systemStatus={systemStatus} collapsed={collapsed} />}
        <SidebarProfile
          userId={userId}
          userEmail={userEmail}
          userName={userName}
          roleLabel={roleLabel}
          collapsed={collapsed}
        />
      </div>
    </aside>
  );
}
