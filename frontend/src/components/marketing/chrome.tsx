import { Menu } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { safeHref, type SiteContent } from "@/lib/cms/site-content";

/** A link that might be an in-page anchor, a site path or an external URL. */
function Href({ link, className }: { link: { label: string; href: string }; className?: string }) {
  const href = safeHref(link.href);
  if (/^https?:/i.test(href))
    return (
      <a href={href} className={className} rel="noopener noreferrer">
        {link.label}
      </a>
    );
  return (
    <Link href={href} className={className}>
      {link.label}
    </Link>
  );
}
export { Href };

export function SiteHeader({ site, home = true }: { site: SiteContent; home?: boolean }) {
  // Anchor links only work on the home page; elsewhere point them at it.
  const nav = site.navLinks.map((l) => (l.href.startsWith("#") && !home ? { ...l, href: `/${l.href}` } : l));
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-8 px-5 sm:px-8">
        <Link href="/" aria-label={`${site.brand.name} home`} className="shrink-0">
          <Logo height={22} />
        </Link>
        <nav aria-label="Main" className="hidden flex-1 md:block">
          <ul className="flex gap-6">
            {nav.map((l) => (
              <li key={l.label}>
                <Href link={l} className="text-base text-ink-muted hover:text-ink" />
              </li>
            ))}
          </ul>
        </nav>
        <div className="ml-auto hidden items-center gap-2 md:flex">
          <Href link={site.navActions.login} className="inline-flex h-9 items-center rounded-control px-3.5 text-base font-medium text-ink hover:bg-sunken" />
          <Href link={site.navActions.primary} className="inline-flex h-9 items-center rounded-control bg-accent px-3.5 text-base font-medium text-accent-ink hover:bg-accent-hover" />
        </div>
        {/* No-JS mobile menu */}
        <details className="group relative ml-auto md:hidden">
          <summary className="grid size-9 cursor-pointer list-none place-items-center rounded-control text-ink-muted hover:bg-sunken [&::-webkit-details-marker]:hidden">
            <Menu aria-hidden className="size-5" />
            <span className="sr-only">Menu</span>
          </summary>
          <div className="absolute right-0 top-11 w-64 rounded-menu border border-line bg-surface p-2 shadow-float">
            {[...nav, site.navActions.login].map((l) => (
              <Href key={l.label} link={l} className="block rounded-control px-3 py-2 text-base text-ink hover:bg-sunken" />
            ))}
            <Href link={site.navActions.primary} className="mt-1 block rounded-control bg-accent px-3 py-2 text-center text-base font-medium text-accent-ink" />
          </div>
        </details>
      </div>
    </header>
  );
}

export function SiteFooter({ site }: { site: SiteContent }) {
  const year = new Date().getUTCFullYear();
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-12 sm:px-8 md:flex-row md:items-start md:justify-between">
        <div className="max-w-sm">
          <Logo height={20} />
          <p className="mt-3 text-base text-ink-muted">{site.brand.tagline}</p>
        </div>
        <nav aria-label="Footer">
          <ul className="grid grid-cols-2 gap-x-10 gap-y-2 sm:flex sm:gap-6">
            {site.footerLinks.map((l) => (
              <li key={l.label}>
                <Href link={l.href.startsWith("#") ? { ...l, href: `/${l.href}` } : l} className="text-base text-ink-muted hover:text-ink" />
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="mx-auto max-w-6xl border-t border-line px-5 py-6 sm:px-8">
        <p className="text-sm text-ink-muted">{site.footerCopyright.replaceAll("{year}", String(year))}</p>
      </div>
    </footer>
  );
}
