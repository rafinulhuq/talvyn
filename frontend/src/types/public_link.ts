/**
 * TypeScript types for Public Assessment Link module.
 * Mirrors app/schemas/public_link.py
 */

export type PublicLinkStatus = "ACTIVE" | "DISABLED" | "EXPIRED";

export interface PublicAssessmentLink {
  id: string;
  jd_id: string;
  public_slug: string;
  title: string | null;
  status: PublicLinkStatus;
  expires_at: string | null;
  max_registrations: number | null;
  view_count: number;
  registration_count: number;
  created_at: string;
  /** Full shareable URL, e.g. https://your-domain.com/apply/<slug> */
  public_url: string;
}

export interface PublicLinkListResponse {
  items: PublicAssessmentLink[];
}

// ─── Admin: analytics ───────────────────────────────────────────

export interface PublicLinkAnalytics {
  link_id: string;
  views: number;
  registrations: number;
  starts: number;
  completions: number;
  evaluated_attempts: number;
  recommendation_breakdown: Record<string, number>;
  /** (STRONG_HIRE + HIRE) / evaluated_attempts, or null if nothing evaluated yet */
  pass_rate: number | null;
}

// ─── Admin requests ────────────────────────────────────────────

export interface CreatePublicLinkRequest {
  title?: string;
  expires_at?: string;
  max_registrations?: number;
}

export interface UpdatePublicLinkRequest {
  status?: PublicLinkStatus;
  expires_at?: string | null;
  max_registrations?: number | null;
}

// ─── Public (unauthenticated) ───────────────────────────────────

export interface PublicTestSummary {
  title: string;
  duration_minutes: number;
}

export interface PublicLinkResolveResponse {
  valid: boolean;
  jd_title: string | null;
  link_title: string | null;
  tests: PublicTestSummary[];
  reason: "not_found" | "disabled" | "expired" | "no_tests" | "max_reached" | null;
}

export interface PublicRegisterRequest {
  full_name: string;
  email: string;
  phone?: string;
  linkedin_url?: string;
  resume_url?: string;
}

export interface PublicRegisterResponse {
  status: "redirect" | "already_completed" | "terminated";
  token: string | null;
  redirect_url: string | null;
  message: string;
}

