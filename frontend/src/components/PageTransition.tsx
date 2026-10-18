"use client";

import { usePathname } from "next/navigation";

/**
 * Wraps page content so that every route change triggers a fresh CSS entrance
 * animation. Works by giving the inner div a key equal to the current pathname —
 * when the pathname changes React discards the old div and mounts a fresh one,
 * which fires the `animate-page-enter` animation from the top.
 *
 * Place this inside a persistent layout (AdminShell, test layout, etc.) so that
 * only the content area animates, not the surrounding chrome.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="animate-page-enter motion-reduce:animate-none">
      {children}
    </div>
  );
}
