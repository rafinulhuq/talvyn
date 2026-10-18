/**
 * AnalyzeJdButton
 *
 * Calls POST /api/v1/jd/{id}/analyze, handles the full UX lifecycle:
 * - Idle (with tooltip if JD not parsed)
 * - Loading spinner with animated status message
 * - Success flash before reloading the page
 * - Error display with dismiss
 *
 * The button is disabled if parse_status !== "DONE".
 */

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Wand2,
  Loader2,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { jdApi } from "@/lib/api/jd";
import type { ParseStatus } from "@/types/index";

/** Poll /status until generation_status leaves EXTRACTING (or times out). */
async function pollUntilDone(
  jdId: string,
  onMessage: (msg: string) => void,
  timeoutMs = 180_000,
  intervalMs = 3_000,
): Promise<"idle" | "failed" | "timeout"> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, intervalMs));
    const res = await jdApi.getStatus(jdId);
    if (!res.success) continue;
    const { generation_status } = res.data;
    if (generation_status === "IDLE") return "idle";
    if (generation_status === "FAILED") return "failed";
    // Still EXTRACTING — keep cycling messages (caller handles that)
  }
  return "timeout";
}

interface AnalyzeJdButtonProps {
  jdId: string;
  parseStatus: ParseStatus;
  hasExistingData: boolean;
}

type State =
  | { phase: "idle" }
  | { phase: "loading"; message: string }
  | { phase: "success"; message: string }
  | { phase: "error"; message: string; code: string };

// Rotating status messages to show while analysis runs.
function loadingMessages(): string[] {
  return [
    "Preparing JD analysis…",
    "Extracting skills and requirements…",
    "Identifying seniority level…",
    "Mapping test topics…",
    "Validating extracted data…",
    "Almost done…",
  ];
}

export function AnalyzeJdButton({
  jdId,
  parseStatus,
  hasExistingData,
}: AnalyzeJdButtonProps) {
  const router = useRouter();
  const [state, setState] = useState<State>({ phase: "idle" });

  const canAnalyze = parseStatus === "DONE";

  async function handleAnalyze() {
    if (!canAnalyze || state.phase === "loading") return;

    const messages = loadingMessages();
    setState({ phase: "loading", message: messages[0] });

    // Cycle through status messages while analysis runs.
    let idx = 0;
    const interval = setInterval(() => {
      idx = (idx + 1) % messages.length;
      setState({ phase: "loading", message: messages[idx] });
    }, 4000);

    try {
      // Step 1 — trigger extraction (returns 202 immediately)
      const result = await jdApi.analyze(jdId);

      if (!result.success) {
        clearInterval(interval);
        const code = result.error.code ?? "UNKNOWN";
        const msg = result.error.message ?? "Analysis failed.";
        setState({ phase: "error", message: msg, code });
        return;
      }

      // Step 2 — poll /status until generation_status leaves EXTRACTING
      const outcome = await pollUntilDone(jdId, (msg) =>
        setState({ phase: "loading", message: msg }),
      );
      clearInterval(interval);

      if (outcome === "failed") {
        setState({
          phase: "error",
          message: "Skill extraction failed. Please retry in a moment.",
          code: "EXTRACTION_FAILED",
        });
        return;
      }

      if (outcome === "timeout") {
        setState({
          phase: "error",
          message: "Analysis is taking longer than expected. Please try again.",
          code: "TIMEOUT",
        });
        return;
      }

      setState({
        phase: "success",
        message: hasExistingData ? "Re-analysis complete!" : "Skills extracted!",
      });

      // Reload to show the new skill panels
      setTimeout(() => router.refresh(), 1200);
    } catch {
      clearInterval(interval);
      setState({
        phase: "error",
        message: "Unexpected error. Please try again.",
        code: "CLIENT_ERROR",
      });
    }
  }

  // ── Error state ──────────────────────────────────────────────
  if (state.phase === "error") {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-danger/20 bg-danger-light px-4 py-3">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-danger-dark">
            {state.code === "AI_SERVICE_UNAVAILABLE"
              ? "Analysis service is not reachable"
              : state.code === "AI_PARSE_ERROR"
              ? "Analysis response could not be processed"
              : "Analysis failed"}
          </p>
          <p className="mt-0.5 text-xs text-danger-dark/80 line-clamp-2">
            {state.message}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleAnalyze}
            className="text-xs font-medium text-danger underline underline-offset-2 hover:no-underline"
          >
            Retry
          </button>
          <button
            onClick={() => setState({ phase: "idle" })}
            aria-label="Dismiss error"
            className="text-danger/60 hover:text-danger transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  // ── Loading state ────────────────────────────────────────────
  // Indigo, matching the Light Indigo system while analysis is running.
  if (state.phase === "loading") {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-brand-100 bg-brand-50/60 px-4 py-3">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand-700" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-brand-900">
            {state.message}
          </p>
          <p className="mt-0.5 text-xs text-brand-700">
            This may take up to 2 minutes on the first run.
          </p>
        </div>
      </div>
    );
  }

  // ── Success flash ────────────────────────────────────────────
  if (state.phase === "success") {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-success/20 bg-success-light px-4 py-3">
        <CheckCircle className="h-4 w-4 shrink-0 text-success" />
        <p className="text-sm font-medium text-success-dark">{state.message}</p>
      </div>
    );
  }

  // ── Idle state ───────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-2">
      <Button
        onClick={handleAnalyze}
        disabled={!canAnalyze}
        leftIcon={
          hasExistingData ? (
            <RefreshCw className="h-4 w-4" />
          ) : (
            <Wand2 className="h-4 w-4" />
          )
        }
        variant={hasExistingData ? "secondary" : "primary"}
      >
        {hasExistingData ? "Re-analyze JD" : "Analyze JD"}
      </Button>

      {!canAnalyze && (
        <p className="text-xs text-slate-400">
          {parseStatus === "PENDING" || parseStatus === "PROCESSING"
            ? "Wait for text extraction to complete first."
            : "Text extraction failed — re-upload the file."}
        </p>
      )}
    </div>
  );
}
