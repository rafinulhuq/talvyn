import type { ReactNode } from "react";
import { SiteFooter, SiteHeader } from "@/components/marketing/chrome";
import { siteContent } from "@/server/cms";

export default async function BlogLayout({ children }: { children: ReactNode }) {
  const { site } = await siteContent();
  return (
    <div className="min-h-dvh bg-canvas">
      <SiteHeader site={site} home={false} />
      <main id="main">{children}</main>
      <SiteFooter site={site} />
    </div>
  );
}
