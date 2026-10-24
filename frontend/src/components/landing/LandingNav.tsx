"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
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
    <header className="sticky top-0 z-50 h-16 border-b border-white/[0.06] bg-[#0B0C0E]/75 backdrop-blur-[12px] backdrop-saturate-[140%]">
      <div className="mx-auto flex h-full max-w-[1160px] items-center justify-between px-5 sm:px-8">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2.5" onClick={handleLogoClick}>
          <BrandWordmark variant="on-dark" className="h-7 w-auto" ariaLabel={content.brand.name} />
        </Link>
        {showSignature && <DevSignature onClose={() => setShowSignature(false)} />}

        {/* Desktop Links */}
        <nav className="hidden items-center gap-7 md:flex" aria-label="Primary">
          {content.navLinks.map((link) => {
            const isHash = link.href.startsWith("#");
            const href = isHash ? `/${link.href}` : link.href;
            return (
              <Link
                key={`${link.href}-${link.label}`}
                href={href}
                className="text-[14px] text-[#8A8F98] transition-colors hover:text-white"
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Desktop Actions */}
        <div className="hidden items-center gap-5 md:flex">
          <Link
            href={content.navActions.login.href}
            className="text-[14px] text-[#8A8F98] transition-colors hover:text-white"
          >
            {content.navActions.login.label}
          </Link>
          <Link
            href={content.navActions.primary.href}
            className="rounded-[8px] bg-[#F2D74E] px-[14px] py-[8px] text-[14px] font-semibold text-[#1A1600] transition-colors hover:bg-[#F7E27A] focus-visible:outline-2 focus-visible:outline-[#F2D74E] focus-visible:outline-offset-3"
          >
            {content.navActions.primary.label}
          </Link>
        </div>

        {/* Mobile Toggle */}
        <button
          className="flex h-9 w-9 items-center justify-center rounded-[8px] border border-white/[0.08] bg-[#181A1F] text-white transition-colors md:hidden"
          onClick={() => setOpen((o) => !o)}
          aria-label="Toggle menu"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile Drawer */}
      {open && (
        <div className="border-t border-white/[0.08] bg-[#121317] px-5 pb-5 pt-3 md:hidden">
          <nav className="flex flex-col gap-2">
            {content.navLinks.map((link) => {
              const isHash = link.href.startsWith("#");
              const href = isHash ? `/${link.href}` : link.href;
              return (
                <Link
                  key={`${link.href}-${link.label}`}
                  href={href}
                  onClick={() => setOpen(false)}
                  className="border-b border-white/[0.06] py-2.5 text-[14px] text-[#8A8F98] hover:text-white"
                >
                  {link.label}
                </Link>
              );
            })}
            <div className="flex flex-col gap-2.5 pt-3">
              <Link
                href={content.navActions.login.href}
                className="py-2 text-[14px] text-[#8A8F98] hover:text-white"
              >
                {content.navActions.login.label}
              </Link>
              <Link
                href={content.navActions.primary.href}
                className="rounded-[8px] bg-[#F2D74E] py-2.5 text-center text-[14px] font-semibold text-[#1A1600] hover:bg-[#F7E27A]"
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
