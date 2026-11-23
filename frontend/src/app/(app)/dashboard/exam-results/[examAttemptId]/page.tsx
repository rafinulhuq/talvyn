import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RetryExamScoring } from "@/components/results/retry-exam";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { ScoreMeter } from "@/components/ui/score-meter";
import { examStatus } from "@/lib/domain/invitation";
import { loadErrorMessage, serverGet } from "@/server/api";
import type { ExamReport } from "@/types/evaluation";
import type { CandidateProfile } from "@/types/invitation";
import { SECTION_LABEL, SECTION_ORDER } from "@/types/attempt";

export const metadata: Metadata = { title: "Exam report" };
const RISK = { low: { label: "Low", tone: "success" }, medium: { label: "Medium", tone: "warning" }, high: { label: "High", tone: "danger" } } as const;

export default async function ExamReportPage({ params }: { params: Promise<{ examAttemptId: string }> }) {
  const { examAttemptId } = await params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(examAttemptId)) notFound();
  const res = await serverGet<ExamReport>(`/api/v1/exam-admin/attempts/${examAttemptId}/report`);
  if (!res.ok) {
    if (res.status === 404) notFound();
    return <ErrorState message={loadErrorMessage(res.status)} />;
  }
  const r = res.data;
  const who = await serverGet<CandidateProfile>(`/api/v1/candidates/${r.candidate_id}`);
  const name = who.ok ? who.data.name : "Exam report";
  const st = examStatus(r.status);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        crumbs={[
          { label: "Job descriptions", href: "/dashboard/jds" },
          { label: "Exam candidates", href: `/dashboard/jds/${r.jd_id}/question-bank/candidates` },
          { label: name },
        ]}
        title={name}
        description={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Badge tone={st.tone} dot>
              {st.label}
            </Badge>
            {who.ok && (
              <Link href={`/dashboard/candidates/${r.candidate_id}`} className="hover:text-ink">
                {who.data.email}
              </Link>
            )}
          </span>
        }
        actions={r.status === "FAILED" ? <RetryExamScoring examId={examAttemptId} /> : undefined}
      />

      {r.total_score == null ? (
        <Alert>{r.status === "FAILED" ? "Scoring failed. Try scoring again; the answers are safe." : "Not scored yet. Scores appear here once all three sections are submitted and scored."}</Alert>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <Panel title="Score">
            <div className="flex flex-col gap-6">
              <ScoreMeter value={r.total_score} label="Overall, weighted across sections" />
              <div className="grid gap-5 sm:grid-cols-2">
                {r.mcq_score != null && <ScoreMeter size="sm" value={r.mcq_score} label="Multiple choice" />}
                {r.cq_score != null && <ScoreMeter size="sm" value={r.cq_score} label="Written" />}
              </div>
              <div className="border-t border-line pt-5">
                <h3 className="text-sm font-medium text-ink">By section</h3>
                <div className="mt-3 flex flex-col gap-4">
                  {SECTION_ORDER.map((s) => {
                    const sec = r.section_scores[s];
                    if (!sec) return null;
                    return (
                      <div key={s}>
                        <ScoreMeter size="sm" value={sec.section_score} label={`${SECTION_LABEL[s]}, weight ${Math.round(sec.weight * 100)}%`} />
                        <p className="mt-1 text-sm text-ink-muted">
                          Multiple choice {sec.mcq_score} of {sec.mcq_max}, written {sec.cq_score} of {sec.cq_max}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </Panel>

          <Panel title="AI-writing risk">
            {r.ai_likeness_risk ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <Badge tone={RISK[r.ai_likeness_risk].tone} className="h-6 px-2 text-sm">
                    {RISK[r.ai_likeness_risk].label}
                  </Badge>
                  {r.ai_risk_score != null && <span className="text-base tabular-nums text-ink-muted">{Math.round(r.ai_risk_score)} of 100</span>}
                </div>
                {r.ai_risk_reasons.length > 0 && (
                  <ul className="flex flex-col gap-1.5">
                    {r.ai_risk_reasons.map((x) => (
                      <li key={x} className="flex gap-2 text-base text-ink-muted">
                        <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-ink-faint" />
                        {x}
                      </li>
                    ))}
                  </ul>
                )}
                {r.ai_risk_explanation && <p className="text-base text-ink">{r.ai_risk_explanation}</p>}
                <p className="text-sm text-ink-muted">{r.ai_risk_disclaimer}</p>
              </div>
            ) : (
              <p className="text-base text-ink-muted">Not assessed for this exam.</p>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}
