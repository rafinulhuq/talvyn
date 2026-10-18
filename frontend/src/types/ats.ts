/**
 * ATS Checker types — mirrors backend/app/schemas/ats.py.
 *
 * Scoring is deterministic on the backend, so unlike the AI Checker there is
 * no job id, no polling status, and no queued/running states to model here.
 */

export type ATSCategoryKey =
  | "parseability"
  | "contact"
  | "sections"
  | "content"
  | "formatting"
  | "keywords";

export type ATSSeverity = "CRITICAL" | "WARNING" | "INFO" | "GOOD";

export type ATSBand = "EXCELLENT" | "GOOD" | "NEEDS_WORK" | "POOR";

export type ATSExtractionMethod = "native" | "ocr";

export interface ATSCheckRequest {
  text: string;
  filename?: string | null;
  extraction_method?: ATSExtractionMethod | null;
  jd_id?: string | null;
  keywords?: string[] | null;
}

export interface ATSFinding {
  category: ATSCategoryKey;
  severity: ATSSeverity;
  message: string;
  suggestion: string;
}

export interface ATSCategoryResult {
  key: ATSCategoryKey;
  label: string;
  /** `max_score` is 0 when the category did not apply (e.g. no JD selected). */
  score: number;
  max_score: number;
  summary: string;
}

export interface ATSKeywordMatch {
  source: "JD" | "MANUAL" | "NONE";
  jd_title: string | null;
  matched: string[];
  missing: string[];
  must_have_matched: string[];
  must_have_missing: string[];
  coverage_percent: number;
}

export interface ATSDetectedContact {
  email: string | null;
  phone: string | null;
  location: string | null;
  links: string[];
}

export interface ATSCheckResponse {
  score: number;
  band: ATSBand;
  headline: string;
  categories: ATSCategoryResult[];
  findings: ATSFinding[];
  keyword_match: ATSKeywordMatch;
  detected_sections: string[];
  missing_sections: string[];
  detected_contact: ATSDetectedContact;
  word_count: number;
  estimated_pages: number;
  disclaimer: string;
}

export interface ATSExtractedTextResponse {
  text: string;
  extraction_method: ATSExtractionMethod;
}

/** Presentation config for each score band — label, tone, and meter color. */
export const ATS_BAND_CONFIG: Record<
  ATSBand,
  { label: string; badge: "green" | "blue" | "yellow" | "red"; color: string }
> = {
  // Colors are the Teal + Coral system's tokens (see tailwind.config.ts),
  // inlined because they also drive an SVG/conic-gradient meter that can't
  // read a Tailwind class.
  EXCELLENT: { label: "Excellent", badge: "green", color: "#17968a" },
  GOOD: { label: "Good", badge: "blue", color: "#0d5f59" },
  NEEDS_WORK: { label: "Needs work", badge: "yellow", color: "#f59e0b" },
  POOR: { label: "Poor", badge: "red", color: "#e2542d" },
};

export const ATS_SEVERITY_CONFIG: Record<
  ATSSeverity,
  { label: string; badge: "green" | "blue" | "yellow" | "red" | "slate" }
> = {
  CRITICAL: { label: "Critical", badge: "red" },
  WARNING: { label: "Warning", badge: "yellow" },
  INFO: { label: "Suggestion", badge: "slate" },
  GOOD: { label: "Passing", badge: "green" },
};
