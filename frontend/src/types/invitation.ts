// Mirrors backend/app/schemas/invitation.py, public_link.py, candidate.py and exam_reports.py.
export type InvitationStatus = "PENDING" | "OPENED" | "COMPLETED" | "EXPIRED" | "REVOKED" | "TERMINATED";
export type Recommendation = "STRONG_HIRE" | "HIRE" | "MAYBE" | "NO_HIRE";

export type Invitation = {
  id: string;
  candidate_id: string;
  jd_id: string;
  invited_by: string;
  status: InvitationStatus;
  expires_at: string;
  email_sent_at: string | null;
  created_at: string;
  candidate_number: number | null;
  candidate_name: string | null;
  candidate_email: string | null;
  jd_title?: string | null;
  attempt_id: string | null;
  flagged_duplicate_device: boolean;
  flagged_duplicate_reason: string | null;
};

export type InvitationPage = { items: Invitation[]; total: number; page: number; page_size: number; total_pages?: number };

export type CreateInvitationResult = {
  invitation_id: string;
  candidate_id: string;
  candidate_email: string;
  status: InvitationStatus;
  expires_at: string;
  email_sent: boolean;
  message: string;
  /** Only returned when the email could not be sent, so the link can be shared by hand. */
  magic_link: string | null;
};

export type ResendResult = { invitation_id: string; new_expires_at: string; email_sent: boolean; message: string; magic_link: string | null };

export type BulkRowResult = { email: string; name: string; status: "sent" | "skipped" | "failed" | string; error: string | null; invitation_id: string | null; email_sent: boolean };
export type BulkInviteResult = { total: number; sent: number; skipped: number; failed: number; results: BulkRowResult[] };

export type PublicLink = {
  id: string;
  jd_id: string;
  public_slug: string;
  title: string | null;
  status: "ACTIVE" | "DISABLED" | "EXPIRED";
  expires_at: string | null;
  max_registrations: number | null;
  view_count: number;
  registration_count: number;
  created_at: string;
  public_url: string;
};

export type PublicLinkAnalytics = {
  link_id: string;
  views: number;
  registrations: number;
  starts: number;
  completions: number;
  evaluated_attempts: number;
  recommendation_breakdown: Record<string, number>;
  /** 0–1 fraction of evaluated attempts recommended HIRE or STRONG_HIRE. */
  pass_rate: number | null;
};

export type CandidateListItem = {
  id: string;
  candidate_number: number;
  name: string;
  email: string;
  phone: string | null;
  created_at: string;
  total_attempts: number;
  completed_attempts: number;
  last_activity_at: string | null;
};

export type CandidateProfile = {
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
};

export type CandidateAttempt = {
  attempt_id: string;
  invitation_id: string;
  invitation_status: InvitationStatus;
  jd_id: string;
  jd_title: string;
  test_id: string;
  test_title: string;
  attempt_status: "NOT_STARTED" | "IN_PROGRESS" | "SUBMITTED" | "EVALUATED" | "TERMINATED" | string;
  started_at: string | null;
  submitted_at: string | null;
  has_evaluation: boolean;
  total_score: number | null;
  max_score: number | null;
  percentage: number | null;
  ai_recommendation: Recommendation | null;
  admin_override_recommendation: Recommendation | null;
  integrity_violation_reason: string | null;
  terminated_at: string | null;
};

export type ExamCandidate = {
  exam_attempt_id: string;
  candidate_id: string;
  candidate_name: string;
  candidate_email: string;
  status: string;
  total_score: number | null;
  ai_risk_score: number | null;
  assigned_at: string | null;
  submitted_at: string | null;
};
