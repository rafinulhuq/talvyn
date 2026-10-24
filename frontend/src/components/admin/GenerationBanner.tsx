"use client";

import Link from "next/link";
import { ChevronDown, Loader2, RefreshCw, Square } from "lucide-react";
import { useState } from "react";
import { clsx } from "clsx";
import { usePathname } from "next/navigation";
import { useGeneration } from "@/contexts/GenerationContext";
import { testsApi } from "@/lib/api/tests";

export function GenerationBanner() {
  const { activeJob, cancelGeneration, checkGenerationNow } = useGeneration();
  const pathname = usePathname();
  const [cancelling, setCancelling] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState(false);
  // Collapsed by default: on a phone the expanded banner (two lines of copy
  // plus two buttons) pushed the actual page below the fold. The one line
  // that matters — what is generating — always stays visible.
  const [expanded, setExpanded] = useState(false);

  // No active job, or user is anywhere under the active JD — don't show
  // (the GenerateTestsButton already shows inline progress on that page)
  if (!activeJob) return null;
  if (pathname.includes(`/jds/${activeJob.jdId}`)) return null;

  async function handleStop() {
    if (!activeJob) return;
    setCancelling(true);
    await testsApi.cancelGeneration(activeJob.jdId);
    cancelGeneration();
    setCancelling(false);
  }

  async function handleCheckNow() {
    setChecking(true);
    const status = await checkGenerationNow();
    setChecking(false);
    setCheckError(status === "error");
  }

  const elapsedMinutes = activeJob.startedAt
    ? Math.max(1, Math.round((Date.now() - activeJob.startedAt) / 60_000))
    : null;

  const actionCls =
    "inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-[#121317] px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-white/10 disabled:opacity-50 sm:py-1";

  return (
    <div className="border-b border-white/8 bg-[#181A1F]">
      {/* Summary line — always visible, one row even on a 360px screen */}
      <div className="flex items-center gap-2 px-4 py-2 sm:px-6">
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[#F2D74E]" />
        <p className="min-w-0 flex-1 truncate text-xs text-white">
          <span className="font-semibold">Generating tests</span>
          <span className="hidden sm:inline">{" for "}</span>
          <span className="sm:hidden">{" · "}</span>
          <Link
            href={`/dashboard/jds/${activeJob.jdId}/tests`}
            className="font-medium text-[#F2D74E] underline-offset-2 hover:underline"
          >
            {activeJob.jdTitle}
          </Link>
          <span className="hidden text-white/80 sm:inline">
            {" · "}
            {activeJob.phase}
            {elapsedMinutes ? ` · ${elapsedMinutes} min elapsed` : ""}
          </span>
        </p>
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
          aria-controls="generation-banner-detail"
          aria-label={expanded ? "Hide generation details" : "Show generation details"}
          className="touch-target -mr-2 shrink-0 rounded-lg text-white/80 transition-colors hover:bg-white/10 hover:text-white"
        >
          <ChevronDown
            className={clsx("h-4 w-4 transition-transform", expanded && "rotate-180")}
          />
        </button>
      </div>

      {/* Detail + controls */}
      {expanded && (
        <div
          id="generation-banner-detail"
          className="flex flex-col gap-2.5 px-4 pb-3 sm:flex-row sm:items-center sm:justify-between sm:px-6"
        >
          <p className="text-[11px] leading-relaxed text-white/80">
            <span className="sm:hidden">
              {activeJob.phase}
              {elapsedMinutes ? ` · ${elapsedMinutes} min elapsed` : ""}
              {" · "}
            </span>
            This continues in the background. Open the tests page or check status
            if it seems stuck.
            {checkError ? " We could not reach the backend; the banner will keep retrying." : ""}
          </p>
          <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex sm:items-center">
            <button
              type="button"
              onClick={handleCheckNow}
              disabled={checking || cancelling}
              className={actionCls}
            >
              <RefreshCw className={checking ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
              Check now
            </button>
            <button
              type="button"
              onClick={handleStop}
              disabled={cancelling}
              className={clsx(actionCls, "hover:text-[#F87171] hover:border-[#F87171]/30")}
              aria-label="Stop generation"
            >
              {cancelling ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Square className="h-3.5 w-3.5" />
              )}
              Stop
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
