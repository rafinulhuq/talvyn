import { ShieldX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DecisionPanel, RecommendationBadge } from "@/components/results/decision-panel";
import { QuestionReview } from "@/components/results/question-review";
import { ReportActions, ScoreNow } from "@/components/results/report-actions";
import { Alert } from "@/components/ui/alert";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { ScoreMeter } from "@/components/ui/score-meter";
import { BANDS, levelLabel, skillScores } from "@/lib/domain/evaluation";
import { formatDateTime } from "@/lib/format";
import { loadErrorMessage, serverGet } from "@/server/api";
import type { Evaluation } from "@/types/evaluation";
import type { CandidateAttempt, CandidateProfile } from "@/types/invitation";

export const metadata: Metadata = { title: "Test report" };
const SAFE = /^[A-Za-z0-9_-]{1,128}$/;

type Ctx = { name: string; email: string; candidateId: string; attempt: CandidateAttempt | null };

/** Candidate and test context, when the link carries the candidate id (?c=). The evaluation itself doesn't include it. */
async function context(attemptId: string, c: unknown): Promise<Ctx | null> {
  if (typeof c !== "string" || !SAFE.test(c)) return null;
  const [p, a] = await Promise.all([serverGet<CandidateProfile>(`/api/v1/candidates/${c}`), serverGet<{ items: CandidateAttempt[] }>(`/api/v1/candidates/${c}/attempts`)]);
  if (!p.ok) return null;
  return { name: p.data.name, email: p.data.email, candidateId: c, attempt: a.ok ? (a.data.items.find((x) => x.attempt_id === attemptId) ?? null) : null };
}

