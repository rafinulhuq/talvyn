import type { Metadata } from "next";

import { AnimatedSection } from "@/components/AnimatedSection";
import { AssessmentTypesSection } from "@/components/landing/AssessmentTypesSection";
import { BlogTeaserSection } from "@/components/landing/BlogTeaserSection";
import { ComparisonSection } from "@/components/landing/ComparisonSection";
import { FeaturesSection } from "@/components/landing/FeaturesSection";
import { FinalCtaSection } from "@/components/landing/FinalCtaSection";
import { HeroSection } from "@/components/landing/HeroSection";
import { HowItWorksSection } from "@/components/landing/HowItWorksSection";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { LandingNav } from "@/components/landing/LandingNav";
import { StatsSection, TrustedBySection } from "@/components/landing/SocialProofSections";
import { TestimonialsSection } from "@/components/landing/TestimonialsSection";
import type { HomeSectionKey } from "@/lib/cms/content";
import { getPublicBlogList } from "@/lib/cms/publicBlog";
import { getPublicCmsContent } from "@/lib/cms/publicContent";

// The landing page is driven by CMP content published from the admin panel.
// Without this, Next.js prerenders the page at build time — when the backend
// is unreachable — permanently baking in the default content.
export const dynamic = "force-dynamic";

const homeSectionKeys: HomeSectionKey[] = [
  "hero",
  "trustedBy",
  "stats",
  "howItWorks",
  "assessmentTypes",
  "features",
  "comparison",
  "testimonials",
  "blog",
  "finalCta",
];
const homeSectionKeySet = new Set(homeSectionKeys);

function normalizeHomeSectionOrder(order: HomeSectionKey[]): HomeSectionKey[] {
  const seen = new Set<HomeSectionKey>();
  return order.filter((key): key is HomeSectionKey => {
    if (!homeSectionKeySet.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function generateMetadata(): Promise<Metadata> {
  const cms = await getPublicCmsContent();
  return {
    title: cms.site.metadata.title,
    description: cms.site.metadata.description,
    robots: {
      index: cms.site.metadata.robotsIndex,
      follow: cms.site.metadata.robotsFollow,
    },
  };
}

export default async function LandingPage() {
  const cms = await getPublicCmsContent();
  const sectionOrder = normalizeHomeSectionOrder(cms.home.sectionOrder);
  const blogPosts = sectionOrder.includes("blog")
    ? (await getPublicBlogList(1, undefined, 3)).items
    : [];

  return (
    <div className="min-h-screen bg-[#0B0C0E] text-white selection:bg-[#F2D74E] selection:text-[#1A1600] antialiased relative overflow-x-hidden">
      <LandingNav content={cms.site} />
      {sectionOrder.map((sectionKey, index) => {
        if (sectionKey === "hero") {
          return (
            <div key={sectionKey} className="animate-page-enter">
              <HeroSection content={cms.home.hero} />
            </div>
          );
        }

        return (
          <AnimatedSection key={sectionKey} delay={sectionKey === "stats" ? 60 : index * 20}>
            {sectionKey === "trustedBy" && <TrustedBySection content={cms.home.trustedBy} />}
            {sectionKey === "stats" && <StatsSection items={cms.home.stats} />}
            {sectionKey === "howItWorks" && <HowItWorksSection content={cms.home.howItWorks} />}
            {sectionKey === "assessmentTypes" && (
              <AssessmentTypesSection content={cms.home.assessmentTypes} />
            )}
            {sectionKey === "features" && <FeaturesSection content={cms.home.features} />}
            {sectionKey === "comparison" && <ComparisonSection content={cms.home.comparison} />}
            {sectionKey === "testimonials" && (
              <TestimonialsSection content={cms.home.testimonials} />
            )}
            {sectionKey === "blog" && (
              <BlogTeaserSection content={cms.home.blog} posts={blogPosts} />
            )}
            {sectionKey === "finalCta" && <FinalCtaSection content={cms.home.finalCta} />}
          </AnimatedSection>
        );
      })}
      <AnimatedSection><LandingFooter content={cms.site} /></AnimatedSection>
    </div>
  );
}
