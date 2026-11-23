import {
  BookOpen,
  Briefcase,
  ClipboardCheck,
  FileSearch,
  LayoutDashboard,
  LayoutTemplate,
  PanelsTopLeft,
  ScanText,
  Settings,
  ShieldCheck,
  Sprout,
  Trash2,
  Trophy,
  Users,
  type LucideIcon,
} from "lucide-react";
import { canViewDocs, roleAtLeast, type RankedRole } from "@/lib/roles";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Minimum ranked role. Mirrors the gates in src/proxy.ts (UX only; the backend is the authority). */
  minRole?: RankedRole;
  /** Custom visibility (Docs is visible to the unranked DEV role). */
  visible?: (role: string) => boolean;
  exact?: boolean;
  /** Shortcut shown in the command menu: "g" then this key. */
  key?: string;
};

export type NavGroup = { label: string; items: NavItem[] };

export const NAV: NavGroup[] = [
  {
    label: "Hiring",
    items: [
      { label: "Overview", href: "/dashboard", icon: LayoutDashboard, exact: true, key: "o" },
      { label: "Job descriptions", href: "/dashboard/jds", icon: Briefcase, key: "j" },
      { label: "Candidates", href: "/dashboard/candidates", icon: Users, key: "c" },
      { label: "Results", href: "/dashboard/results", icon: ClipboardCheck, key: "r" },
      { label: "Leaderboard", href: "/dashboard/leaderboard", icon: Trophy, key: "l" },
      { label: "Exam templates", href: "/dashboard/templates", icon: LayoutTemplate, minRole: "ADMIN" },
    ],
  },
  {
    label: "Tools",
    items: [
      { label: "AI writing check", href: "/dashboard/ai-checker", icon: ScanText },
      { label: "Résumé ATS check", href: "/dashboard/ats-checker", icon: FileSearch },
    ],
  },
  {
    label: "Workspace",
    items: [
      { label: "Users", href: "/dashboard/users", icon: ShieldCheck, minRole: "SUPER_ADMIN" },
      { label: "Website content", href: "/dashboard/cmp", icon: PanelsTopLeft, minRole: "SUPER_ADMIN" },
      { label: "Highgarden", href: "/dashboard/highgarden", icon: Sprout, minRole: "SUPER_ADMIN" },
      { label: "Trash", href: "/dashboard/trash", icon: Trash2, minRole: "SUPER_ADMIN" },
      { label: "Settings", href: "/dashboard/settings", icon: Settings, minRole: "ADMIN", key: "s" },
      { label: "Docs", href: "/dashboard/docs", icon: BookOpen, visible: canViewDocs },
    ],
  },
];

export function navFor(role: string): NavGroup[] {
  return NAV.map((g) => ({
    ...g,
    items: g.items.filter((i) => (i.visible ? i.visible(role) : i.minRole ? roleAtLeast(role, i.minRole) : true)),
  })).filter((g) => g.items.length > 0);
}

export const isActive = (item: NavItem, pathname: string) =>
  item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);

export const roleLabel = (role: string) =>
  ({ SUPER_ADMIN: "Super Admin", ADMIN: "Admin", DEV: "Developer", USER: "Member" })[role] ?? "Member";
