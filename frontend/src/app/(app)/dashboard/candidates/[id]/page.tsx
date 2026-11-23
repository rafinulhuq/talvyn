import { ExternalLink, FileText, Link2, Mail, Phone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { DeleteCandidate } from "@/components/candidates/candidate-actions";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { RECOMMENDATION, attemptStatus } from "@/lib/domain/invitation";
import { formatDate, formatRelative } from "@/lib/format";
import { loadErrorMessage, serverGet } from "@/server/api";
import type { CandidateAttempt, CandidateProfile } from "@/types/invitation";

type Props = { params: Promise<{ id: string }> };
const SAFE = /^[A-Za-z0-9_-]{1,128}$/;
const getProfile = cache((id: string) => serverGet<CandidateProfile>(`/api/v1/candidates/${id}`));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const res = SAFE.test(id) ? await getProfile(id) : null;
  return { title: res?.ok ? res.data.name : "Candidate" };
}

/** Only http(s) links are rendered as links; anything else is shown as text. */
const safeHref = (u: string | null) => (u && /^https?:\/\//i.test(u) ? u : null);

export default async function CandidatePage({ params }: Props) {
  const { id } = await params;
  if (!SAFE.test(id)) notFound();
  const [res, attemptsRes] = await Promise.all([getProfile(id), serverGet<{ items: CandidateAttempt[] }>(`/api/v1/candidates/${id}/attempts`)]);
  if (!res.ok) {
    if (res.status === 404) notFound();
    return <ErrorState message={loadErrorMessage(res.status)} />;
  }
  const c = res.data;
  const attempts = attemptsRes.ok ? attemptsRes.data.items : [];
  const linkedin = safeHref(c.linkedin_url);
  const resume = safeHref(c.resume_url);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        crumbs={[{ label: "Candidates", href: "/dashboard/candidates" }, { label: c.name }]}
        title={c.name}
        description={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>#{c.candidate_number}</span>
            <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1.5 hover:text-ink">
              <Mail aria-hidden className="size-3.5" /> {c.email}
            </a>
            {c.phone && (
              <span className="inline-flex items-center gap-1.5">
                <Phone aria-hidden className="size-3.5" /> {c.phone}
              </span>
            )}
            {linkedin && (
              <a href={linkedin} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 hover:text-ink">
                <Link2 aria-hidden className="size-3.5" /> LinkedIn
              </a>
            )}
            {resume && (
              <a href={resume} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 hover:text-ink">
                <FileText aria-hidden className="size-3.5" /> Résumé <ExternalLink aria-hidden className="size-3" />
              </a>
            )}
            <span>Added {formatDate(c.created_at)}</span>
          </span>
        }
        actions={<DeleteCandidate id={c.id} name={c.name} />}
        className="pb-0"
      />

      <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-panel border border-line bg-line">
        {[
          { label: "Invitations", n: c.total_invitations },
          { label: "Tests started", n: c.total_attempts },
          { label: "Tests finished", n: c.completed_attempts },
        ].map((s) => (
          <div key={s.label} className="bg-surface px-5 py-4">
            <dt className="text-sm text-ink-muted">{s.label}</dt>
            <dd className="mt-1 text-xl text-ink">{s.n}</dd>
          </div>
        ))}
      </dl>

      <Panel title="Test history" description="Every test this person has started, newest first." bodyClassName="p-0">
        {!attemptsRes.ok ? (
          <p role="alert" className="p-5 text-base text-ink-muted">The test history didn&apos;t load. Refresh to try again; if it keeps failing, the Talvyn service may need attention.</p>
        ) : attempts.length === 0 ? (
          <EmptyState title="No tests started yet" description="Their invitation may still be waiting to be opened." />
        ) : (
          <Table aria-label="Test history">
            <THead>
              <tr>
                <TH>Test</TH>
                <TH>Status</TH>
                <TH className="text-right">Score</TH>
                <TH>Recommendation</TH>
                <TH>Submitted</TH>
              </tr>
            </THead>
            <tbody>
              {attempts.map((a) => {
                const st = attemptStatus(a.attempt_status);
                const rec = a.admin_override_recommendation ?? a.ai_recommendation;
                return (
                  <TR key={a.attempt_id}>
                    <TD>
                      <Link href={`/dashboard/results/${a.attempt_id}`} className="font-medium text-ink hover:text-accent">
                        {a.test_title}
                      </Link>
                      <span className="block text-sm text-ink-muted">
                        <Link href={`/dashboard/jds/${a.jd_id}`} className="hover:text-ink">
                          {a.jd_title}
                        </Link>
                      </span>
                    </TD>
                    <TD>
                      <Badge tone={st.tone} dot>
                        {st.label}
                      </Badge>
                      {a.integrity_violation_reason && <span className="mt-1 block max-w-56 text-sm text-danger">{a.integrity_violation_reason}</span>}
                    </TD>
                    <TD className="text-right">
                      {a.percentage != null ? (
                        <>
                          <span className="text-ink">{Math.round(a.percentage)}%</span>
                          {a.total_score != null && a.max_score != null && (
                            <span className="block text-sm text-ink-muted">
                              {a.total_score} of {a.max_score}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-ink-muted">Not scored</span>
                      )}
                    </TD>
                    <TD>
                      {rec ? (
                        <span className="inline-flex items-center gap-2">
                          <Badge tone={RECOMMENDATION[rec].tone}>{RECOMMENDATION[rec].label}</Badge>
                          {a.admin_override_recommendation && <span className="text-sm text-ink-muted">Set by reviewer</span>}
                        </span>
                      ) : (
                        <span className="text-ink-muted">None yet</span>
                      )}
                    </TD>
                    <TD className="text-ink-muted">{a.submitted_at ? formatRelative(a.submitted_at) : "Not submitted"}</TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        )}
      </Panel>
    </div>
  );
}
