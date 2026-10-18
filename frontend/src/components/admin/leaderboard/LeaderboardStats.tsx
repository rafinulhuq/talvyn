import { BarChart2, CheckCircle, Trophy, Users } from "lucide-react";
import type { GlobalLeaderboardEntry } from "@/types/evaluation";

export function LeaderboardStats({ entries }: { entries: GlobalLeaderboardEntry[] }) {
  const stats = [
    { label: "Candidates", value: entries.length, icon: Users },
    {
      label: "Avg score",
      value: `${(entries.reduce((s, e) => s + e.percentage, 0) / entries.length).toFixed(1)}%`,
      icon: BarChart2,
    },
    {
      label: "Strong hire",
      value: entries.filter((e) => (e.admin_override_recommendation ?? e.ai_recommendation) === "STRONG_HIRE").length,
      icon: Trophy,
    },
    {
      label: "Passed",
      value: `${entries.filter((e) => e.passed === true).length} / ${entries.filter((e) => e.passed !== null).length || "—"}`,
      icon: CheckCircle,
    },
  ];

  return (
    // Centered stacks with 10px labels read as filler on a phone; a left-aligned
    // icon chip + value + label packs the same four numbers into roughly half
    // the vertical space and stays legible.
    <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {stats.map(({ label, value, icon: Icon }) => (
        <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 flex items-center gap-3.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400">
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 tabular-nums">
              {value}
            </p>
            <p className="truncate text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

