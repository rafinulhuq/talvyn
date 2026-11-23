/**
 * Public website content: CMP documents "site" and "home". The backend merges
 * its defaults (backend/app/cms/defaults.py) with what's published; these
 * fallbacks are only used if the backend can't be reached, and mirror it.
 */
export type CmsLink = { label: string; href: string };
export type HomeSectionKey = "hero" | "trustedBy" | "stats" | "howItWorks" | "assessmentTypes" | "features" | "comparison" | "testimonials" | "blog" | "finalCta";

export type SiteContent = {
  metadata: { title: string; titleTemplate: string; description: string; robotsIndex: boolean; robotsFollow: boolean };
  brand: { name: string; tagline: string };
  navLinks: CmsLink[];
  navActions: { login: CmsLink; primary: CmsLink };
  footerLinks: CmsLink[];
  footerCopyright: string;
};

type Heading = { eyebrow: string; title: string; highlight: string };
export type HomeContent = {
  sectionOrder: HomeSectionKey[];
  hero: { eyebrow: string; titlePrefix: string; titleHighlight: string; body: string; primaryCta: CmsLink; secondaryCta: CmsLink; helperText: string };
  trustedBy: { eyebrow: string; companies: string[] };
  stats: { value: string; label: string; icon: string }[];
  howItWorks: Heading & { body: string; steps: { step: string; title: string; body: string; icon: string; color: string }[]; media?: { type: "video" | "image"; src: string; poster?: string; caption?: string } | null };
  assessmentTypes: Heading & { body: string; items: { icon: string; label: string; color: string; description: string; tags: string[] }[] };
  features: Heading & { body: string; items: { icon: string; title: string; body: string }[] };
  comparison: Heading & { oldLabel: string; newLabel: string; rows: { label: string; old: string; now: string }[] };
  testimonials: Heading & { quotes: { text: string; name: string; role: string; stars: number; avatarUrl?: string; videoUrl?: string }[] };
  blog: Heading & { body: string; ctaLabel: string };
  finalCta: { eyebrow: string; title: string; body: string; primaryCta: CmsLink; secondaryCta: CmsLink; helperText: string };
};

export const DEFAULT_SITE: SiteContent = {
  metadata: {
    title: "Talvyn",
    titleTemplate: "%s | Talvyn",
    description: "Turn a job description into a fair, timed skills assessment. Invite candidates, score their answers and compare them in one place.",
    robotsIndex: false,
    robotsFollow: false,
  },
  brand: { name: "Talvyn", tagline: "Skills assessments built from your job descriptions." },
  navLinks: [
    { label: "How it works", href: "#how-it-works" },
    { label: "What it tests", href: "#test-types" },
    { label: "Features", href: "#features" },
    { label: "Blog", href: "/blog" },
  ],
  navActions: { login: { label: "Sign in", href: "/login" }, primary: { label: "Request access", href: "/signup" } },
  footerLinks: [
    { label: "How it works", href: "#how-it-works" },
    { label: "Features", href: "#features" },
    { label: "Blog", href: "/blog" },
    { label: "Sign in", href: "/login" },
  ],
  footerCopyright: "© {year} Talvyn. All rights reserved.",
};

export const DEFAULT_HOME: HomeContent = {
  sectionOrder: ["hero", "trustedBy", "stats", "howItWorks", "assessmentTypes", "features", "comparison", "testimonials", "blog", "finalCta"],
  hero: {
    eyebrow: "Skills assessment for hiring teams",
    titlePrefix: "Turn a job description into a fair, timed assessment.",
    titleHighlight: "",
    body: "Upload the role, review the tests Talvyn writes from it, and invite candidates. Multiple-choice answers are marked instantly, written answers are scored against a rubric, and you make the final call with the evidence in front of you.",
    primaryCta: { label: "Request access", href: "/signup" },
    secondaryCta: { label: "See how it works", href: "#how-it-works" },
    helperText: "The AI model runs on your own servers, so candidates' answers aren't sent to an outside AI provider.",
  },
  trustedBy: { eyebrow: "Used by hiring teams at", companies: [] },
  stats: [],
  howItWorks: { eyebrow: "How it works", title: "From job description to shortlist", highlight: "", body: "", steps: [], media: null },
  assessmentTypes: { eyebrow: "What it tests", title: "Three tests for every role", highlight: "", body: "", items: [] },
  features: { eyebrow: "Features", title: "What you get", highlight: "", body: "", items: [] },
  comparison: { eyebrow: "", title: "", highlight: "", oldLabel: "", newLabel: "", rows: [] },
  testimonials: { eyebrow: "", title: "", highlight: "", quotes: [] },
  blog: { eyebrow: "From the blog", title: "Notes on hiring and assessment", highlight: "", body: "", ctaLabel: "All posts" },
  finalCta: {
    eyebrow: "Get started",
    title: "Run your next hiring round on Talvyn",
    body: "",
    primaryCta: { label: "Request access", href: "/signup" },
    secondaryCta: { label: "Sign in", href: "/login" },
    helperText: "",
  },
};

/** Title plus its "highlight" part as one sentence; the design never styles a single phrase differently. */
export const fullTitle = (h: { title: string; highlight: string }) => [h.title, h.highlight].map((s) => s.trim()).filter(Boolean).join(" ");

/** Only same-site paths, in-page anchors, mailto and http(s) are rendered as links. */
export function safeHref(href: string): string {
  const h = href.trim();
  return /^(\/(?!\/)|#|mailto:|https?:\/\/)/i.test(h) ? h : "#";
}
