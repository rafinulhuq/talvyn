import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SiteFooter, SiteHeader } from "@/components/marketing/chrome";
import { BlogTeaser, Comparison, Features, FinalCta, Hero, HowItWorks, Stats, Testimonials, TestTypes, TrustedBy } from "@/components/marketing/sections";
import type { HomeSectionKey } from "@/lib/cms/site-content";
import { publicPosts, siteContent } from "@/server/cms";

// Content comes from Website content (CMP) at request time; never bake the defaults into the build.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { site } = await siteContent();
  return {
    title: { absolute: site.metadata.title },
    description: site.metadata.description,
    robots: { index: site.metadata.robotsIndex, follow: site.metadata.robotsFollow },
  };
}

const KNOWN: HomeSectionKey[] = ["hero", "trustedBy", "stats", "howItWorks", "assessmentTypes", "features", "comparison", "testimonials", "blog", "finalCta"];

export default async function HomePage() {
  const { site, home } = await siteContent();
  // Unknown or repeated keys in the stored order are ignored.
  const order = [...new Set(home.sectionOrder)].filter((k) => KNOWN.includes(k));
  const posts = order.includes("blog") ? (await publicPosts({ limit: 3 })).items : [];
  const render: Record<HomeSectionKey, () => ReactNode> = {
    hero: () => <Hero c={home.hero} />,
    trustedBy: () => <TrustedBy c={home.trustedBy} />,
    stats: () => <Stats c={home.stats} />,
    howItWorks: () => <HowItWorks c={home.howItWorks} />,
    assessmentTypes: () => <TestTypes c={home.assessmentTypes} />,
    features: () => <Features c={home.features} />,
    comparison: () => <Comparison c={home.comparison} />,
    testimonials: () => <Testimonials c={home.testimonials} />,
    blog: () => <BlogTeaser c={home.blog} posts={posts} />,
    finalCta: () => <FinalCta c={home.finalCta} />,
  };
  return (
    <div className="min-h-dvh bg-canvas">
      <SiteHeader site={site} />
      <main id="main">
        {order.map((k) => (
          <div key={k}>{render[k]()}</div>
        ))}
      </main>
      <SiteFooter site={site} />
    </div>
  );
}
