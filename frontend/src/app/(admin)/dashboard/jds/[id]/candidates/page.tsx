"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  UserPlus,
  Users,
  Loader2,
  X,
} from "lucide-react";
import { InvitationRow } from "@/components/admin/InvitationRow";
import { PublicLinkSection } from "@/components/admin/PublicLinkSection";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { EmptyState } from "@/components/ui/EmptyState";
import { invitationsApi } from "@/lib/api/invitations";
import type { InvitationListResponse, ResendResponse } from "@/types/invitation";
import { MagicLinkBanner } from "@/components/admin/MagicLinkBanner";

export default function CandidatesPage() {
  const params = useParams<{ id: string }>();
  const jdId = params.id;

  const [data, setData] = useState<InvitationListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // When resend succeeds but email fails, show the magic link for manual sharing
  const [pendingMagicLink, setPendingMagicLink] = useState<{ link: string; email: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await invitationsApi.listForJd(jdId);
      if (result.success) {
        setData(result.data);
      } else {
        setError("Failed to load invitations.");
      }
    } finally {
      setLoading(false);
    }
  }, [jdId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleResend(invitationId: string, candidateEmail: string) {
    setActionLoading(invitationId);
    setError(null);
    setPendingMagicLink(null);
    const result = await invitationsApi.resend(invitationId);
    setActionLoading(null);
    if (result.success) {
      await load();
      // If email delivery failed, surface the magic link in the UI
      const resend = result.data as ResendResponse;
      if (!resend.email_sent && resend.magic_link) {
        setPendingMagicLink({ link: resend.magic_link, email: candidateEmail });
      }
    } else {
      const code = result.error.code;
      let message = result.error.message ?? "Failed to resend.";
      if (code === "INVITATION_REVOKED") {
        message = "This invitation was revoked. Use 'Re-invite' to send a new invitation.";
      } else if (code === "INVITATION_COMPLETED") {
        message = "Cannot resend — the candidate already completed the assessment.";
      }
      setError(message);
    }
  }

  async function handleRevoke(invitationId: string, candidateName: string | null) {
    if (
      !confirm(
        `Revoke the invitation for ${candidateName ?? "this candidate"}? This cannot be undone.`
      )
    )
      return;

    setActionLoading(invitationId);
    setError(null);
    const result = await invitationsApi.revoke(invitationId);
    setActionLoading(null);
    if (result.success) {
      await load();
    } else {
      setError(result.error.message ?? "Failed to revoke.");
    }
  }

  return (
    <div className="w-full">
      <PageHeader
        title="Candidates"
        subtitle={data ? `${data.total} invitation${data.total !== 1 ? "s" : ""} sent` : undefined}
        breadcrumbs={
          <Breadcrumbs items={[{ label: "Job Description", href: `/dashboard/jds/${jdId}` }, { label: "Candidates" }]} />
        }
        actions={
          <Link href={`/dashboard/jds/${jdId}/invite`}>
            <Button leftIcon={<UserPlus className="h-4 w-4" />} size="sm">
              Invite Candidate
            </Button>
          </Link>
        }
        className="mb-6"
      />

      {/* Public assessment link */}
      <div className="mb-6">
        <PublicLinkSection jdId={jdId} />
      </div>

      {/* Error */}
      {error && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-3 rounded-xl border border-danger/20 bg-danger-light px-4 py-3"
        >
          <p className="flex-1 text-sm text-danger-dark">{error}</p>
          <button
            type="button"
            onClick={() => setError(null)}
            className="shrink-0 text-danger/60 hover:text-danger transition-colors"
            aria-label="Dismiss candidates error"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Magic link banner — shown when resend succeeded but email failed */}
      {pendingMagicLink && (
        <MagicLinkBanner
          link={pendingMagicLink.link}
          email={pendingMagicLink.email}
          onDismiss={() => setPendingMagicLink(null)}
        />
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-brand-400" />
        </div>
      )}

      {/* Empty state */}
      {!loading && data?.items.length === 0 && (
        <EmptyState
          icon={<Users className="h-6 w-6" />}
          title="No candidates invited yet"
          description="Send a magic link to a candidate to get started."
          action={
            <Link href={`/dashboard/jds/${jdId}/invite`}>
              <Button size="sm" leftIcon={<UserPlus className="h-3.5 w-3.5" />}>
                Invite your first candidate
              </Button>
            </Link>
          }
        />
      )}

      {/* Invitation table */}
      {!loading && data && data.items.length > 0 && (
        <div className="stagger flex flex-col gap-2 rounded-2xl bg-slate-100 p-2 dark:bg-slate-800/60">
          {data.items.map((inv) => (
            <InvitationRow
              key={inv.id}
              invitation={inv}
              jdId={jdId}
              isActing={actionLoading === inv.id}
              onResend={handleResend}
              onRevoke={handleRevoke}
            />
          ))}
        </div>
      )}

      {/* Pagination hint */}
      {data && data.total_pages > 1 && (
        <p className="mt-4 text-center text-xs text-slate-400">
          Showing page {data.page} of {data.total_pages} · {data.total} total
        </p>
      )}
    </div>
  );
}
