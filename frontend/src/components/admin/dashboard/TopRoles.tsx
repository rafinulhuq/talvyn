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
    return <p className="text-sm text-white/80">No invited candidates yet.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {roles.map((role, i) => (
        <Link
          key={role.jd_id}
          href={`/dashboard/jds/${role.jd_id}`}
          className="group flex items-start gap-3 rounded-xl border border-white/8 bg-[#181A1F] p-3.5 shadow-xs transition-colors duration-150 hover:border-white/15"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[#121317] border border-white/5 text-[11px] font-mono font-bold text-[#F2D74E]">
            0{i + 1}
          </span>
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-xs font-semibold text-white group-hover:text-[#F2D74E] transition-colors">
                {role.title}
              </span>
              <span className="shrink-0 font-display text-xs font-bold tabular-nums text-white">
                {role.completion_rate}%
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#121317] border border-white/5">
              <div
                className="h-full rounded-full bg-[#F2D74E] transition-[width] duration-300"
                style={{ width: `${Math.min(role.completion_rate, 100)}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-white/80">
              {role.completed_count} completed · {role.invited_count} invited
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}

