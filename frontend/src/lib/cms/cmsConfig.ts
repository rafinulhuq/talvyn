import type { ComponentType } from "react";
import { FileText, Globe2, Home, Mail, UserRound } from "lucide-react";
import {
  defaultCandidateExperienceContent,
  defaultHomeContent,
  defaultInvitationEmailContent,
  defaultSiteContent,
  type CmsDocumentKey,
  type HomeSectionKey,
} from "@/lib/cms/content";
import type { JsonObject } from "@/types/cms";
import { arrayValue, cloneJson, deepMerge, getPath } from "./jsonPath";

export type JsonPathBusyState = "load" | "save" | "publish" | "restore" | null;
export type CmsMessage = { type: "success" | "error"; text: string } | null;
export type CmsTab = "content" | "blog";

export const tabConfigs: Array<{
  key: CmsTab;
  label: string;
  icon: ComponentType<{ className?: string }>;
}> = [
  { key: "content", label: "Site Content", icon: Globe2 },
  { key: "blog", label: "Blog", icon: FileText },
];

export const documentConfigs: Array<{
  key: CmsDocumentKey;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
}> = [
  { key: "site", label: "Site", description: "Metadata, navigation, footer", icon: Globe2 },
  { key: "home", label: "Homepage", description: "Drag, edit, add, hide sections", icon: Home },
  {
    key: "candidate_experience",
    label: "Candidate",
    description: "Apply, invitation, completion states",
    icon: UserRound,
  },
  { key: "invitation_email", label: "Email", description: "Subject, body, CTA, footer", icon: Mail },
];

export const homeSectionConfigs: Array<{
  key: HomeSectionKey;
  label: string;
  description: string;
}> = [
  { key: "hero", label: "Hero", description: "Headline, body, CTAs, helper text" },
  { key: "trustedBy", label: "Trusted By", description: "Brand strip and company names" },
  { key: "stats", label: "Stats", description: "Metric cards shown near the top" },
  { key: "howItWorks", label: "How It Works", description: "Process header and steps" },
  { key: "assessmentTypes", label: "Assessment Types", description: "Test type cards and tags" },
  { key: "features", label: "Features", description: "Feature card grid" },
  { key: "comparison", label: "Comparison", description: "Old way vs Talvyn rows" },
  { key: "testimonials", label: "Testimonials", description: "Customer quote cards" },
  { key: "blog", label: "From the Blog", description: "Latest published posts teaser" },
  { key: "finalCta", label: "Final CTA", description: "Bottom conversion section" },
];

export const homeSectionKeys = homeSectionConfigs.map((section) => section.key);
export const homeSectionKeySet = new Set(homeSectionKeys);

// ── Section registry — drives the accordion cards, the "On this page"
// outline, and the per-section edited indicators. `keys` are the top-level
// JSON keys of the document that belong to the section.
export type SectionMeta = { id: string; label: string; keys: string[] };

export type SectionControls = {
  expanded: Set<string>;
  edited: Set<string>;
  toggle: (id: string) => void;
};

export const siteSections: SectionMeta[] = [
  { id: "seo", label: "SEO Metadata", keys: ["metadata"] },
  { id: "brand", label: "Brand", keys: ["brand"] },
  { id: "nav", label: "Navigation Links", keys: ["navLinks"] },
  { id: "headerActions", label: "Header Actions", keys: ["navActions"] },
  { id: "footer", label: "Footer", keys: ["footerLinks", "footerCopyright"] },
];

export const candidateSections: SectionMeta[] = [
  { id: "invitationLanding", label: "Invitation Landing", keys: ["invitationLanding"] },
  { id: "sectionedExamLanding", label: "Sectioned Exam Landing", keys: ["sectionedExamLanding"] },
  { id: "applyLanding", label: "Apply Landing", keys: ["applyLanding"] },
  { id: "invalidInvitation", label: "Invalid Invitation States", keys: ["invalidInvitation"] },
  { id: "invalidPublicLink", label: "Invalid Public Link States", keys: ["invalidPublicLink"] },
  { id: "completion", label: "Completion Page", keys: ["completion"] },
  { id: "expiredPage", label: "Expired Page", keys: ["expiredPage"] },
];

export const emailSections: SectionMeta[] = [
  { id: "envelope", label: "Envelope", keys: ["subject", "preheader"] },
  { id: "headerBody", label: "Header And Body", keys: ["heading", "greeting", "intro"] },
  {
    id: "details",
    label: "Assessment Details",
    keys: ["includedLabel", "ctaLabel", "expiryLabel", "fallbackLabel", "expiryBody", "instructions"],
  },
  { id: "footerCopy", label: "Footer", keys: ["footer"] },
];

export function normalizeHomeOrder(value: unknown): HomeSectionKey[] {
  const seen = new Set<HomeSectionKey>();
  return arrayValue(value).filter((item): item is HomeSectionKey => {
    if (typeof item !== "string") return false;
    if (!homeSectionKeySet.has(item as HomeSectionKey)) return false;
    if (seen.has(item as HomeSectionKey)) return false;
    seen.add(item as HomeSectionKey);
    return true;
  });
}

export function sectionsForDocument(key: CmsDocumentKey, draft: JsonObject): SectionMeta[] {
  if (key === "home") {
    return normalizeHomeOrder(getPath(draft, ["sectionOrder"])).map((sectionKey) => {
      const config = homeSectionConfigs.find((section) => section.key === sectionKey);
      return { id: sectionKey, label: config?.label ?? sectionKey, keys: [sectionKey] };
    });
  }
  if (key === "site") return siteSections;
  if (key === "candidate_experience") return candidateSections;
  return emailSections;
}

export function sectionCardProps(controls: SectionControls, id: string) {
  return {
    collapsible: true,
    expanded: controls.expanded.has(id),
    onToggle: () => controls.toggle(id),
    edited: controls.edited.has(id),
    anchorId: `cms-section-${id}`,
  };
}

export const iconOptions = [
  "arrow-right",
  "bar-chart",
  "brain",
  "check-circle",
  "clock",
  "code",
  "file-text",
  "layers",
  "shield",
  "sparkles",
  "target",
  "trending-up",
  "trophy",
  "users",
  "zap",
];

export const colorOptions = ["brand", "blue", "purple", "emerald", "amber", "slate"];

export const sampleVariables = {
  candidateName: "Avery Rahman",
  jdTitle: "Senior Backend Engineer",
  invitedByName: "Nadia from Talent",
  platformName: "Talvyn",
};

export function defaultDraftForKey(key: CmsDocumentKey): JsonObject {
  if (key === "site") return cloneJson(defaultSiteContent as unknown as JsonObject);
  if (key === "home") return cloneJson(defaultHomeContent as unknown as JsonObject);
  if (key === "candidate_experience") {
    return cloneJson(defaultCandidateExperienceContent as unknown as JsonObject);
  }
  return cloneJson(defaultInvitationEmailContent as unknown as JsonObject);
}

export function normalizeDraft(key: CmsDocumentKey, draft: JsonObject): JsonObject {
  return deepMerge(defaultDraftForKey(key), draft);
}
