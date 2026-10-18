"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { evaluationApi, triggerAndPollEvaluation } from "@/lib/api/evaluation";
import type { Evaluation } from "@/types/evaluation";
import { AILikenessCard } from "@/components/admin/results/AILikenessCard";
import { AdminDecisionPanel } from "@/components/admin/results/AdminDecisionPanel";
import { QuestionFeedbackCard } from "@/components/admin/results/QuestionFeedbackCard";
import {
  EvaluationLoadingState,
  EvaluationTerminatedState,
  EvaluationPendingState,
  EvaluationLoadErrorState,
} from "@/components/admin/results/EvaluationStatusScreens";
import { StrengthsWeaknesses } from "@/components/admin/results/StrengthsWeaknesses";
import { ImprovementSuggestionsList } from "@/components/admin/results/ImprovementSuggestionsList";
import {
  EvaluationLevelBadge,
  HiringThresholdLegend,
  RecommendationBanner,
  SuitableRoleCard,
} from "@/components/admin/results/RecommendationSummary";
import { ReportActions } from "@/components/admin/results/ReportActions";
import { ScoreOverview } from "@/components/admin/results/ScoreOverview";
import { SkillBreakdown } from "@/components/admin/results/SkillBreakdown";

// ── Main page ──────────────────────────────────────────────────

function handlePrint() {
  window.print();
}

export default function ResultPage() {
  const params = useParams<{ attemptId: string }>();
  const attemptId = params.attemptId;

  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await evaluationApi.get(attemptId);
      if (result.success) {
        setEvaluation(result.data);
      } else {
        const status = result.statusCode;
        const code = result.error.code;
        if (code === "ATTEMPT_TERMINATED") {
          setError("terminated");
        } else if (status === 404) {
          setError("not_found");
        } else {
          setError(result.error.message ?? "Failed to load evaluation.");
        }
      }
    } finally {
      setLoading(false);
    }
  }, [attemptId]);

  useEffect(() => { load(); }, [load]);

  async function handleTrigger() {
    setTriggering(true);
    setError(null);
    const result = await triggerAndPollEvaluation(attemptId);
    setTriggering(false);
    if (result.success && result.data) {
      setEvaluation(result.data);
    } else {
      setError(result.message ?? "Evaluation failed.");
    }
  }

  async function handleExportDocx() {
    // Route through the authenticated Next.js proxy (/api/proxy/...)
    const proxyUrl = `/api/proxy/api/v1/evaluation/${attemptId}/export`;
    const res = await fetch(proxyUrl);
    if (!res.ok) return;
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = `evaluation_${attemptId.slice(0, 8)}.docx`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }

  if (loading) {
    return <EvaluationLoadingState />;
  }

  if (error === "terminated") {
    return <EvaluationTerminatedState />;
  }

  if (error === "not_found" || triggering) {
    return (
      <EvaluationPendingState
        triggering={triggering}
        error={error}
        onTrigger={handleTrigger}
      />
    );
  }

  if (!evaluation) {
    return <EvaluationLoadErrorState error={error} onRetry={load} />;
  }

  return (
    <div className="w-full">
      <PageHeader
        title="Evaluation Report"
        subtitle={`Evaluated ${new Date(evaluation.evaluated_at).toLocaleString()}`}
        breadcrumbs={
          <Breadcrumbs
            items={[{ label: "Results", href: "/dashboard/results" }, { label: "Evaluation" }]}
            className="print:hidden"
          />
        }
        actions={
          <ReportActions
            triggering={triggering}
            onPrint={handlePrint}
            onExportDocx={handleExportDocx}
            onReevaluate={handleTrigger}
          />
        }
      />

      <div className="flex flex-col gap-5">
        {/* Recommendation banner */}
        <RecommendationBanner
          aiRec={evaluation.ai_recommendation}
          overrideRec={evaluation.admin_override_recommendation}
          isPreliminary={evaluation.is_preliminary}
        />

        {/* Hiring threshold legend */}
        <HiringThresholdLegend />

        {/* Evaluation level + pass/fail */}
        <div className="flex flex-wrap gap-3">
          {evaluation.evaluation_level && (
            <div className="flex-1 min-w-0 sm:min-w-52">
              <EvaluationLevelBadge level={evaluation.evaluation_level} />
            </div>
          )}
          {evaluation.suitable_role && (
            <SuitableRoleCard suitableRole={evaluation.suitable_role} />
          )}
        </div>

        {/* Score overview */}
        <ScoreOverview evaluation={evaluation} />

        {/* AI Summary */}
        {evaluation.ai_summary && (
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-900 dark:text-white">AI Evaluation Summary</p>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed italic">&ldquo;{evaluation.ai_summary}&rdquo;</p>
          </div>
        )}

        {/* AI-likeness estimate (opt-in, probabilistic) */}
        <AILikenessCard evaluation={evaluation} />

        {/* Strengths + Weaknesses */}
        <StrengthsWeaknesses
          strengths={evaluation.ai_strengths}
          weaknesses={evaluation.ai_weaknesses}
        />

        {/* Skill breakdown */}
        {Object.keys(evaluation.skill_breakdown ?? {}).length > 0 && (
          <SkillBreakdown breakdown={evaluation.skill_breakdown} />
        )}

        {/* Improvement suggestions */}
        <ImprovementSuggestionsList suggestions={evaluation.improvement_suggestions ?? []} />

        {/* Admin override — hidden when printing */}
        <div className="print:hidden">
          <AdminDecisionPanel
            evaluation={evaluation}
            onUpdate={setEvaluation}
          />
        </div>

        {/* Per-question feedback */}
        {evaluation.question_feedback.length > 0 && (
          <div>
            <p className="text-sm font-bold tracking-tight text-slate-900 dark:text-white mb-3 font-display">
              Question-by-Question Breakdown
            </p>
            <div className="flex flex-col gap-2.5">
              {evaluation.question_feedback.map((fb, i) => (
                <QuestionFeedbackCard
                  key={fb.id}
                  feedback={fb}
                  index={i}
                  attemptId={attemptId}
                  onUpdate={setEvaluation}
                />
              ))}
            </div>
          </div>
        )}

        {/* Admin notes display */}
        {evaluation.admin_notes && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-xs dark:border-slate-800 dark:bg-slate-850">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-900 dark:text-white">Admin Notes</p>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {evaluation.admin_notes}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
