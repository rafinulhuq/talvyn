"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, Terminal } from "lucide-react";
import { BrandWordmark } from "@/components/BrandLogo";
import { DevSignature } from "@/components/landing/DevSignature";
import type { SiteContent } from "@/lib/cms/content";

const TRIPLE_CLICK_WINDOW_MS = 600;

export function LandingNav({ content }: { content: SiteContent }) {
  const [open, setOpen] = useState(false);
  const [showSignature, setShowSignature] = useState(false);
  const pathname = usePathname();
  const clickCount = useRef(0);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleLogoClick(e: React.MouseEvent) {
    if (pathname !== "/") return;
    clickCount.current += 1;
    if (clickTimer.current) clearTimeout(clickTimer.current);
    if (clickCount.current >= 3) {
      e.preventDefault();
      clickCount.current = 0;
      setShowSignature(true);
      return;
    }
    clickTimer.current = setTimeout(() => {
      clickCount.current = 0;
    }, TRIPLE_CLICK_WINDOW_MS);
  }

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/85 backdrop-blur-md shadow-xs dark:border-slate-800 dark:bg-slate-900/85">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2.5" onClick={handleLogoClick}>
          <BrandWordmark variant="default" className="h-8 w-auto" ariaLabel={content.brand.name} />
        </Link>
        {showSignature && <DevSignature onClose={() => setShowSignature(false)} />}

        <nav className="hidden items-center gap-8 md:flex">
          {content.navLinks.map((link) => {
            const isHash = link.href.startsWith("#");
            const href = isHash ? `/${link.href}` : link.href;
            return (
              <Link
                key={`${link.href}-${link.label}`}
                href={href}
                className="group relative text-xs uppercase tracking-wider text-slate-600 font-semibold transition-colors hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400"
              >
                {link.label}
                <span className="absolute -bottom-1 left-0 h-0.5 w-0 bg-indigo-600 transition-[width] duration-200 group-hover:w-full dark:bg-indigo-400" />
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-5 md:flex">
          <Link
            href={content.navActions.login.href}
            className="text-xs uppercase tracking-wider text-slate-700 font-semibold transition-colors hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-400"
          >
            {content.navActions.login.label}
          </Link>
          <Link
            href={content.navActions.primary.href}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-white shadow-xs hover:bg-indigo-700 active:scale-[0.98] transition-all"
          >
            {content.navActions.primary.label}
          </Link>
        </div>

        <button
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200/80 bg-white text-slate-700 shadow-xs hover:bg-slate-50 active:scale-95 transition-all md:hidden dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          onClick={() => setOpen((o) => !o)}
          aria-label="Toggle menu"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-slate-200/80 bg-white px-4 pb-4 md:hidden shadow-lg dark:border-slate-800 dark:bg-slate-900">
          <nav className="flex flex-col gap-2 pt-3">
            {content.navLinks.map((link) => {
              const isHash = link.href.startsWith("#");
              const href = isHash ? `/${link.href}` : link.href;
              return (
                <Link
                  key={`${link.href}-${link.label}`}
                  href={href}
                  onClick={() => setOpen(false)}
                  className="border-b border-slate-100 py-2.5 text-xs font-medium uppercase tracking-wider text-slate-700 hover:text-indigo-600 dark:border-slate-800 dark:text-slate-300 dark:hover:text-indigo-400"
                >
                  {link.label}
                </Link>
              );
            })}
            <div className="pt-2 flex flex-col gap-2">
              <Link
                href={content.navActions.login.href}
                className="py-2 text-xs font-medium uppercase tracking-wider text-slate-700 hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-400"
              >
                {content.navActions.login.label}
              </Link>
              <Link
                href={content.navActions.primary.href}
                className="rounded-xl bg-indigo-600 py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-white shadow-xs hover:bg-indigo-700"
              >
                {content.navActions.primary.label}
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
