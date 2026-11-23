import { Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JdSubnav } from "@/components/jd/jd-subnav";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { jdTitle } from "@/lib/domain/jd";
import { examStatus } from "@/lib/domain/invitation";
import { formatRelative } from "@/lib/format";
import { loadErrorMessage, serverGet } from "@/server/api";
import type { ExamCandidate } from "@/types/invitation";
import type { JobDescription } from "@/types/jd";

export const metadata: Metadata = { title: "Exam candidates" };

export default async function ExamCandidatesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) notFound();
  const [jdRes, res] = await Promise.all([serverGet<JobDescription>(`/api/v1/jd/${id}`), serverGet<{ items: ExamCandidate[] }>(`/api/v1/exam-admin/jd/${id}/candidates`)]);
  if (!jdRes.ok) {
    if (jdRes.status === 404) notFound();
    return <ErrorState message={loadErrorMessage(jdRes.status)} />;
  }
  const title = jdTitle({ job_title: jdRes.data.extracted_data?.job_title ?? null, original_filename: jdRes.data.original_filename });
  const items = res.ok ? res.data.items : [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        crumbs={[
          { label: "Job descriptions", href: "/dashboard/jds" },
          { label: title, href: `/dashboard/jds/${id}` },
          { label: "Question bank", href: `/dashboard/jds/${id}/question-bank` },
          { label: "Exam candidates" },
        ]}
        title={title}
        description="Candidates taking the sectioned exam drawn from this role's question bank."
        className="pb-0"
      />
      <JdSubnav jdId={id} />
      {!res.ok ? (
        <ErrorState message={loadErrorMessage(res.status)} />
      ) : items.length === 0 ? (
        <div className="rounded-panel border border-line bg-surface">
          <EmptyState icon={Users} title="No exam candidates yet" description="Once the question bank is approved, candidates invited to this role are given a sectioned exam from it." />
        </div>
      ) : (
        <div className="overflow-hidden rounded-panel border border-line bg-surface">
          <Table aria-label="Exam candidates">
            <THead>
              <tr>
                <TH>Candidate</TH>
                <TH>Status</TH>
                <TH className="text-right">Score</TH>
                <TH className="text-right">AI-writing risk</TH>
                <TH>Submitted</TH>
              </tr>
            </THead>
            <tbody>
              {items.map((c) => {
                const st = examStatus(c.status);
                return (
                  <TR key={c.exam_attempt_id}>
                    <TD>
                      <Link href={`/dashboard/exam-results/${c.exam_attempt_id}`} className="font-medium text-ink hover:text-accent">
                        {c.candidate_name}
                      </Link>
                      <span className="block text-sm text-ink-muted">{c.candidate_email}</span>
                    </TD>
                    <TD>
                      <Badge tone={st.tone} dot>
                        {st.label}
                      </Badge>
                    </TD>
                    <TD className="text-right">{c.total_score != null ? `${c.total_score.toFixed(1)}%` : <span className="text-ink-muted">Not scored</span>}</TD>
                    <TD className="text-right">{c.ai_risk_score != null ? `${Math.round(c.ai_risk_score)} of 100` : <span className="text-ink-muted">Not checked</span>}</TD>
                    <TD className="text-ink-muted">{c.submitted_at ? formatRelative(c.submitted_at) : "Not submitted"}</TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        </div>
      )}
    </div>
  );
}
