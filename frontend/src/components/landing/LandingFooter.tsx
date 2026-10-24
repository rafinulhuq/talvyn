import Link from "next/link";
import { BrandWordmark } from "@/components/BrandLogo";
import type { SiteContent } from "@/lib/cms/content";
import { template } from "@/lib/cms/content";

export function LandingFooter({ content }: { content: SiteContent }) {
  return (
    <footer className="mt-28 border-t border-white/[0.08] pt-10 pb-14 text-[#8A8F98]">
      <div className="mx-auto max-w-[1160px] px-5 sm:px-8">
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr] max-[760px]:grid-cols-2 gap-10 max-[760px]:gap-8">
          {/* Brand Column */}
          <div className="flex flex-col items-start">
            <Link href="/" className="flex items-center gap-2.5" aria-label="Talvyn home">
              <BrandWordmark variant="on-dark" className="h-7 w-auto" ariaLabel={content.brand.name} />
            </Link>
            <p className="mt-3.5 max-w-xs text-[13px] text-[#5A5F68] leading-relaxed">
              {content.brand.tagline || "Automated candidate assessment & screening platform for engineering teams."}
            </p>
            <p className="mt-4 text-[13px] text-[#5A5F68]">
              {template(content.footerCopyright, { year: new Date().getFullYear() })}
            </p>
          </div>

          {/* Product Nav */}
          <nav className="flex flex-col" aria-label="Product">
            <span className="text-[12px] uppercase tracking-[0.1em] text-[#5A5F68] mb-4 font-mono">
              Product
            </span>
            <ul className="list-none flex flex-col gap-2.5 text-[14px]">
              <li><Link href="#assessment-types" className="text-[#8A8F98] hover:text-white transition-colors">Assessments</Link></li>
              <li><Link href="#features" className="text-[#8A8F98] hover:text-white transition-colors">Telemetry</Link></li>
              <li><Link href="#how-it-works" className="text-[#8A8F98] hover:text-white transition-colors">Anti-Cheat</Link></li>
              <li><Link href="#comparison" className="text-[#8A8F98] hover:text-white transition-colors">Rubric Scoring</Link></li>
            </ul>
          </nav>

          {/* Developers Nav */}
          <nav className="flex flex-col" aria-label="Developers">
            <span className="text-[12px] uppercase tracking-[0.1em] text-[#5A5F68] mb-4 font-mono">
              Developers
            </span>
            <ul className="list-none flex flex-col gap-2.5 text-[14px]">
              <li><Link href="/dashboard/docs" className="text-[#8A8F98] hover:text-white transition-colors">Docs</Link></li>
              <li><Link href="/api" className="text-[#8A8F98] hover:text-white transition-colors">API Reference</Link></li>
              <li><Link href="/blog" className="text-[#8A8F98] hover:text-white transition-colors">Engineering Blog</Link></li>
              <li><Link href="#system-status" className="text-[#8A8F98] hover:text-white transition-colors">System Status</Link></li>
            </ul>
          </nav>

          {/* Company Nav */}
          <nav className="flex flex-col" aria-label="Company">
            <span className="text-[12px] uppercase tracking-[0.1em] text-[#5A5F68] mb-4 font-mono">
              Company
            </span>
            <ul className="list-none flex flex-col gap-2.5 text-[14px]">
              <li><Link href="#about" className="text-[#8A8F98] hover:text-white transition-colors">About</Link></li>
              <li><Link href="#careers" className="text-[#8A8F98] hover:text-white transition-colors">Careers</Link></li>
              <li><Link href="#security" className="text-[#8A8F98] hover:text-white transition-colors">Security</Link></li>
              <li><Link href="#contact" className="text-[#8A8F98] hover:text-white transition-colors">Contact</Link></li>
            </ul>
          </nav>
        </div>

        {/* Operational Bar */}
        <div className="mt-12 border-t border-white/[0.06] pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-mono text-[#5A5F68]">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-[#4ADE80] animate-pulse" />
            <span className="text-[11px] font-medium text-[#4ADE80]">TALVYN TELEMETRY · ALL SYSTEMS OPERATIONAL</span>
          </div>
          <div>Audit-Grade Defensibility</div>
        </div>
      </div>
    </footer>
  );
}