export default async function ReportPage({ params, searchParams }: { params: Promise<{ attemptId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { attemptId } = await params;
  if (!SAFE.test(attemptId)) notFound();
  const [res, ctx] = await Promise.all([serverGet<Evaluation>(`/api/v1/evaluation/${attemptId}`), context(attemptId, (await searchParams).c)]);

  const title = ctx?.name ?? "Test report";
  const crumbs = [{ label: "Results", href: "/dashboard/results" }, { label: title }];
  const sub = ctx?.attempt ? (
    <span className="flex flex-wrap gap-x-4 gap-y-1">
      <span>{ctx.attempt.test_title}</span>
      <Link href={`/dashboard/jds/${ctx.attempt.jd_id}`} className="hover:text-ink">
        {ctx.attempt.jd_title}
      </Link>
      <Link href={`/dashboard/candidates/${ctx.candidateId}`} className="hover:text-ink">
        {ctx.email}
      </Link>
    </span>
  ) : undefined;

  if (!res.ok) {
    if (res.status === 409) {
      return (
        <div className="flex flex-col gap-6">
          <PageHeader crumbs={crumbs} title={title} description={sub} />
          <Panel>
            <div className="flex items-start gap-4">
              <span className="grid size-9 shrink-0 place-items-center rounded-panel border border-danger/30 bg-danger-soft text-danger">
                <ShieldX aria-hidden className="size-4.5" />
              </span>
              <div>
                <h2 className="text-md font-medium text-ink">Ended for an integrity violation</h2>
                <p className="mt-1 max-w-xl text-base text-ink-muted">
                  The candidate left the test window, so the test ended and was never submitted. There&apos;s nothing to score.
                  {ctx?.attempt?.integrity_violation_reason ? ` Recorded reason: ${ctx.attempt.integrity_violation_reason.replaceAll("_", " ").toLowerCase()}.` : ""}
                </p>
              </div>
            </div>
          </Panel>
        </div>
      );
    }
    if (res.status === 404) {
      return (
        <div className="flex flex-col gap-6">
          <PageHeader crumbs={crumbs} title={title} description={sub} />
          <Panel title="Not scored yet" description="The candidate submitted this test. Score it to see the full report.">
            <ScoreNow attemptId={attemptId} />
          </Panel>
        </div>
      );
    }
    return <ErrorState message={loadErrorMessage(res.status)} />;
  }

  const e = res.data;
  const rec = e.admin_override_recommendation ?? e.ai_recommendation;
  const skills = skillScores(e.skill_breakdown);
  const level = levelLabel(e.evaluation_level);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader crumbs={crumbs} title={title} description={sub} actions={<ReportActions attemptId={attemptId} />} className="pb-0" />
      <p className="-mt-3 text-sm text-ink-muted">Scored {formatDateTime(e.evaluated_at)}</p>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-6">
          <Panel title="Score">
            <div className="flex flex-col gap-6">
              <ScoreMeter value={e.percentage} label={`Overall, ${e.total_score} of ${e.max_score} marks`} />
              <div className="grid gap-5 sm:grid-cols-2">
                {e.mcq_max > 0 && <ScoreMeter size="sm" value={(e.mcq_score / e.mcq_max) * 100} label={`Multiple choice, ${e.mcq_score} of ${e.mcq_max}`} />}
                {e.open_ended_max > 0 && <ScoreMeter size="sm" value={(e.open_ended_score / e.open_ended_max) * 100} label={`Written and code, ${e.open_ended_score} of ${e.open_ended_max}`} />}
              </div>
            </div>
          </Panel>

          {e.ai_summary && (
            <Panel title="Summary" description="Written by the AI from the scored answers.">
              <p className="max-w-[72ch] text-md text-ink">{e.ai_summary}</p>
              {(level || e.suitable_role) && (
                <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                  {level && (
                    <div>
                      <dt className="text-sm text-ink-muted">Level shown</dt>
                      <dd className="text-base text-ink">{level}</dd>
                    </div>
                  )}
                  {e.suitable_role && (
                    <div>
                      <dt className="text-sm text-ink-muted">Best-fit role</dt>
                      <dd className="text-base text-ink">{e.suitable_role}</dd>
                    </div>
                  )}
                </dl>
              )}
            </Panel>
          )}

          {(e.ai_strengths.length > 0 || e.ai_weaknesses.length > 0) && (
            <div className="grid gap-6 sm:grid-cols-2">
              <List title="Strengths" items={e.ai_strengths} dot="bg-success" />
              <List title="Gaps" items={e.ai_weaknesses} dot="bg-danger" />
            </div>
          )}

          {skills.length > 0 && (
            <Panel title="By skill" description="Average score on the questions for each skill.">
              <div className="grid gap-5 sm:grid-cols-2">
                {skills.map((s) => (
                  <ScoreMeter key={s.skill} size="sm" value={s.score} label={s.skill} />
                ))}
              </div>
            </Panel>
          )}

          {e.improvement_suggestions.length > 0 && <List title="Suggestions for the candidate" items={e.improvement_suggestions} dot="bg-ink-faint" />}

          <section aria-labelledby="qs" className="flex flex-col gap-3">
            <h2 id="qs" className="text-md font-medium text-ink">
              Answers
            </h2>
            {e.question_feedback.map((fb, i) => (
              <QuestionReview key={fb.id} attemptId={attemptId} fb={fb} number={i + 1} />
            ))}
          </section>
        </div>

        <aside className="flex flex-col gap-6 lg:sticky lg:top-20">
          <Panel title="Recommendation">
            <div className="flex flex-col gap-4">
              <RecommendationBadge rec={rec} by={e.admin_override_recommendation ? "reviewer" : "ai"} />
              {e.admin_override_recommendation && <p className="text-sm text-ink-muted">The AI suggested {BANDS.find((b) => b.rec === e.ai_recommendation)?.label.toLowerCase()}.</p>}
              {e.admin_notes && <p className="whitespace-pre-wrap rounded-control bg-sunken p-3 text-base text-ink">{e.admin_notes}</p>}
              <p className="text-sm text-ink-muted">
                The AI&apos;s suggestion follows the score: strong hire from 80%, hire from 65%, maybe from 45%. It can be more cautious than the score, never less.
                {" "}A person makes the final call.
              </p>
              <DecisionPanel attemptId={attemptId} ai={e.ai_recommendation} override={e.admin_override_recommendation} notes={e.admin_notes} />
            </div>
          </Panel>

          {e.overall_ai_likeness_percentage != null && (
            <Panel title="AI-written estimate">
              <p className="text-2xl text-ink tabular-nums">{Math.round(e.overall_ai_likeness_percentage)}%</p>
              <p className="mt-1 text-sm text-ink-muted">
                Across the written answers{e.overall_ai_detection_confidence ? `, ${e.overall_ai_detection_confidence.toLowerCase()} confidence` : ""}.
                {e.flagged_answer_count > 0 ? ` ${e.flagged_answer_count} ${e.flagged_answer_count === 1 ? "answer was" : "answers were"} flagged.` : ""}
              </p>
              <Alert className="mt-3">An estimate to prompt a conversation, not proof. Don&apos;t reject a candidate on this alone.</Alert>
            </Panel>
          )}
        </aside>
      </div>
    </div>
  );
}

function List({ title, items, dot }: { title: string; items: string[]; dot: string }) {
  if (!items.length) return null;
  return (
    <Panel title={title}>
      <ul className="flex flex-col gap-2">
        {items.map((s) => (
          <li key={s} className="flex gap-2.5 text-base text-ink">
            <span aria-hidden className={`mt-2 size-1.5 shrink-0 rounded-full ${dot}`} />
            {s}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
