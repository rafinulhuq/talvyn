/**
 * Compact self-hosted system status grid for the dashboard, reusing /health/ready.
 */

import { clsx } from "clsx";
import type { HealthReadyResponse, ServiceCheck } from "@/lib/api/health";

interface SystemStatusCardProps {
  checks: HealthReadyResponse["checks"] | undefined;
}

const ROWS: { key: keyof HealthReadyResponse["checks"]; label: string }[] = [
  { key: "database", label: "PostgreSQL" },
  { key: "redis", label: "Queue (Redis)" },
  { key: "worker", label: "Worker" },
  { key: "ollama", label: "Assessment Engine" },
];

function dotClass(status: ServiceCheck["status"] | undefined) {
  if (status === "ok") return "bg-success";
  if (status === undefined) return "bg-slate-300";
  return "bg-danger";
}

export function SystemStatusCard({ checks }: SystemStatusCardProps) {
  if (!checks) {
    return <p className="text-sm text-slate-500">System status is currently unavailable.</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {ROWS.map(({ key, label }) => {
        const check = checks[key];
        const ok = check?.status === "ok";
        return (
          <div
            key={key}
            className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-slate-900 transition-colors hover:border-slate-300"
          >
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              {ok && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              )}
              <span
                className={clsx(
                  "relative inline-flex h-2.5 w-2.5 rounded-full",
                  ok ? "bg-emerald-500" : "bg-rose-500"
                )}
              />
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-200">
                {label}
              </p>
              <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                {check
                  ? check.model_configured
                    ? "Operational · Ready"
                    : ok ? "Operational" : "Attention needed"
                  : "Unconfigured"}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

