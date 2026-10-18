"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Trophy,
  Medal,
  BarChart2,
  Users,
  Loader2,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { clsx } from "clsx";
import { Badge } from "@/components/ui/Badge";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { EmptyState } from "@/components/ui/EmptyState";
import { evaluationApi } from "@/lib/api/evaluation";
import type { LeaderboardData, LeaderboardEntry, EvaluationLevel, AIRecommendation } from "@/types/evaluation";
import {
  EVALUATION_LEVEL_CONFIG,
  RECOMMENDATION_CONFIG,
  getScoreColor,
} from "@/types/evaluation";

function RankIcon({ rank }: { rank: number }) {
  if (rank === 1) return <Trophy className="h-5 w-5 text-amber-500" />;
  if (rank === 2) return <Medal className="h-5 w-5 text-slate-400" />;
  if (rank === 3) return <Medal className="h-5 w-5 text-amber-700" />;
  return <span className="w-5 text-center text-sm font-bold text-slate-400 dark:text-slate-500">{rank}</span>;
}

function PassBadge({ passed }: { passed: boolean | null }) {
  if (passed === null) return <span className="text-xs text-slate-400">—</span>;
  return passed ? (
    <Badge variant="green" icon={CheckCircle}>Pass</Badge>
  ) : (
    <Badge variant="red" icon={XCircle}>Fail</Badge>
  );
}

function LeaderboardRow({ entry }: { entry: LeaderboardEntry }) {
  const levelCfg = entry.evaluation_level
    ? EVALUATION_LEVEL_CONFIG[entry.evaluation_level as EvaluationLevel]
    : null;
  const effectiveRec = (entry.admin_override_recommendation ?? entry.ai_recommendation) as AIRecommendation;
  const recCfg = RECOMMENDATION_CONFIG[effectiveRec];

  return (
    <Link
      href={`/dashboard/results/${entry.attempt_id}`}
      className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors dark:hover:bg-slate-800/60"
    >
      {/* Rank */}
      <div className="w-8 flex items-center justify-center shrink-0">
        <RankIcon rank={entry.rank} />
      </div>

      {/* Candidate */}
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
        {entry.candidate_name.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-900 truncate dark:text-slate-50">{entry.candidate_name}</p>
        <p className="text-xs text-slate-400 truncate dark:text-slate-500">{entry.candidate_email}</p>
      </div>

      {/* Score */}
      <div className="text-right shrink-0 hidden sm:block">
        <p className={clsx("text-sm font-bold tabular-nums", getScoreColor(entry.percentage))}>
          {entry.percentage}%
        </p>
        <p className="text-[10px] text-slate-400 dark:text-slate-500">{entry.total_score}/{entry.max_score}</p>
      </div>

      {/* Level */}
      {levelCfg && (
        <div className="hidden md:flex items-center gap-1 shrink-0">
          <span className="text-sm">{levelCfg.emoji}</span>
          <span className={clsx("text-xs font-medium", levelCfg.color)}>{levelCfg.label}</span>
        </div>
      )}

      {/* Recommendation */}
      <div className="shrink-0 hidden lg:block">
        <span className={clsx("text-xs font-medium", recCfg.color)}>
          {recCfg.emoji} {recCfg.label}
        </span>
      </div>

      {/* Pass/Fail */}
      <div className="shrink-0">
        <PassBadge passed={entry.passed} />
      </div>
    </Link>
  );
}

export default function LeaderboardPage() {
  const params = useParams<{ jdId: string }>();
  const jdId = params.jdId;
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    evaluationApi.getLeaderboard(jdId).then((r) => {
      setLoading(false);
      if (r.success) setData(r.data);
    });
  }, [jdId]);

  return (
    <div className="w-full">
      <Breadcrumbs
        items={[{ label: "Results", href: "/dashboard/results" }, { label: "Leaderboard" }]}
        className="mb-6"
      />

      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
          <Trophy className="h-5 w-5 text-slate-700 dark:text-slate-300" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Leaderboard</h1>
          {data && <p className="text-xs text-slate-400 dark:text-slate-500">{data.job_title}</p>}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-brand-400" />
        </div>
      ) : !data || data.entries.length === 0 ? (
        <EmptyState
          icon={<Users className="h-6 w-6" />}
          title="No evaluated candidates yet"
          description="Results will appear here once candidates complete their assessments for this job."
        />
      ) : (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-2 gap-3 mb-5 sm:grid-cols-4">
            {[
              { label: "Total Candidates", value: data.total_candidates, icon: Users },
              { label: "Avg Score", value: `${data.avg_percentage}%`, icon: BarChart2 },
              { label: "Pass Rate", value: data.pass_rate !== null ? `${data.pass_rate}%` : "—", icon: CheckCircle },
              { label: "Top Score", value: `${data.entries[0]?.percentage ?? 0}%`, icon: Trophy },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="rounded-2xl bg-slate-100 p-4 text-center dark:bg-slate-800/60">
                <Icon className="h-4 w-4 text-slate-400 mx-auto mb-1 dark:text-slate-500" />
                <p className="text-lg font-bold text-slate-900 dark:text-slate-50">{value}</p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500">{label}</p>
              </div>
            ))}
          </div>

          {/* Table */}
          <div className="rounded-2xl bg-slate-100 p-2 dark:bg-slate-800/60">
            <div className="divide-y divide-slate-100 rounded-xl bg-white dark:divide-slate-800 dark:bg-slate-900">
              <div className="flex items-center gap-2 px-5 py-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 w-8 dark:text-slate-500">Rank</span>
                <span className="flex-1 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Candidate</span>
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 hidden sm:block w-16 text-right dark:text-slate-500">Score</span>
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 hidden md:block w-24 dark:text-slate-500">Level</span>
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 hidden lg:block w-28 dark:text-slate-500">Recommendation</span>
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 w-14 dark:text-slate-500">Status</span>
              </div>
              {data.entries.map((entry) => (
                <LeaderboardRow key={entry.attempt_id} entry={entry} />
              ))}
            </div>
          </div>

          <p className="mt-3 text-center text-xs text-slate-400 dark:text-slate-500">
            Click any candidate to view their full evaluation report.
          </p>
        </>
      )}
    </div>
  );
}
