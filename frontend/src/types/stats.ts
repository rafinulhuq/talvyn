// Mirrors backend/app/api/v1/stats.py
export type DashboardStats = { jd_count: number; test_count: number; invitation_count: number; evaluation_count: number };
export type AttentionItem = { kind: string; severity: "info" | "warning" | "danger" | string; count: number; title: string; description: string; href: string };
export type PipelineStage = { key: string; label: string; count: number };
export type TimelinePoint = { date: string; invitations: number; started: number; submitted: number; evaluated: number };
/** completion_rate is a percentage, 0–100 (backend rounds to 1 decimal). */
export type RoleCompletion = { jd_id: string; title: string; invited_count: number; completed_count: number; completion_rate: number };
export type CompletionItem = {
  attempt_id: string;
  candidate_id: string;
  candidate_number: number;
  candidate_name: string;
  candidate_email: string;
  jd_id: string;
  jd_title: string;
  submitted_at: string;
  has_evaluation: boolean;
};
