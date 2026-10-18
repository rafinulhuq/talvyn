import { BrandWordmark } from "@/components/BrandLogo";
import type { SiteContent } from "@/lib/cms/content";
import { template } from "@/lib/cms/content";
import { Terminal } from "lucide-react";

export function LandingFooter({ content }: { content: SiteContent }) {
  return (
    <footer className="border-t border-slate-200/80 bg-white py-14 font-sans text-slate-600">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-start gap-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <BrandWordmark variant="default" className="h-7 w-auto" ariaLabel={content.brand.name} />
            </div>
            <p className="mt-2 max-w-xs text-xs text-slate-500 font-normal">
              {content.brand.tagline || "Automated candidate assessment & screening platform."}
            </p>
          </div>

          <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium">
            {content.footerLinks.map((link) => (
              <a
                key={`${link.href}-${link.label}`}
                href={link.href}
                className="text-slate-600 transition-colors hover:text-indigo-600"
              >
                {link.label}
              </a>
            ))}
          </nav>
        </div>

        <div className="mt-10 border-t border-slate-100 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-mono text-[11px] font-medium tracking-wide">TALVYN NETWORK · ALL SYSTEMS OPERATIONAL</span>
          </div>
          <div>
            {template(content.footerCopyright, { year: new Date().getFullYear() })}
          </div>
        </div>
      </div>
    </footer>
  );
}
