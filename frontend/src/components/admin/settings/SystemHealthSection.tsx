"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { healthApi, type HealthReadyResponse, type ServiceCheck } from "@/lib/api/health";
import { Button } from "@/components/ui/Button";

function statusTone(status: ServiceCheck["status"]) {
  if (status === "ok") return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-400";
  if (status === "warning") return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-400";
  return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800/60 dark:bg-rose-950/40 dark:text-rose-400 font-semibold";
}

function resolveDetail(check: ServiceCheck | undefined, fallbackDetail: string): string {
  if (check?.detail) return check.detail;
  if (check && check.status === "ok") {
    return typeof check.latency_ms === "number"
      ? `Responding normally (${check.latency_ms}ms).`
      : "Responding normally.";
  }
  return fallbackDetail;
}

function ollamaDetail(check?: ServiceCheck): string {
  if (check?.detail) return check.detail;
  if (check?.model_configured) {
    return check.model_available
      ? "Assessment engine is ready."
      : "Assessment engine is configured but not ready yet.";
  }
  return resolveDetail(check, "Assessment engine check has not run yet.");
}

function statusIcon(status: ServiceCheck["status"]) {
  if (status === "ok") return <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />;
  if (status === "warning") return <AlertTriangle className="h-4 w-4 text-amber-500 dark:text-amber-400" />;
  return <XCircle className="h-4 w-4 text-rose-600 dark:text-rose-400" />;
}

function HealthCheckRow({
  label,
  check,
  fallbackDetail,
  aiAccent = false,
}: {
  label: string;
  check?: ServiceCheck;
  fallbackDetail: string;
  aiAccent?: boolean;
}) {
  const status = check?.status ?? "unknown";

  return (
    <div className="flex items-start gap-3.5 rounded-lg border border-slate-100 bg-slate-50/70 p-3.5 dark:border-slate-800/60 dark:bg-slate-800/40">
      <div className="mt-0.5">{statusIcon(status)}</div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">{label}</p>
          {aiAccent && (
            <span className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/70 dark:text-indigo-300">
              <BrainCircuit className="h-3 w-3" />
              AI Core
            </span>
          )}
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${statusTone(status)}`}
          >
            {status}
          </span>
          {typeof check?.latency_ms === "number" && (
            <span className="text-xs font-medium text-slate-400">[{check.latency_ms}ms]</span>
          )}
        </div>
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
          {check?.detail ?? fallbackDetail}
        </p>
        {check?.action && (
          <p className="mt-1 text-xs font-medium text-slate-800 dark:text-slate-200">
            Action: {check.action}
          </p>
        )}
      </div>
    </div>
  );
}

export function SystemHealthSection() {
  const [health, setHealth] = useState<HealthReadyResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  async function loadHealth() {
    setIsLoading(true);
    setError(null);

    try {
      const response = await healthApi.ready();

      if (!response.success) {
        setError(response.error.message);
        return;
      }

      setHealth(response.data);
    } finally {
      setIsLoading(false);
      setLastChecked(new Date());
    }
  }

  useEffect(() => {
    void loadHealth();
  }, []);

  const checks = health?.checks;
  const issueCount = checks
    ? Object.values(checks).filter((check) => check.status !== "ok").length
    : 0;

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/70 dark:text-indigo-400">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">System Health</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Readiness checks for the services admins depend on before sending candidate links.
            </p>
            {lastChecked && (
              <p className="mt-1 text-[11px] font-medium text-slate-400">
                Last checked: {lastChecked.toLocaleTimeString()}
              </p>
            )}
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          loading={isLoading}
          onClick={() => void loadHealth()}
        >
          Recheck
        </Button>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-medium text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
          {error}
        </div>
      )}

      {health && (
        <div
          className={`mb-4 rounded-xl border p-3.5 text-xs font-semibold ${
            issueCount === 0
              ? "border-emerald-200 bg-emerald-50/70 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300"
              : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300"
          }`}
        >
          {issueCount === 0
            ? "Status: All core services operational and ready"
            : `Status: Attention required — ${issueCount} service(s) require review`}
        </div>
      )}

      {isLoading && !health ? (
        <p className="py-4 text-xs text-slate-500 dark:text-slate-400">Checking subsystems…</p>
      ) : (
        <div className="grid gap-3">
          <HealthCheckRow
            label="Database"
            check={checks?.database}
            fallbackDetail={resolveDetail(checks?.database, "Database check has not run yet.")}
          />
          <HealthCheckRow
            label="Redis"
            check={checks?.redis}
            fallbackDetail={resolveDetail(checks?.redis, "Redis check has not run yet.")}
          />
          <HealthCheckRow
            label="Worker queue"
            check={checks?.worker}
            fallbackDetail={resolveDetail(checks?.worker, "Worker queue check has not run yet.")}
          />
          <HealthCheckRow
            label="Storage"
            check={checks?.storage}
            fallbackDetail={resolveDetail(checks?.storage, "Storage check has not run yet.")}
          />
          <HealthCheckRow
            label="Assessment Engine"
            check={checks?.ollama}
            fallbackDetail={ollamaDetail(checks?.ollama)}
            aiAccent
          />
          <HealthCheckRow
            label="Email"
            check={checks?.email}
            fallbackDetail={resolveDetail(checks?.email, "Email configuration check has not run yet.")}
          />
          <HealthCheckRow
            label="Magic links"
            check={checks?.magic_links}
            fallbackDetail={resolveDetail(checks?.magic_links, "Magic-link URL check has not run yet.")}
          />
          <HealthCheckRow
            label="Allowed origins"
            check={checks?.cors}
            fallbackDetail={resolveDetail(checks?.cors, "CORS configuration check has not run yet.")}
          />
        </div>
      )}
    </div>
  );
}
