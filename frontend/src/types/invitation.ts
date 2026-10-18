/**
 * TypeScript types for Invitation and Candidate module.
 * Mirrors app/schemas/invitation.py
 */

// ─── Enums ────────────────────────────────────────────────────

export type InvitationStatus =
  | "PENDING"
  | "OPENED"
  | "COMPLETED"
  | "EXPIRED"
  | "REVOKED"
  | "TERMINATED";

// ─── Core types ───────────────────────────────────────────────

export interface Candidate {
  id: string;
  candidate_number: number;
  email: string;
  name: string;
  phone: string | null;
  created_at: string;
}

export interface Invitation {
  id: string;
  candidate_id: string;
  jd_id: string;
  invited_by: string;
  status: InvitationStatus;
  expires_at: string;
  email_sent_at: string | null;
  created_at: string;
  // Joined fields
  candidate_number: number | null;
  candidate_name: string | null;
  candidate_email: string | null;
  jd_title: string | null;
  // Populated for COMPLETED invitations only
  attempt_id: string | null;
  // Soft anti-cheat signal — never auto-enforced, admin review only.
  flagged_duplicate_device: boolean;
  flagged_duplicate_reason: string | null;
}

// ─── Request types ────────────────────────────────────────────

export interface CreateInvitationRequest {
  candidate_name: string;
  candidate_email: string;
  jd_id: string;
  test_id?: string;
}

// ─── Response types ───────────────────────────────────────────

export interface CreateInvitationResponse {
  invitation_id: string;
  candidate_id: string;
  candidate_email: string;
  status: InvitationStatus;
  expires_at: string;
  email_sent: boolean;
  message: string;
  /** Populated only when email_sent=false — share with the candidate manually. */
  magic_link?: string | null;
}

export interface InvitationListResponse {
  items: Invitation[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface ResendResponse {
  invitation_id: string;
  new_expires_at: string;
  email_sent: boolean;
  message: string;
  /** Populated only when email_sent=false — share with the candidate manually. */
  magic_link?: string | null;
}

// ─── Token validation (public) ────────────────────────────────

/**
 * Returned by GET /api/v1/invitations/validate/{token}
 * Intentionally minimal — no internal IDs exposed.
 */
export interface TokenValidationResponse {
  valid: boolean;
  candidate_name: string | null;
  jd_title: string | null;
  test_titles: string[];
  invitation_status: InvitationStatus | null;
  expires_at: string | null;
  next_test_index: number | null;
  total_tests: number;
  reason: "expired" | "already_used" | "not_found" | "revoked" | "terminated" | null;
}

// ─── Bulk invite ──────────────────────────────────────────────

export interface BulkInviteRow {
  candidate_email: string;
  candidate_name?: string;
}

export interface BulkInviteRequest {
  jd_id: string;
  test_id?: string;
  candidates: BulkInviteRow[];
}

export interface BulkInviteRowResult {
  email: string;
  name: string;
  status: "sent" | "skipped" | "failed";
  error?: string | null;
  invitation_id?: string | null;
  email_sent: boolean;
}

export interface BulkInviteResponse {
  total: number;
  sent: number;
  skipped: number;
  failed: number;
  results: BulkInviteRowResult[];
}

// ─── UI helpers ───────────────────────────────────────────────

export const STATUS_CONFIG: Record<
  InvitationStatus,
  {
    label: string;
    variant: "slate" | "blue" | "green" | "yellow" | "red";
    dot: boolean;
    description: string;
  }
> = {
  PENDING: {
    label: "Pending",
    variant: "slate",
    dot: true,
    description: "Link sent, not opened yet",
  },
  OPENED: {
    label: "Opened",
    variant: "blue",
    dot: true,
    description: "Candidate opened the link",
  },
  COMPLETED: {
    label: "Completed",
    variant: "green",
    dot: false,
    description: "Test submitted",
  },
  EXPIRED: {
    label: "Expired",
    variant: "yellow",
    dot: false,
    description: "Link expired before use",
  },
  REVOKED: {
    label: "Revoked",
    variant: "red",
    dot: false,
    description: "Manually revoked by admin",
  },
  TERMINATED: {
    label: "Terminated",
    variant: "red",
    dot: false,
    description: "Ended due to an integrity violation",
  },
};
