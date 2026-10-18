"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  FileText,
  Users,
  TrendingUp,
  TrendingDown,
  Award,
  CheckCircle,
  BarChart2,
  Loader2,
  Star,
  Lightbulb,
  Download,
} from "lucide-react";
import { clsx } from "clsx";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { EmptyState } from "@/components/ui/EmptyState";
import { evaluationApi } from "@/lib/api/evaluation";
import type { SystemReport, AIRecommendation, EvaluationLevel } from "@/types/evaluation";
import {
  EVALUATION_LEVEL_CONFIG,
  RECOMMENDATION_CONFIG,
  getScoreColor,
} from "@/types/evaluation";

const recOrder: AIRecommendation[] = ["STRONG_HIRE", "HIRE", "MAYBE", "NO_HIRE"];
const levelOrder: EvaluationLevel[] = ["EXPERT", "ADVANCED", "INTERMEDIATE", "BEGINNER"];

export default function SystemReportPage() {
  const params = useParams<{ jdId: string }>();
  const jdId = params.jdId;
  const [report, setReport] = useState<SystemReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    evaluationApi.getSystemReport(jdId).then((r) => {
      setLoading(false);
      if (r.success) setReport(r.data);
    });
  }, [jdId]);

  async function handleDownload() {
    setDownloading(true);
    setDownloadError(null);
    try {
      const res = await evaluationApi.exportSystemReport(jdId);
      if (!res.success) {
        setDownloadError("Could not generate the report. Please try again.");
        return;
      }
      const blob = res.data;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const slug = (report?.job_title ?? "job").replace(/[^a-z0-9]+/gi, "_").slice(0, 40);
      link.download = `jd_report_${slug || jdId.slice(0, 8)}.docx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-brand-400" />
      </div>
    );
  }

  if (!report || report.total_evaluated === 0) {
    return (
      <div className="w-full">
        <Breadcrumbs
          items={[{ label: "Results", href: `/dashboard/results/jd/${jdId}` }, { label: "System Report" }]}
          className="mb-6"
        />
        <EmptyState
          icon={<FileText className="h-6 w-6" />}
          title="No evaluations completed yet"
          description="The system report will appear here once candidates complete their assessments for this job."
        />
      </div>
    );
  }

  const totalRec = Object.values(report.recommendation_counts).reduce((a, b) => a + b, 0);
  const totalLvl = Object.values(report.level_counts).reduce((a, b) => a + b, 0);

  return (
    <div className="w-full">
      <Breadcrumbs
        items={[{ label: "Results", href: `/dashboard/results/jd/${jdId}` }, { label: "System Report" }]}
        className="mb-6"
      />

      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
          <FileText className="h-5 w-5 text-slate-700 dark:text-slate-300" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">System Report</h1>
          <p className="text-xs text-slate-400 dark:text-slate-500">{report.job_title}</p>
        </div>
        <button
          type="button"
          onClick={handleDownload}
          disabled={downloading}
          className="inline-flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {downloading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          {downloading ? "Generating…" : "Download report"}
        </button>
      </div>
      {downloadError && (
        <p className="mb-4 text-xs text-danger-dark">{downloadError}</p>
      )}

      <div className="flex flex-col gap-5">
        {/* Key metrics */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Evaluated", value: report.total_evaluated, icon: Users, color: "text-slate-700 dark:text-slate-300" },
            { label: "Average Score", value: `${report.avg_percentage}%`, icon: BarChart2, color: getScoreColor(report.avg_percentage) },
            { label: "Highest", value: `${report.highest_percentage}%`, icon: TrendingUp, color: getScoreColor(report.highest_percentage) },
            { label: "Lowest", value: `${report.lowest_percentage}%`, icon: TrendingDown, color: getScoreColor(report.lowest_percentage) },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="rounded-2xl bg-slate-100 p-4 text-center dark:bg-slate-800/60">
              <Icon className={clsx("h-4 w-4 mx-auto mb-1", color)} />
              <p className={clsx("text-lg font-bold", color)}>{value}</p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500">{label}</p>
            </div>
          ))}
        </div>

        {/* Pass rate */}
        {report.pass_rate !== null && (
          <div className="rounded-2xl bg-slate-100 p-5 dark:bg-slate-800/60">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle className="h-4 w-4 text-success" />
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">Pass Rate</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="h-3 w-full overflow-hidden rounded-full bg-white dark:bg-slate-900">
                  <div
                    className="h-full rounded-full bg-emerald-400 transition-[width]"
                    style={{ width: `${report.pass_rate}%` }}
                  />
                </div>
              </div>
              <span className={clsx("text-lg font-bold tabular-nums", getScoreColor(report.pass_rate))}>
                {report.pass_rate}%
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              {Math.round(report.pass_rate / 100 * report.total_evaluated)} of {report.total_evaluated} candidates passed
            </p>
          </div>
        )}

        {/* Recommendation distribution */}
        {Object.keys(report.recommendation_counts).length > 0 && (
          <div className="rounded-2xl bg-slate-100 p-5 dark:bg-slate-800/60">
            <div className="flex items-center gap-2 mb-4">
              <Award className="h-4 w-4 text-slate-700 dark:text-slate-300" />
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">Recommendation Distribution</p>
            </div>
            <div className="flex flex-col gap-2">
              {recOrder.filter(r => report.recommendation_counts[r]).map((rec) => {
                const count = report.recommendation_counts[rec] ?? 0;
                const pct = totalRec > 0 ? Math.round(count / totalRec * 100) : 0;
                const cfg = RECOMMENDATION_CONFIG[rec];
                return (
                  <div key={rec} className="flex items-center gap-3">
                    <span className="text-sm w-4">{cfg.emoji}</span>
                    <span className={clsx("text-xs font-medium w-24 shrink-0", cfg.color)}>{cfg.label}</span>
                    <div className="flex-1 h-2 overflow-hidden rounded-full bg-white dark:bg-slate-900">
                      <div
                        className={clsx("h-full rounded-full", cfg.bgColor.replace("-50", "-400").replace("emerald-50","emerald-400").replace("success-light","green-400").replace("warning-light","amber-400").replace("danger-light","red-400"))}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-500 w-16 text-right tabular-nums dark:text-slate-400">{count} ({pct}%)</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Candidate level distribution */}
        {Object.keys(report.level_counts).length > 0 && (
          <div className="rounded-2xl bg-slate-100 p-5 dark:bg-slate-800/60">
            <div className="flex items-center gap-2 mb-4">
              <BarChart2 className="h-4 w-4 text-slate-700 dark:text-slate-300" />
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">Candidate Level Distribution</p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {levelOrder.filter(l => report.level_counts[l]).map((level) => {
                const count = report.level_counts[level] ?? 0;
                const pct = totalLvl > 0 ? Math.round(count / totalLvl * 100) : 0;
                const cfg = EVALUATION_LEVEL_CONFIG[level];
                return (
                  <div key={level} className={clsx("rounded-lg border p-3 text-center", cfg.bgColor, cfg.borderColor)}>
                    <span className="text-2xl">{cfg.emoji}</span>
                    <p className={clsx("text-sm font-bold mt-1", cfg.color)}>{count}</p>
                    <p className="text-[10px] text-slate-500">{cfg.label} ({pct}%)</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Strong skills */}
        {report.common_strong_skills.length > 0 && (
          <div className="rounded-2xl bg-slate-100 p-4 dark:bg-slate-800/60">
            <div className="flex items-center gap-1.5 mb-3">
              <Star className="h-4 w-4 text-success" />
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">Common Strengths</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {report.common_strong_skills.map((skill) => (
                <span key={skill} className="rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
                  {skill}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Weak skills */}
        {report.common_weak_skills.length > 0 && (
          <div className="rounded-2xl bg-slate-100 p-4 dark:bg-slate-800/60">
            <div className="flex items-center gap-1.5 mb-3">
              <Lightbulb className="h-4 w-4 text-warning" />
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">Common Skill Gaps</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {report.common_weak_skills.map((skill) => (
                <span key={skill} className="rounded-full bg-amber-50 border border-amber-200 px-2.5 py-1 text-xs font-medium text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
                  {skill}
                </span>
              ))}
            </div>
            <p className="mt-2 text-[10px] text-slate-400 dark:text-slate-500">
              These skills scored below 60% on average across all candidates.
              Consider adding targeted training or adjusting the JD requirements.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
