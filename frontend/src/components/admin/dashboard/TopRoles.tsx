/**
 * Compact "top roles by completion rate" card for the dashboard.
 */

import Link from "next/link";

export interface RoleCompletion {
  jd_id: string;
  title: string;
  invited_count: number;
  completed_count: number;
  completion_rate: number;
}

interface TopRolesProps {
  roles: RoleCompletion[];
}

export function TopRoles({ roles }: TopRolesProps) {
  if (roles.length === 0) {
    return <p className="text-sm text-slate-500">No invited candidates yet.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {roles.map((role, i) => (
        <Link
          key={role.jd_id}
          href={`/dashboard/jds/${role.jd_id}`}
          className="group flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs transition-all duration-150 hover:border-slate-300 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-[11px] font-semibold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
            0{i + 1}
          </span>
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-xs font-semibold text-slate-800 dark:text-slate-200 group-hover:text-indigo-600 transition-colors">
                {role.title}
              </span>
              <span className="shrink-0 font-display text-xs font-bold tabular-nums text-slate-900 dark:text-slate-100">
                {role.completion_rate}%
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className="h-full rounded-full bg-indigo-600 transition-[width] duration-300"
                style={{ width: `${Math.min(role.completion_rate, 100)}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
              {role.completed_count} completed · {role.invited_count} invited
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}

