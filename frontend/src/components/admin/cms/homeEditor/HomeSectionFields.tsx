import type { HomeSectionKey } from "@/lib/cms/content";
import type { JsonObject, JsonValue } from "@/types/cms";
import type { JsonPath } from "@/lib/cms/jsonPath";
import { HeroFields } from "./HeroFields";
import { TrustedByFields } from "./TrustedByFields";
import { StatsFields } from "./StatsFields";
import { HowItWorksFields } from "./HowItWorksFields";
import { AssessmentTypesFields } from "./AssessmentTypesFields";
import { FeaturesFields } from "./FeaturesFields";
import { ComparisonFields } from "./ComparisonFields";
import { TestimonialsFields } from "./TestimonialsFields";
import { BlogSectionFields } from "./BlogSectionFields";
import { FinalCtaFields } from "./FinalCtaFields";

export function HomeSectionFields({
  sectionKey,
  draft,
  update,
}: {
  sectionKey: HomeSectionKey;
  draft: JsonObject;
  update: (path: JsonPath, value: JsonValue) => void;
}) {
  if (sectionKey === "hero") return <HeroFields draft={draft} update={update} />;
  if (sectionKey === "trustedBy") return <TrustedByFields draft={draft} update={update} />;
  if (sectionKey === "stats") return <StatsFields draft={draft} update={update} />;
  if (sectionKey === "howItWorks") return <HowItWorksFields draft={draft} update={update} />;
  if (sectionKey === "assessmentTypes") return <AssessmentTypesFields draft={draft} update={update} />;
  if (sectionKey === "features") return <FeaturesFields draft={draft} update={update} />;
  if (sectionKey === "comparison") return <ComparisonFields draft={draft} update={update} />;
  if (sectionKey === "testimonials") return <TestimonialsFields draft={draft} update={update} />;
  if (sectionKey === "blog") return <BlogSectionFields draft={draft} update={update} />;
  return <FinalCtaFields draft={draft} update={update} />;
}
