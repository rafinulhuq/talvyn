"use client";

/**
 * GenerationContext
 *
 * Tracks a single in-flight test-generation job across all admin pages.
 *
 * Persistence strategy:
 *   - Active job is kept in sessionStorage so a page refresh recovers it.
 *   - On mount the context reads sessionStorage and verifies with the backend
 *     that the job is still actually running (GENERATING). Stale entries are
 *     cleared automatically.
 *
 * Background poller:
 *   - Polls /api/v1/jd/{jdId}/status every 15 s whenever a job is active.
 *   - This keeps the banner accurate and clears it when the backend finishes,
 *     even when the user has navigated away from the tests page (so the
 *     GenerateTestsButton is unmounted and no longer polling itself).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api/client";

// ── Types ─────────────────────────────────────────────────────

export interface ActiveGeneration {
  jdId: string;
  jdTitle: string;
  phase: string;
  startedAt: number;
}

interface GenerationContextValue {
  activeJob: ActiveGeneration | null;
  startGeneration: (jdId: string, jdTitle: string, phase: string) => void;
  updatePhase: (phase: string) => void;
  checkGenerationNow: () => Promise<"running" | "finished" | "failed" | "error">;
  finishGeneration: () => void;
  failGeneration: () => void;
  cancelGeneration: () => void;
}

// ── Constants ─────────────────────────────────────────────────

const STORAGE_KEY = "talvyn_active_generation";

// ── Context ───────────────────────────────────────────────────

const GenerationContext = createContext<GenerationContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────

export function GenerationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [activeJob, setActiveJob] = useState<ActiveGeneration | null>(null);
  const bgPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeJobId = activeJob?.jdId;

  // ── helpers ──────────────────────────────────────────────────

  const clearBgPoll = useCallback(() => {
    if (bgPollRef.current) {
      clearInterval(bgPollRef.current);
      bgPollRef.current = null;
    }
  }, []);

  const finishGeneration = useCallback(() => {
    setActiveJob(null);
    sessionStorage.removeItem(STORAGE_KEY);
    clearBgPoll();
  }, [clearBgPoll]);

  const failGeneration = useCallback(() => {
    setActiveJob(null);
    sessionStorage.removeItem(STORAGE_KEY);
    clearBgPoll();
  }, [clearBgPoll]);

  const startGeneration = useCallback(
    (jdId: string, jdTitle: string, phase: string) => {
      const job: ActiveGeneration = { jdId, jdTitle, phase, startedAt: Date.now() };
      setActiveJob(job);
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(job));
    },
    []
  );

  const cancelGeneration = useCallback(() => {
    setActiveJob(null);
    sessionStorage.removeItem(STORAGE_KEY);
    clearBgPoll();
  }, [clearBgPoll]);

  const activeJobRef = useRef(activeJob);
  useEffect(() => {
    activeJobRef.current = activeJob;
  }, [activeJob]);

  const updatePhase = useCallback((phase: string) => {
    const prev = activeJobRef.current;
    if (!prev) return;
    const updated = { ...prev, phase };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    setActiveJob(updated);
  }, []);

  // ── On mount: recover from sessionStorage ─────────────────────

  useEffect(() => {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (!stored) return;

    let job: ActiveGeneration;
    try {
      job = JSON.parse(stored) as ActiveGeneration;
      if (!job.startedAt) job.startedAt = Date.now();
    } catch {
      sessionStorage.removeItem(STORAGE_KEY);
      return;
    }

    // Verify the backend is still GENERATING — don't show stale banners.
    apiClient
      .get<{ generation_status: string }>(`/api/v1/jd/${job.jdId}/status`)
      .then((res) => {
        if (res.success && res.data.generation_status === "GENERATING") {
          setActiveJob(job);
        } else {
          sessionStorage.removeItem(STORAGE_KEY);
        }
      })
      .catch(() => sessionStorage.removeItem(STORAGE_KEY));
  }, []);

  const checkGenerationNow = useCallback(async () => {
    if (!activeJob) return "error";

    try {
      const res = await apiClient.get<{
        generation_status: string;
        has_tests: boolean;
      }>(`/api/v1/jd/${activeJob.jdId}/status`);
      if (!res.success) return "error";

      const { generation_status } = res.data;
      if (generation_status === "READY" || generation_status === "IDLE") {
        finishGeneration();
        router.refresh();
        return "finished";
      }
      if (generation_status === "FAILED") {
        failGeneration();
        router.refresh();
        return "failed";
      }
      return "running";
    } catch {
      return "error";
    }
  }, [activeJob, finishGeneration, failGeneration, router]);

  // ── Background poller ─────────────────────────────────────────
  // Keeps the banner accurate and auto-clears it when the backend finishes,
  // even when GenerateTestsButton is unmounted (user on a different page).

  const onPollTick = useEffectEvent(async (jdId: string) => {
    try {
      const res = await apiClient.get<{
        generation_status: string;
        has_tests: boolean;
      }>(`/api/v1/jd/${jdId}/status`);
      if (!res.success) return;

      const { generation_status } = res.data;
      if (generation_status === "READY" || generation_status === "IDLE") {
        finishGeneration();
        // Refresh the current page's server data so any page the admin is
        // on (JDs list, dashboard overview, etc.) reflects the new tests
        // without requiring a manual reload.
        router.refresh();
      } else if (generation_status === "FAILED") {
        failGeneration();
        router.refresh();
      }
      // Still GENERATING → keep polling
    } catch {
      // Ignore transient network errors; next tick will retry.
    }
  });

  useEffect(() => {
    if (!activeJobId) {
      clearBgPoll();
      return;
    }

    const jdId = activeJobId;
    bgPollRef.current = setInterval(() => {
      onPollTick(jdId);
    }, 15_000);

    return clearBgPoll;
    // onPollTick is a useEffectEvent — intentionally omitted, always stable
    // and always sees the latest finishGeneration/failGeneration/router.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeJobId, clearBgPoll]);

  const value = useMemo<GenerationContextValue>(
    () => ({
      activeJob,
      startGeneration,
      updatePhase,
      checkGenerationNow,
      finishGeneration,
      failGeneration,
      cancelGeneration,
    }),
    [
      activeJob,
      startGeneration,
      updatePhase,
      checkGenerationNow,
      finishGeneration,
      failGeneration,
      cancelGeneration,
    ]
  );

  return (
    <GenerationContext.Provider value={value}>
      {children}
    </GenerationContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────

export function useGeneration(): GenerationContextValue {
  const ctx = useContext(GenerationContext);
  if (!ctx)
    throw new Error("useGeneration must be used inside <GenerationProvider>");
  return ctx;
}
