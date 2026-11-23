import type { BadgeTone } from "@/components/ui/badge";
import type { GenerationStatus, JobDescriptionListItem, ParseStatus } from "@/types/jd";

export const BUSY_GENERATION: GenerationStatus[] = ["DRAFTING", "EXTRACTING", "GENERATING"];

/** One user-facing status from the two backend state machines. */
export function jdStatus(parse: ParseStatus, gen: GenerationStatus, hasSkills = true): { label: string; tone: BadgeTone; busy: boolean } {
  if (gen === "DRAFTING") return { label: "Writing draft", tone: "accent", busy: true };
  if (parse === "PENDING" || parse === "PROCESSING") return { label: "Reading file", tone: "accent", busy: true };
  if (parse === "FAILED") return { label: "Couldn't read file", tone: "danger", busy: false };
  if (gen === "EXTRACTING") return { label: "Extracting skills", tone: "accent", busy: true };
  if (gen === "GENERATING") return { label: "Generating tests", tone: "accent", busy: true };
  if (gen === "FAILED") return { label: "Needs attention", tone: "danger", busy: false };
  if (gen === "READY") return { label: "Tests ready", tone: "success", busy: false };
  return hasSkills ? { label: "Ready for tests", tone: "neutral", busy: false } : { label: "Review text", tone: "warning", busy: false };
}

export const jdTitle = (jd: Pick<JobDescriptionListItem, "job_title" | "original_filename">) =>
  jd.job_title?.trim() || jd.original_filename.replace(/\.(pdf|docx)$/i, "");

export const SENIORITY = ["Intern", "Junior", "Mid-level", "Senior", "Lead", "Principal", "Manager", "Director"] as const;
export const TONES = ["Professional", "Friendly", "Concise", "Enthusiastic"] as const;
export const LENGTHS = ["Short", "Standard", "Detailed"] as const;
