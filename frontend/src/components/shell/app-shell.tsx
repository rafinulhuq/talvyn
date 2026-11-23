"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Menu, Search, X } from "lucide-react";
import { useCallback, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { Kbd } from "@/components/ui/kbd";
import type { AppUser } from "@/server/session";
import { CommandMenu } from "./command-menu";
import { Notifications } from "./notifications";
import { ShellContext, type SystemStatus } from "./shell-context";
import { ShortcutsDialog, useGlobalShortcuts } from "./shortcuts";
import { Sidebar, SidebarNav, SystemStatusLine } from "./sidebar";
import { UserMenu } from "./user-menu";

const COLLAPSE_KEY = "talvyn_sidebar_collapsed";
const collapseListeners = new Set<() => void>();
const subscribeCollapse = (l: () => void) => (collapseListeners.add(l), () => collapseListeners.delete(l));
const readCollapsed = () => localStorage.getItem(COLLAPSE_KEY) === "1";

export function AppShell({
  user,
  status,
  pendingSignups,
  children,
}: {
  user: AppUser;
  status: SystemStatus;
  pendingSignups: number;
  children: ReactNode;
}) {
  const [commandOpen, setCommandOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const collapsed = useSyncExternalStore(subscribeCollapse, readCollapsed, () => false);

  const openCommand = useCallback(() => setCommandOpen(true), []);
  const toggleCommand = useCallback(() => setCommandOpen((o) => !o), []);
  const toggleCollapsed = () => {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? "0" : "1");
    collapseListeners.forEach((l) => l());
  };

  const ctx = useMemo(() => ({ user, status, pendingSignups, openCommand }), [user, status, pendingSignups, openCommand]);

  return (
    <ShellContext.Provider value={ctx}>
      <ShellInner
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
        commandOpen={commandOpen}
        setCommandOpen={setCommandOpen}
        openCommand={openCommand}
        toggleCommand={toggleCommand}
      >
        {children}
      </ShellInner>
    </ShellContext.Provider>
  );
}

function ShellInner({
  collapsed,
  onToggleCollapsed,
  mobileOpen,
  setMobileOpen,
  commandOpen,
  setCommandOpen,
  openCommand,
  toggleCommand,
  children,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  setMobileOpen: (o: boolean) => void;
  commandOpen: boolean;
  setCommandOpen: (o: boolean) => void;
  openCommand: () => void;
  toggleCommand: () => void;
  children: ReactNode;
}) {
  const { helpOpen, setHelpOpen } = useGlobalShortcuts(openCommand, toggleCommand);

  return (
    <div className="flex min-h-dvh">
      <a href="#main" className="sr-only z-[70] rounded-control bg-surface px-3 py-2 focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
        Skip to content
      </a>
      <Sidebar collapsed={collapsed} onToggle={onToggleCollapsed} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header data-print="hide" className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-line bg-canvas/90 px-4 backdrop-blur-sm supports-[backdrop-filter]:bg-canvas/75 lg:px-8">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            className="grid size-8 place-items-center rounded-control text-ink-muted hover:bg-sunken hover:text-ink lg:hidden"
          >
            <Menu aria-hidden className="size-4" />
          </button>
          <span className="lg:hidden">
            <Logo height={18} />
          </span>

          <button
            type="button"
            onClick={openCommand}
            className="ml-auto flex h-8 w-full max-w-sm items-center gap-2 rounded-control border border-line bg-surface px-2.5 text-base text-ink-muted transition-colors hover:border-line-strong lg:ml-0"
          >
            <Search aria-hidden className="size-4" />
            <span className="flex-1 truncate text-left">Search</span>
            <span className="hidden gap-0.5 sm:flex" aria-hidden>
              <Kbd>⌘</Kbd>
              <Kbd>K</Kbd>
            </span>
          </button>

          <div className="ml-auto flex items-center gap-1">
            <Notifications />
            <UserMenu />
          </div>
        </header>

        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-8 outline-none lg:px-8">
          {children}
        </main>
      </div>

      <DialogPrimitive.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-overlay animate-fade-in lg:hidden" />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-line bg-canvas px-3 focus:outline-none lg:hidden"
          >
            <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
            <div className="flex h-14 items-center justify-between pl-2.5">
              <Logo height={18} />
              <DialogPrimitive.Close className="grid size-8 place-items-center rounded-control text-ink-muted hover:bg-sunken hover:text-ink">
                <X aria-hidden className="size-4" />
                <span className="sr-only">Close navigation</span>
              </DialogPrimitive.Close>
            </div>
            <div className="flex-1 overflow-y-auto py-3">
              <SidebarNav onNavigate={() => setMobileOpen(false)} />
            </div>
            <div className="border-t border-line py-3">
              <SystemStatusLine />
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <CommandMenu open={commandOpen} onOpenChange={setCommandOpen} />
      <ShortcutsDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  );
}
