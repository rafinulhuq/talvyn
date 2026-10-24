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
  if (status === "ok") return "border-[#4ADE80]/30 bg-[#4ADE80]/10 text-[#4ADE80]";
  if (status === "warning") return "border-[#FACC15]/30 bg-[#FACC15]/10 text-[#FACC15]";
  return "border-[#F87171]/30 bg-[#F87171]/10 text-[#F87171] font-semibold";
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
  if (status === "ok") return <CheckCircle2 className="h-4 w-4 text-[#4ADE80]" />;
  if (status === "warning") return <AlertTriangle className="h-4 w-4 text-[#FACC15]" />;
  return <XCircle className="h-4 w-4 text-[#F87171]" />;
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
    <div className="flex items-start gap-3.5 rounded-lg border border-white/8 bg-[#181A1F] p-3.5">
      <div className="mt-0.5">{statusIcon(status)}</div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-semibold text-white">{label}</p>
          {aiAccent && (
            <span className="inline-flex items-center gap-1 rounded-full border border-[#F2D74E]/30 bg-[#F2D74E]/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-[#F2D74E]">
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
            <span className="text-xs font-medium text-white/80">[{check.latency_ms}ms]</span>
          )}
        </div>
        <p className="mt-1 text-xs text-white/80">
          {check?.detail ?? fallbackDetail}
        </p>
        {check?.action && (
          <p className="mt-1 text-xs font-medium text-white">
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
    <div className="rounded-xl border border-white/8 bg-[#121317] p-6 shadow-xs text-white">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between border-b border-white/8 pb-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#181A1F] border border-white/5 text-[#F2D74E]">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">System Health</h2>
            <p className="mt-0.5 text-xs text-white/80">
              Readiness checks for the services admins depend on before sending candidate links.
            </p>
            {lastChecked && (
              <p className="mt-1 text-[11px] font-medium text-white/70">
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
        <div className="mb-4 rounded-xl border border-[#F87171]/20 bg-[#F87171]/10 p-4 text-xs font-medium text-[#F87171]">
          {error}
        </div>
      )}

      {health && (
        <div
          className={`mb-4 rounded-xl border p-3.5 text-xs font-semibold ${
            issueCount === 0
              ? "border-[#4ADE80]/20 bg-[#4ADE80]/10 text-[#4ADE80]"
              : "border-[#FACC15]/20 bg-[#FACC15]/10 text-[#FACC15]"
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
