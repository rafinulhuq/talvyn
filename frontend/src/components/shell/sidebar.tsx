"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Logo, LogoMark } from "@/components/brand/logo";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import { isActive, navFor } from "./nav";
import { useShell } from "./shell-context";

export function SidebarNav({ collapsed = false, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { user, pendingSignups } = useShell();

  return (
    <nav aria-label="Main" className="flex flex-col gap-5">
      {navFor(user.role).map((group) => (
        <div key={group.label} className="flex flex-col gap-0.5">
          {!collapsed && <p className="px-2.5 pb-1 text-sm text-ink-muted">{group.label}</p>}
          {collapsed && <div aria-hidden className="mx-2.5 mb-1 h-px bg-line first:hidden" />}
          {group.items.map((item) => {
            const active = isActive(item, pathname);
            const count = item.href === "/dashboard/users" ? pendingSignups : 0;
            // Plain <a> for document routes: a Next <Link> would prefetch them as RSC and fail.
            const LinkEl = item.document ? "a" : Link;
            const link = (
              <LinkEl
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                aria-label={collapsed ? (count ? `${item.label}, ${count} pending` : item.label) : undefined}
                className={cn(
                  "group relative flex h-8 items-center gap-2.5 rounded-control px-2.5 text-base transition-colors duration-150",
                  active ? "bg-surface font-medium text-ink shadow-[inset_0_0_0_1px_var(--line)]" : "text-ink-muted hover:bg-sunken hover:text-ink",
                  collapsed && "justify-center px-0",
                )}
              >
                {active && <span aria-hidden className="absolute -left-3 top-1.5 h-5 w-0.5 rounded-full bg-accent" />}
                <item.icon aria-hidden className={cn("size-4 shrink-0", active ? "text-accent" : "text-ink-muted group-hover:text-ink")} />
                {!collapsed && <span className="truncate">{item.label}</span>}
                {count > 0 &&
                  (collapsed ? (
                    <span aria-hidden className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-accent" />
                  ) : (
                    <span className="ml-auto rounded-control bg-accent-soft px-1.5 text-xs font-medium text-accent-soft-ink">
                      {count}
                      <span className="sr-only"> pending access requests</span>
                    </span>
                  ))}
              </LinkEl>
            );
            return collapsed ? (
              <Tooltip key={item.href} content={item.label} side="right">
                {link}
              </Tooltip>
            ) : (
              link
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export function SystemStatusLine({ collapsed = false }: { collapsed?: boolean }) {
  const { status } = useShell();
  const tone = status.state === "ok" ? "bg-success" : status.state === "degraded" ? "bg-warning" : "bg-ink-faint";
  const text =
    status.state === "ok"
      ? "All systems operational"
      : status.state === "degraded"
        ? `${status.degraded} ${status.degraded === 1 ? "service" : "services"} degraded`
        : "Status unavailable";
  const dot = <span aria-hidden className={cn("size-2 shrink-0 rounded-full", tone)} />;
  return collapsed ? (
    <Tooltip content={text} side="right">
      <span className="grid h-7 place-items-center" role="status" aria-label={text}>
        {dot}
      </span>
    </Tooltip>
  ) : (
    <p role="status" className="flex items-center gap-2 px-2.5 text-sm text-ink-muted">
      {dot}
      <span className="truncate">{text}</span>
      {status.version && status.state === "ok" && <span className="ml-auto text-xs text-ink-muted">v{status.version}</span>}
    </p>
  );
}

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <aside data-print="hide"
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-line bg-canvas transition-[width] duration-200 lg:flex",
        collapsed ? "w-14 px-2" : "w-60 px-3",
      )}
    >
      <div className={cn("flex h-14 items-center", collapsed ? "justify-center" : "justify-between pl-2.5")}>
        <Link href="/dashboard" aria-label="Talvyn overview" className="rounded-control">
          {collapsed ? <LogoMark size={22} /> : <Logo height={20} />}
        </Link>
        {!collapsed && (
          <button type="button" onClick={onToggle} aria-label="Collapse sidebar" className="grid size-7 place-items-center rounded-control text-ink-muted hover:bg-sunken hover:text-ink">
            <PanelLeftClose aria-hidden className="size-4" />
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto py-3">
        <SidebarNav collapsed={collapsed} />
      </div>
      <div className="flex flex-col gap-2 border-t border-line py-3">
        <SystemStatusLine collapsed={collapsed} />
        {collapsed && (
          <Tooltip content="Expand sidebar" side="right">
            <button type="button" onClick={onToggle} aria-label="Expand sidebar" className="grid h-7 place-items-center rounded-control text-ink-muted hover:bg-sunken hover:text-ink">
              <PanelLeftOpen aria-hidden className="size-4" />
            </button>
          </Tooltip>
        )}
      </div>
    </aside>
  );
}
