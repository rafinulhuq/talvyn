/**
 * ExamReportView — admin report for one candidate's sectioned exam
 * (Master Prompt 2/3): section score breakdown + the hedged AI-risk
 * summary.
 *
 * The AI-risk ring deliberately uses the SAME indigo/amber/red color
 * language (not green-good/red-bad) as the legacy AI-likeness ring in
 * dashboard/results/[attemptId]/page.tsx, for the same reason: this must
 * never visually read as a second "score" or a verdict.
 */

"use client";

import { useState } from "react";
import { AlertCircle, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { examReportsApi } from "@/lib/api/examReports";
import {
  EXAM_STATUS_LABELS,
  SECTION_LABELS,
  SECTION_ORDER,
  type ExamAttemptReportResponse,
} from "@/types/exam";

interface ExamReportViewProps {
  initialReport: ExamAttemptReportResponse;
}

function AiRiskRing({ score }: { score: number }) {
  const radius = 36;
  const circ = 2 * Math.PI * radius;
  const dash = (score / 100) * circ;
  const color = score >= 66 ? "#dc2626" : score >= 33 ? "#d97706" : "#34f434";

  return (
    <div className="relative flex h-24 w-24 shrink-0 items-center justify-center">
      <svg className="-rotate-90" width="96" height="96">
        <circle cx="48" cy="48" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="8" />
        <circle
          cx="48" cy="48" r={radius} fill="none"
          stroke={color}
          strokeWidth="8"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-xl font-bold tabular-nums text-slate-800">{Math.round(score)}</span>
        <span className="text-[9px] text-slate-400">AI-risk /100</span>
      </div>
    </div>
  );
}

const RISK_BADGE: Record<string, "yellow" | "blue" | "green" | "red" | "slate"> = {
  low: "green",
  medium: "yellow",
  high: "red",
};

export function ExamReportView({ initialReport }: ExamReportViewProps) {
  const [report, setReport] = useState(initialReport);
  const [loadingExplanation, setLoadingExplanation] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDeepReview() {
    setLoadingExplanation(true);
    setError(null);
    try {
      const result = await examReportsApi.getReport(report.exam_attempt_id, true);
      if (!result.success) {
        setError(result.error.message);
        return;
      }
      setReport(result.data);
    } finally {
      setLoadingExplanation(false);
    }
  }

  async function handleRetry() {
    setRetrying(true);
    setError(null);
    try {
      const result = await examReportsApi.retryEvaluation(report.exam_attempt_id);
      if (!result.success) {
        setError(result.error.message);
        return;
      }
      setReport(result.data);
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* ── Status / retry ─────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-100 p-5 dark:bg-slate-800/60">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">Status</p>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            {EXAM_STATUS_LABELS[report.status] ?? report.status}
          </p>
        </div>
        {report.status === "FAILED" && (
          <Button size="sm" loading={retrying} onClick={handleRetry} leftIcon={<RefreshCw className="h-3.5 w-3.5" />}>
            Retry evaluation
          </Button>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-danger/20 bg-danger-light px-3 py-2.5">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          <p className="text-xs text-danger-dark">{error}</p>
        </div>
      )}

      {/* ── Overall + section scores ───────────────────────── */}
      {report.total_score !== null && (
        <div className="rounded-2xl bg-slate-100 p-5 dark:bg-slate-800/60">
          <div className="mb-4 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-slate-900 dark:text-slate-50">{report.total_score.toFixed(1)}%</span>
            <span className="text-sm text-slate-400 dark:text-slate-500">overall (weighted)</span>
          </div>
          {report.mcq_score !== null && report.cq_score !== null && (
            <div className="mb-4 flex gap-6 text-sm text-slate-600 dark:text-slate-400">
              <span>MCQ: <strong className="text-slate-800 dark:text-slate-200">{report.mcq_score.toFixed(1)}%</strong></span>
              <span>Written: <strong className="text-slate-800 dark:text-slate-200">{report.cq_score.toFixed(1)}%</strong></span>
            </div>
          )}

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-400 dark:border-slate-700 dark:text-slate-500">
                <th className="py-2">Section</th>
                <th className="py-2">MCQ</th>
                <th className="py-2">Written</th>
                <th className="py-2">Section score</th>
                <th className="py-2">Weight</th>
              </tr>
            </thead>
            <tbody>
              {SECTION_ORDER.map((section) => {
                const s = report.section_scores[section];
                return (
                  <tr key={section} className="border-b border-slate-200/70 last:border-0 dark:border-slate-700/70">
                    <td className="py-2.5 font-medium text-slate-700 dark:text-slate-300">{SECTION_LABELS[section]}</td>
                    <td className="py-2.5 text-slate-600 dark:text-slate-400">{s ? `${s.mcq_pct.toFixed(0)}%` : "—"}</td>
                    <td className="py-2.5 text-slate-600 dark:text-slate-400">{s ? `${s.cq_pct.toFixed(0)}%` : "—"}</td>
                    <td className="py-2.5 font-medium text-slate-800 dark:text-slate-200">{s ? `${s.section_score.toFixed(1)}%` : "—"}</td>
                    <td className="py-2.5 text-slate-500 dark:text-slate-400">{s ? `${(s.weight * 100).toFixed(0)}%` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── AI-risk card ───────────────────────────────────── */}
      {report.ai_risk_score !== null && (
        <div className="rounded-2xl bg-slate-100 p-5 dark:bg-slate-800/60">
          <div className="mb-4 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-slate-700 dark:text-slate-300" />
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">AI-Likeness Risk</p>
            {report.ai_likeness_risk && (
              <Badge variant={RISK_BADGE[report.ai_likeness_risk]}>{report.ai_likeness_risk}</Badge>
            )}
          </div>

          <div className="flex flex-col items-start gap-4 sm:flex-row sm:gap-6">
            <AiRiskRing score={report.ai_risk_score} />
            <div className="flex-1">
              <p className="text-sm text-slate-700 leading-relaxed dark:text-slate-300">{report.ai_risk_disclaimer}</p>

              {report.ai_risk_reasons.length > 0 && (
                <ul className="mt-3 flex flex-col gap-1.5">
                  {report.ai_risk_reasons.map((reason) => (
                    <li key={reason} className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400">
                      <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-slate-400" />
                      {reason}
                    </li>
                  ))}
                </ul>
              )}

              {report.ai_risk_explanation ? (
                <div className="mt-3 rounded-lg bg-white p-3 dark:bg-slate-900">
                  <p className="text-xs font-semibold text-slate-700 mb-1 dark:text-slate-300">Deep-review explanation</p>
                  <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">{report.ai_risk_explanation}</p>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-3"
                  loading={loadingExplanation}
                  onClick={handleDeepReview}
                  leftIcon={loadingExplanation ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                >
                  Request deep-review explanation
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
