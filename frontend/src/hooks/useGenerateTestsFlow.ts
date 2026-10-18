"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api/client";
import { testsApi } from "@/lib/api/tests";
import { useGeneration } from "@/contexts/GenerationContext";
import type { DifficultyDist } from "@/components/admin/DifficultyCustomizer";

export type UIPhase =
  | { kind: "idle" }
  | { kind: "loading"; message: string }
  | { kind: "success"; testCount: number }
  | { kind: "error"; message: string; code: string };

export interface ProgressState {
  step: string;
  pct: number;
  detail: string;
}

const LOADING_PHASES = [
  "Preparing test generation prompts…",
  "Generating Technical Screening Test…",
  "Generating Practical Reasoning Test…",
  "Generating Problem-Solving Test…",
  "Validating question quality…",
  "Saving tests to database…",
];

function getPollInterval(i: number): number {
  if (i < 4) return 30_000;
  if (i < 12) return 15_000;
  return 10_000;
}

interface UseGenerateTestsFlowArgs {
  jdId: string;
  jdTitle: string;
  hasExtractedData: boolean;
  hasExistingTests: boolean;
  initialDifficultyDistribution?: {
    easy_percent: number;
    medium_percent: number;
    hard_percent: number;
  } | null;
}

export function useGenerateTestsFlow({
  jdId,
  jdTitle,
  hasExtractedData,
  hasExistingTests,
  initialDifficultyDistribution,
}: UseGenerateTestsFlowArgs) {
  const router = useRouter();
  const { activeJob, startGeneration, updatePhase, finishGeneration, failGeneration, cancelGeneration } =
    useGeneration();

  const [cancelling, setCancelling] = useState(false);
  const [uiPhase, setUiPhase] = useState<UIPhase>({ kind: "idle" });
  const [progress, setProgress] = useState<ProgressState | null>(null);

  // ── Difficulty customizer state ───────────────────────────────
  const defaultDist: DifficultyDist = {
    easy: initialDifficultyDistribution?.easy_percent ?? 30,
    medium: initialDifficultyDistribution?.medium_percent ?? 50,
  };
  const [dist, setDist] = useState<DifficultyDist>(defaultDist);
  // Expanded by default on first generation; collapsed when tests already exist
  const [diffOpen, setDiffOpen] = useState(!hasExistingTests);

  // Tracks whether the component is still mounted so async callbacks don't
  // update state after unmount.
  const mountedRef = useRef(true);
  // Set to true to abort an in-flight poll loop on unmount.
  const abortPollRef = useRef(false);
  // EventSource ref for the SSE progress stream.
  const progressSourceRef = useRef<EventSource | null>(null);
  // The "LOADING_PHASES" ticker inside runPollLoop — mirrored to a ref (like
  // progressSourceRef above) so the unmount cleanup below can clear it
  // immediately instead of waiting up to 30s for the poll loop to notice
  // abortPollRef on its own.
  const phaseIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    abortPollRef.current = false;
    return () => {
      mountedRef.current = false;
      abortPollRef.current = true;
      if (progressSourceRef.current) {
        progressSourceRef.current.close();
        progressSourceRef.current = null;
      }
      if (phaseIntervalRef.current) {
        clearInterval(phaseIntervalRef.current);
        phaseIntervalRef.current = null;
      }
    };
  }, []);

  // ── SSE progress stream ───────────────────────────────────────
  // Replaces the 2.5 s polling loop. The backend pushes an event every 2 s
  // and closes the stream when pct reaches 100. The proxy route forwards SSE
  // correctly because Next.js streaming is enabled via the /api/proxy handler.

  const startProgressStream = useCallback((jdId: string) => {
    if (progressSourceRef.current) progressSourceRef.current.close();

    // Route through the Next.js proxy so the X-Internal-Token header is injected.
    // The proxy passes through SSE response streams transparently.
    const source = new EventSource(`/api/proxy/api/v1/tests/progress/${jdId}/stream`);
    progressSourceRef.current = source;

    source.onmessage = (e) => {
      if (!mountedRef.current) return;
      try {
        const data = JSON.parse(e.data) as ProgressState;
        setProgress(data);
        if (data.pct >= 100) {
          source.close();
          progressSourceRef.current = null;
        }
      } catch {
        // ignore parse errors — backend may emit empty keep-alive lines
      }
    };

    source.onerror = () => {
      // SSE connection dropped (e.g. backend restarted) — close silently.
      // The outer poll loop will detect completion via /status.
      source.close();
      progressSourceRef.current = null;
    };
  }, []);

  const stopProgressStream = useCallback(() => {
    if (progressSourceRef.current) {
      progressSourceRef.current.close();
      progressSourceRef.current = null;
    }
  }, []);

  // ── Poll loop ─────────────────────────────────────────────────

  const runPollLoop = useCallback(async () => {
    abortPollRef.current = false;
    startProgressStream(jdId);

    let phaseIdx = 0;
    phaseIntervalRef.current = setInterval(() => {
      phaseIdx = Math.min(phaseIdx + 1, LOADING_PHASES.length - 1);
      const msg = LOADING_PHASES[phaseIdx];
      if (mountedRef.current) {
        setUiPhase((s) =>
          s.kind === "loading" ? { kind: "loading", message: msg } : s
        );
        updatePhase(msg);
      }
    }, 20_000);

    const cleanup = () => {
      if (phaseIntervalRef.current) {
        clearInterval(phaseIntervalRef.current);
        phaseIntervalRef.current = null;
      }
      stopProgressStream();
    };

    // 120 iterations: 4×30s + 8×15s + 108×10s = ~22 min total.
    // Covers slower hardware that can take 14-18 min for 3 tests.
    for (let i = 0; i < 120; i++) {
      await new Promise<void>((r) => setTimeout(r, getPollInterval(i)));
      if (abortPollRef.current) { cleanup(); return; }

      const res = await apiClient.get<{
        generation_status: string;
        has_tests: boolean;
        error_message?: string | null;
      }>(`/api/v1/jd/${jdId}/status`);

      if (abortPollRef.current) { cleanup(); return; }
      if (!res.success) continue; // transient error — keep polling

      const { generation_status, has_tests, error_message } = res.data;

      if (
        (generation_status === "READY" || generation_status === "IDLE") &&
        has_tests
      ) {
        cleanup();
        const testsRes = await apiClient.get<unknown[]>(
          `/api/v1/tests/jd/${jdId}`
        );
        const count = testsRes.success ? (testsRes.data as unknown[]).length : 3;

        finishGeneration();
        if (mountedRef.current) {
          setProgress(null);
          setUiPhase({ kind: "success", testCount: count });
          setTimeout(() => {
            router.refresh();
            setTimeout(() => {
              if (mountedRef.current) setUiPhase({ kind: "idle" });
            }, 600);
          }, 1_400);
        }
        return;
      }

      if (generation_status === "FAILED") {
        cleanup();
        failGeneration();
        if (mountedRef.current) {
          setProgress(null);
          setUiPhase({
            kind: "error",
            message: error_message || "Test generation failed after retries. Please try again.",
            code: "GENERATION_FAILED",
          });
        }
        return;
      }
      // Still GENERATING → continue polling
    }

    // Loop exhausted — do one final authoritative status check before giving up.
    // The backend may have just finished while the last sleep was running.
    cleanup();
    const finalRes = await apiClient.get<{
      generation_status: string;
      has_tests: boolean;
      error_message?: string | null;
    }>(`/api/v1/jd/${jdId}/status`);

    if (finalRes.success) {
      const { generation_status, has_tests } = finalRes.data;

      if ((generation_status === "READY" || generation_status === "IDLE") && has_tests) {
        // Backend finished just as the loop ended — treat as success.
        const testsRes = await apiClient.get<unknown[]>(`/api/v1/tests/jd/${jdId}`);
        const count = testsRes.success ? (testsRes.data as unknown[]).length : 3;
        finishGeneration();
        if (mountedRef.current) {
          setProgress(null);
          setUiPhase({ kind: "success", testCount: count });
          setTimeout(() => {
            router.refresh();
            setTimeout(() => { if (mountedRef.current) setUiPhase({ kind: "idle" }); }, 600);
          }, 1_400);
        }
        return;
      }

      if (generation_status === "GENERATING") {
        // Still running on a very slow machine — hand off to the context background
        // poller (15 s) which will clear the banner when it eventually finishes.
        // Don't call failGeneration() so the activeJob stays alive.
        if (mountedRef.current) {
          setProgress(null);
          setUiPhase({
            kind: "error",
            message:
              "Still generating — this is taking longer than usual on this machine. " +
              "The banner above will disappear automatically when it finishes. " +
              "You can safely navigate away.",
            code: "SLOW_GENERATION",
          });
        }
        return;
      }
    }

    // Status is FAILED or unreachable — real failure.
    failGeneration();
    if (mountedRef.current) {
      setProgress(null);
      setUiPhase({
        kind: "error",
        message:
          (finalRes.success && finalRes.data.error_message) ||
          "Test generation failed. Please try again.",
        code: "GENERATION_FAILED",
      });
    }
  }, [jdId, router, updatePhase, finishGeneration, failGeneration, startProgressStream, stopProgressStream]);

  // ── Auto-resume on mount ──────────────────────────────────────
  // Handles two cases:
  //   A) Context already knows this jdId is generating (intra-session nav).
  //   B) Backend says GENERATING but context is unaware (page refresh, direct URL).

  useEffect(() => {
    // Case A: context already has this job — jump straight to loading UI.
    // Resuming an in-progress job on mount syncs local UI state with the
    // shared job context, not derived-state cleanup.
    if (activeJob?.jdId === jdId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUiPhase({ kind: "loading", message: activeJob.phase });
      setProgress({ pct: 0, step: activeJob.phase, detail: "Resuming…" });
      runPollLoop();
      return;
    }

    // Case B: fresh mount — ask the backend
    let cancelled = false;
    apiClient
      .get<{ generation_status: string; has_tests: boolean; error_message?: string | null }>(
        `/api/v1/jd/${jdId}/status`
      )
      .then((res) => {
        if (cancelled || !mountedRef.current) return;
        if (!res.success) return;

        const { generation_status, error_message } = res.data;

        if (generation_status === "GENERATING") {
          const msg = LOADING_PHASES[1];
          startGeneration(jdId, jdTitle, msg);
          setUiPhase({ kind: "loading", message: msg });
          setProgress({ pct: 0, step: msg, detail: "Resuming…" });
          runPollLoop();
          return;
        }

        if (generation_status === "FAILED") {
          setUiPhase({
            kind: "error",
            message: error_message || "Test generation failed. Please retry in a moment.",
            code: "GENERATION_FAILED",
          });
        }
        // IDLE / READY → leave as idle (tests shown by the page)
      })
      .catch(() => {
        // Silent — don't disrupt the idle UI on network error
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jdId]);

  // ── Handlers ─────────────────────────────────────────────────

  async function handleCancel() {
    setCancelling(true);
    abortPollRef.current = true;
    stopProgressStream();
    await testsApi.cancelGeneration(jdId);
    cancelGeneration();
    setCancelling(false);
    setProgress(null);
    setUiPhase({ kind: "idle" });
  }

  async function handleGenerate() {
    if (!hasExtractedData || uiPhase.kind === "loading") return;

    const initialMsg = LOADING_PHASES[0];
    setUiPhase({ kind: "loading", message: initialMsg });
    // Seed progress at 0% immediately so the bar starts from the left.
    // Backend polls will override this as they come in (5% → 10% → …).
    setProgress({ pct: 0, step: initialMsg, detail: "Setting up…" });
    startGeneration(jdId, jdTitle, initialMsg);

    const hard = Math.max(0, 100 - dist.easy - dist.medium);
    const kickoff = await testsApi.generate(jdId, {
      easy_percent: dist.easy,
      medium_percent: dist.medium,
      hard_percent: hard,
    });
    if (!kickoff.success) {
      const code = kickoff.error.code ?? "UNKNOWN";
      const msg = kickoff.error.message ?? "Generation failed.";
      failGeneration();
      setUiPhase({ kind: "error", message: msg, code });
      return;
    }

    // 202 accepted — backend is generating. Start the poll loop.
    runPollLoop();
  }

  return {
    uiPhase,
    setUiPhase,
    progress,
    cancelling,
    dist,
    setDist,
    defaultDist,
    diffOpen,
    setDiffOpen,
    handleGenerate,
    handleCancel,
  };
}
