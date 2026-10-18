"use client";

import { useState, useCallback, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import Link from "next/link";
import { Menu, Search, X } from "lucide-react";
import { Sidebar, type SidebarSystemStatus } from "./Sidebar";
import { NotificationBell } from "./NotificationBell";
import { GenerationBanner } from "./GenerationBanner";
import { AdminSearch } from "./AdminSearch";
import { PageTransition } from "@/components/PageTransition";
import { BrandWordmark } from "@/components/BrandLogo";
import { UserAvatar } from "@/components/ui/UserAvatar";

type DrawerState = "closed" | "open" | "closing";

const COLLAPSE_STORAGE_KEY = "talvyn_sidebar_collapsed";

// Module-level pub/sub so useSyncExternalStore can resync every AdminShell
// instance the moment any of them writes a new value — plain localStorage
// reads have no built-in "changed" signal within the same tab.
const collapseListeners = new Set<() => void>();

function notifyCollapseListeners() {
  collapseListeners.forEach((listener) => listener());
}

function subscribeToCollapsed(callback: () => void) {
  collapseListeners.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    collapseListeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

function getCollapsedSnapshot(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

// Server render always has no localStorage — must match the client's first
// hydration pass exactly, so this stays "false" regardless of the real
// stored preference (useSyncExternalStore reconciles the real value right
// after hydration, before the browser paints, instead of the useEffect
// flash this replaces).
function getCollapsedServerSnapshot(): boolean {
  return false;
}

function setStoredCollapsed(value: boolean) {
  try {
    localStorage.setItem(COLLAPSE_STORAGE_KEY, value ? "1" : "0");
  } catch {}
  notifyCollapseListeners();
}

interface Props {
  userId?: string | null;
  userEmail: string | null | undefined;
  userName: string | null | undefined;
  userRole?: string | null;
  systemStatus?: SidebarSystemStatus;
  pendingSignupCount?: number;
  children: React.ReactNode;
}

export function AdminShell({ userId, userEmail, userName, userRole, systemStatus, pendingSignupCount, children }: Props) {
  const [drawer, setDrawer] = useState<DrawerState>("closed");
  // The global search used to sit in a permanently-visible row under the
  // mobile header. Together with the header and the generation banner that
  // consumed roughly a third of a phone viewport before any page content
  // rendered, so on small screens it is now behind a header toggle.
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const drawerRef = useRef<HTMLDialogElement>(null);
  const mobileSearchRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  // Defaults to expanded on the server render; useSyncExternalStore
  // reconciles the real localStorage value on the client during hydration,
  // before the browser paints, so a returning admin's collapsed preference
  // sticks across page loads without the post-paint flash a useEffect would
  // cause.
  const collapsed = useSyncExternalStore(
    subscribeToCollapsed,
    getCollapsedSnapshot,
    getCollapsedServerSnapshot
  );

  const toggleCollapsed = useCallback(() => {
    setStoredCollapsed(!getCollapsedSnapshot());
  }, []);

  const openDrawer = useCallback(() => {
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDrawer("open");
  }, []);
  const closeDrawer = useCallback(() => setDrawer("closing"), []);
  const drawerStateRef = useRef(drawer);
  useEffect(() => {
    drawerStateRef.current = drawer;
  }, [drawer]);
  const onDrawerAnimationEnd = useCallback(() => {
    if (drawerStateRef.current === "closing") {
      // Slide-out animation has finished — now it's safe to actually leave
      // the top layer (an earlier .close() would have snapped the drawer
      // away mid-animation).
      drawerRef.current?.close();
      (previousFocusRef.current ?? menuButtonRef.current)?.focus();
    }
    setDrawer((s) => (s === "closing" ? "closed" : s));
  }, []);

  const toggleMobileSearch = useCallback(() => {
    setMobileSearchOpen((open) => !open);
  }, []);

  useEffect(() => {
    if (!mobileSearchOpen) return;
    mobileSearchRef.current?.querySelector("input")?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileSearchOpen(false);
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [mobileSearchOpen]);

  // Runs synchronously before paint so the drawer never renders in a closed,
  // pre-showModal() frame. showModal() promotes it to the top layer, which
  // is what actually gives keyboard users native focus trapping — Tab can no
  // longer escape into the header/main content behind the backdrop.
  useLayoutEffect(() => {
    if (drawer !== "open") return;
    const dialog = drawerRef.current;
    if (!dialog) return;

    dialog.showModal();

    const firstFocusable = dialog.querySelector<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    firstFocusable?.focus();

    // Escape fires `cancel` on a modal dialog and would otherwise close it
    // instantly, skipping the slide-out animation — intercept it and go
    // through the same closing state as every other close path instead.
    function handleCancel(event: Event) {
      event.preventDefault();
      closeDrawer();
    }

    // Backdrop-click-to-dismiss, wired imperatively rather than as a JSX
    // onClick: <dialog> has no semantic "interactive" role of its own, and
    // Escape (above) is already the full keyboard-equivalent close path, so
    // this is a pointer-only convenience layered on top of it.
    function handleClick(event: MouseEvent) {
      if (event.target === dialog) closeDrawer();
    }

    dialog.addEventListener("cancel", handleCancel);
    dialog.addEventListener("click", handleClick);
    return () => {
      dialog.removeEventListener("cancel", handleCancel);
      dialog.removeEventListener("click", handleClick);
    };
  }, [drawer, closeDrawer]);

  return (
    <div className="admin-shell-root flex h-dvh overflow-hidden bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <a
        href="#admin-main"
        className="sr-only fixed left-3 top-3 z-[60] rounded-lg border border-indigo-600 bg-indigo-600 px-3 py-2 text-sm font-medium text-white shadow-md focus:not-sr-only"
      >
        Skip to main content
      </a>

      {/* Desktop sidebar */}
      <div className="hidden md:flex shrink-0">
        <Sidebar
          userId={userId}
          userEmail={userEmail}
          userName={userName}
          userRole={userRole}
          systemStatus={systemStatus}
          pendingSignupCount={pendingSignupCount}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapsed}
        />
      </div>

      {/* Mobile sidebar drawer — kept mounted during close animation. */}
      {drawer !== "closed" && (
        <dialog
          ref={drawerRef}
          id="mobile-navigation"
          aria-label="Navigation menu"
          className={`fixed inset-y-0 left-0 z-50 m-0 h-full max-h-none w-64 max-w-none border-0 bg-transparent p-0 shadow-2xl backdrop:bg-slate-900/50 md:hidden ${
            drawer === "closing"
              ? "animate-slide-out-left backdrop:animate-fade-backdrop-out"
              : "animate-slide-in-left backdrop:animate-fade-backdrop"
          }`}
          onAnimationEnd={onDrawerAnimationEnd}
        >
          <Sidebar
            onNavigate={closeDrawer}
            userId={userId}
            userEmail={userEmail}
            userName={userName}
            userRole={userRole}
            systemStatus={systemStatus}
            pendingSignupCount={pendingSignupCount}
          />
        </dialog>
      )}

      {/* Main area */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-slate-50 dark:bg-slate-950">
        {/* Top header */}
        <header className="z-20 flex h-14 shrink-0 items-center gap-3 border-b border-slate-200/80 bg-white/90 backdrop-blur-md px-4 shadow-xs dark:border-slate-800 dark:bg-slate-900/90">
          {/* Hamburger — mobile only */}
          <button
            ref={menuButtonRef}
            className="touch-target rounded-lg border border-slate-200 bg-white p-2 text-slate-600 md:hidden shadow-xs hover:bg-slate-50 hover:text-slate-900 active:scale-95 transition-all dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
            onClick={openDrawer}
            aria-label="Open navigation menu"
            aria-controls="mobile-navigation"
            aria-expanded={drawer === "open"}
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Logo — mobile only (desktop logo is inside Sidebar) */}
          <div className="flex min-w-0 flex-1 items-center gap-2 md:hidden">
            <BrandWordmark className="h-6 w-auto shrink-0" />
          </div>

          {/* Admin global search */}
          <div className="hidden min-w-0 flex-1 md:flex md:justify-center">
            <AdminSearch />
          </div>

          {/* Right side: search (mobile) + theme + bell + user info */}
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={toggleMobileSearch}
              aria-label={mobileSearchOpen ? "Close search" : "Open search"}
              aria-expanded={mobileSearchOpen}
              aria-controls="mobile-admin-search"
              className="touch-target rounded-lg border border-slate-200 bg-white p-2 text-slate-600 md:hidden shadow-xs hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
            >
              {mobileSearchOpen ? <X className="h-4 w-4" /> : <Search className="h-4 w-4" />}
            </button>
            <NotificationBell />
            <div className="hidden sm:flex items-center gap-2.5">
              <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-300">
                {userRole === "SUPER_ADMIN" ? "SUPER" : userRole || "USER"}
              </span>
              <div className="text-right">
                <p className="max-w-[140px] truncate text-xs font-semibold text-slate-900 dark:text-slate-100">{userName}</p>
                <p className="max-w-[140px] truncate text-[11px] text-slate-500 dark:text-slate-400">
                  {userRole === "SUPER_ADMIN" ? "Super Admin" : userRole === "ADMIN" ? "Admin" : "User"}
                </p>
              </div>
            </div>
            <Link
              href="/dashboard/profile"
              title="Edit your profile picture"
              className="shrink-0 rounded-full transition-transform hover:scale-105 active:scale-100"
            >
              {userId ? (
                <UserAvatar userId={userId} name={userName} size={30} />
              ) : (
                <div className="flex h-7.5 w-7.5 shrink-0 items-center justify-center rounded-full bg-indigo-50 border border-indigo-200 text-xs font-semibold text-indigo-700">
                  {userName?.charAt(0).toUpperCase() ?? "A"}
                </div>
              )}
            </Link>
          </div>
        </header>

        {mobileSearchOpen && (
          <div
            id="mobile-admin-search"
            ref={mobileSearchRef}
            className="origin-top animate-scale-in border-b border-slate-200 bg-white px-4 py-2 motion-reduce:animate-none md:hidden dark:border-slate-800 dark:bg-slate-900"
          >
            <AdminSearch />
          </div>
        )}

        {/* Generation banner — spans full width below header */}
        <GenerationBanner />

        {/* Page content — the extra bottom padding clears iOS Safari's floating
            toolbar, which otherwise sits over the last row of a scrolled page. */}
        <main
          id="admin-main"
          tabIndex={-1}
          className="flex-1 overflow-y-auto px-4 pt-4 pb-[calc(2rem+env(safe-area-inset-bottom))] md:p-6 md:pb-8 lg:p-8 lg:pb-10"
        >
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
    </div>
  );
}
