import type { AIRecommendation } from "./evaluation";
import type { InvitationStatus } from "./invitation";

export interface CandidateListItem {
  id: string;
  candidate_number: number;
  name: string;
  email: string;
  phone: string | null;
  created_at: string;
  total_attempts: number;
  completed_attempts: number;
  last_activity_at: string | null;
}

export interface CandidateListResponse {
  items: CandidateListItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface CandidateProfileResponse {
  id: string;
  candidate_number: number;
  name: string;
  email: string;
  phone: string | null;
  linkedin_url: string | null;
  resume_url: string | null;
  created_at: string;
  total_invitations: number;
  total_attempts: number;
  completed_attempts: number;
}

export interface CandidateAttemptItem {
  attempt_id: string;
  invitation_id: string;
  invitation_status: InvitationStatus;
  jd_id: string;
  jd_title: string;
  test_id: string;
  test_title: string;
  attempt_status: string;
  started_at: string | null;
  submitted_at: string | null;
  has_evaluation: boolean;
  total_score: number | null;
  max_score: number | null;
  percentage: number | null;
  ai_recommendation: AIRecommendation | null;
  admin_override_recommendation: AIRecommendation | null;
  // Populated only when attempt_status === "TERMINATED"
  integrity_violation_reason: string | null;
  terminated_at: string | null;
}

export interface CandidateAttemptsResponse {
  items: CandidateAttemptItem[];
}
