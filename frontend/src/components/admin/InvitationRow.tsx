"use client";

import Link from "next/link";
import {
  UserPlus,
  RefreshCw,
  Ban,
  MailCheck,
  MailX,
  Clock,
  Loader2,
  BarChart2,
} from "lucide-react";
import { InvitationStatusBadge } from "@/components/admin/InvitationStatusBadge";
import { formatRelativeDate, formatExpiry } from "@/lib/utils/invitationDates";
import type { Invitation } from "@/types/invitation";

const canResend = (inv: Invitation) =>
  inv.status === "PENDING" ||
  inv.status === "OPENED" ||
  inv.status === "EXPIRED";

const canRevoke = (inv: Invitation) =>
  inv.status === "PENDING" || inv.status === "OPENED";

// REVOKED invitations can receive a brand-new invitation (REVOKED is not in
// active_statuses, so _find_active_invitation won't block a new one)
const canReInvite = (inv: Invitation) => inv.status === "REVOKED";

type InvitationRowProps = {
  invitation: Invitation;
  jdId: string;
  isActing: boolean;
  onResend: (invitationId: string, candidateEmail: string) => void;
  onRevoke: (invitationId: string, candidateName: string | null) => void;
};

function EmailStatusIndicator({ inv }: { inv: Invitation }) {
  const label = inv.email_sent_at
    ? `Email sent ${new Date(inv.email_sent_at).toLocaleString()}`
    : "Email not sent";
  return inv.email_sent_at ? (
    <span role="img" aria-label={label} className="text-success">
      <MailCheck aria-hidden="true" className="h-4 w-4" />
    </span>
  ) : (
    <span role="img" aria-label={label} className="text-slate-300">
      <MailX aria-hidden="true" className="h-4 w-4" />
    </span>
  );
}

function InvitationTiming({ inv }: { inv: Invitation }) {
  return (
    <div className="hidden lg:flex shrink-0 flex-col items-end gap-0.5">
      <span className="text-xs text-slate-400">
        {formatRelativeDate(inv.created_at)}
      </span>
      {inv.status === "PENDING" || inv.status === "OPENED" ? (
        <span className="flex items-center gap-1 text-[10px] text-slate-400">
          <Clock className="h-3 w-3" />
          {formatExpiry(inv.expires_at)}
        </span>
      ) : null}
    </div>
  );
}

function InvitationActions({
  inv,
  jdId,
  isActing,
  candidateLabel,
  onResend,
  onRevoke,
}: {
  inv: Invitation;
  jdId: string;
  isActing: boolean;
  candidateLabel: string;
  onResend: (invitationId: string, candidateEmail: string) => void;
  onRevoke: (invitationId: string, candidateName: string | null) => void;
}) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      {canResend(inv) && (
        <button
          type="button"
          onClick={() => onResend(inv.id, inv.candidate_email ?? "")}
          disabled={isActing}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-800 disabled:opacity-50 transition-colors"
          aria-label={`Resend invitation to ${candidateLabel} with a fresh link`}
        >
          {isActing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
        </button>
      )}
      {canRevoke(inv) && (
        <button
          type="button"
          onClick={() => onRevoke(inv.id, inv.candidate_name)}
          disabled={isActing}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-danger-light hover:text-danger disabled:opacity-50 transition-colors"
          aria-label={`Revoke invitation for ${candidateLabel}`}
        >
          <Ban className="h-4 w-4" />
        </button>
      )}
      {canReInvite(inv) && (
        <Link
          href={`/dashboard/jds/${jdId}/invite`}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-brand-50 hover:text-brand-800 transition-colors"
          aria-label={`Send a new invitation to ${candidateLabel}`}
        >
          <UserPlus className="h-4 w-4" />
        </Link>
      )}
      {inv.status === "COMPLETED" && inv.attempt_id && (
        <Link
          href={`/dashboard/results/${inv.attempt_id}`}
          className="rounded-lg p-1.5 text-success hover:bg-green-50 transition-colors"
          aria-label={`View results for ${candidateLabel}`}
        >
          <BarChart2 className="h-4 w-4" />
        </Link>
      )}
      {inv.status === "COMPLETED" && !inv.attempt_id && (
        <span
          role="img"
          aria-label={`Assessment completed for ${candidateLabel}`}
          className="rounded-lg p-1.5 text-success"
        >
          <BarChart2 aria-hidden="true" className="h-4 w-4" />
        </span>
      )}
    </div>
  );
}

export function InvitationRow({ invitation: inv, jdId, isActing, onResend, onRevoke }: InvitationRowProps) {
  const candidateLabel = inv.candidate_name ?? inv.candidate_email ?? "this candidate";

  return (
    <div className="flex items-center gap-4 rounded-xl bg-white px-5 py-4 dark:bg-slate-900">
      {/* Avatar */}
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
        {(inv.candidate_name ?? "?").charAt(0).toUpperCase()}
      </div>

      {/* Candidate info */}
      <div className="flex-1 min-w-0">
        <Link
          href={`/dashboard/candidates/${inv.candidate_id}`}
          className="block truncate text-sm font-medium text-slate-900 transition-colors hover:text-brand-800 dark:text-slate-50"
          aria-label={`Open profile for ${candidateLabel}`}
        >
          {inv.candidate_name ?? "Unknown"}
        </Link>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
          {inv.candidate_number && (
            <span className="font-medium text-slate-600">
              Candidate #{inv.candidate_number}
            </span>
          )}
          <span className="truncate">{inv.candidate_email}</span>
        </div>
      </div>

      {/* Status */}
      <div className="hidden sm:block shrink-0">
        <InvitationStatusBadge
          status={inv.status}
          flaggedDuplicateDevice={inv.flagged_duplicate_device}
          flaggedDuplicateReason={inv.flagged_duplicate_reason}
        />
      </div>

      {/* Email sent indicator */}
      <div className="hidden md:block shrink-0">
        <EmailStatusIndicator inv={inv} />
      </div>

      {/* Timing */}
      <InvitationTiming inv={inv} />

      {/* Actions */}
      <InvitationActions
        inv={inv}
        jdId={jdId}
        isActing={isActing}
        candidateLabel={candidateLabel}
        onResend={onResend}
        onRevoke={onRevoke}
      />
    </div>
  );
}
