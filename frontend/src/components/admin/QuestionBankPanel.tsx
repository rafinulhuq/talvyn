/**
 * QuestionBankPanel — admin question-bank management (Master Prompt 2/3).
 *
 * Generation runs as a background ARQ job (task_generate_bank); this panel
 * opens an SSE stream against GET .../question-bank/progress/stream — same
 * pattern as GenerateTestsButton's legacy-test-generation progress bar —
 * to show live step/pct instead of a static spinner.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  Database,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { StatusBanner } from "@/components/ui/StatusBanner";
import { questionBankApi } from "@/lib/api/questionBank";
import { examTemplatesApi } from "@/lib/api/examTemplates";
import type { BankStatusResponse, ExamTemplate } from "@/types/exam";
import {
  GenerationPresetSelect,
  DEFAULT_PRESET,
  FAST_PRESET,
} from "@/components/admin/questionBank/GenerationPresetSelect";
import { GenerationProgressBar, type ProgressState } from "@/components/admin/questionBank/GenerationProgressBar";
import { SectionBreakdownTable } from "@/components/admin/questionBank/SectionBreakdownTable";

interface QuestionBankPanelProps {
  jdId: string;
  initialStatus: BankStatusResponse;
}

const STATUS_BADGE: Record<string, { variant: "yellow" | "blue" | "green" | "red" | "slate"; label: string }> = {
  DRAFT: { variant: "slate", label: "Draft" },
  GENERATING: { variant: "blue", label: "Generating" },
  READY: { variant: "green", label: "Ready" },
  FAILED: { variant: "red", label: "Failed" },
  ARCHIVED: { variant: "slate", label: "Archived" },
};

function useQuestionBankGeneration(jdId: string, initialStatus: BankStatusResponse) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [busy, setBusy] = useState<"generate" | "regenerate" | "review" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [reviewJustApproved, setReviewJustApproved] = useState(false);
  // "default" (commercial 40/20 target), "fast" (minimum 20/10 — still
  // enough to assign candidates, just below recommended size, useful for
  // local testing on modest hardware), or a saved Templates library entry's
  // id — applying one also persists its section_weights via
  // updateConfig() before generating, since section_weights isn't part of
  // GenerateBankRequest itself (it drives score weighting, not question
  // counts — a separate, persistent per-JD setting).
  const [preset, setPreset] = useState<string>(DEFAULT_PRESET);
  const [templates, setTemplates] = useState<ExamTemplate[]>([]);

  useEffect(() => {
    examTemplatesApi.list().then((result) => {
      if (result.success) {
        setTemplates(result.data.items.filter((t) => t.status === "ACTIVE"));
      }
    });
  }, []);

  const progressSourceRef = useRef<EventSource | null>(null);

  const stopProgressStream = useCallback(() => {
    if (progressSourceRef.current) {
      progressSourceRef.current.close();
      progressSourceRef.current = null;
    }
  }, []);

  const startProgressStream = useCallback(() => {
    stopProgressStream();
    const source = new EventSource(
      `/api/proxy/api/v1/jd/${jdId}/question-bank/progress/stream`
    );
    progressSourceRef.current = source;

    source.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as ProgressState;
        setProgress(data);
        if (data.pct >= 100) {
          stopProgressStream();
          void questionBankApi.getStatus(jdId).then((result) => {
            if (result.success) setStatus(result.data);
            setProgress(null);
            router.refresh();
          });
        }
      } catch {
        // Ignore malformed event — next tick will self-correct.
      }
    };

    source.onerror = () => {
      stopProgressStream();
    };
  }, [jdId, router, stopProgressStream]);

  // Resume the progress stream on mount/refresh if a generation was already
  // running (e.g. the admin navigated away and came back).
  useEffect(() => {
    if (status.exists && status.status === "GENERATING") {
      startProgressStream();
    }
    return stopProgressStream;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleGenerate(isRegenerate: boolean) {
    setBusy(isRegenerate ? "regenerate" : "generate");
    setError(null);
    setProgress({ step: "Queued…", pct: 0 });

    const selectedTemplate = templates.find((t) => t.id === preset);
    let req: { mcq_target?: number; cq_target?: number } = {};
    if (preset === FAST_PRESET) {
      req = { mcq_target: 20, cq_target: 10 };
    } else if (selectedTemplate) {
      const { mcq_target, cq_target, section_weights } = selectedTemplate.config_json;
      req = {
        ...(mcq_target != null ? { mcq_target } : {}),
        ...(cq_target != null ? { cq_target } : {}),
      };
      if (section_weights) {
        const configResult = await questionBankApi.updateConfig(jdId, { section_weights });
        if (!configResult.success) {
          setBusy(null);
          setProgress(null);
          setError(`Could not apply template's section weights: ${configResult.error.message}`);
          return;
        }
      }
    }

    const result = isRegenerate
      ? await questionBankApi.regenerate(jdId, req)
      : await questionBankApi.generate(jdId, req);
    setBusy(null);

    if (!result.success) {
      setProgress(null);
      setError(result.error.message);
      return;
    }
    setStatus(result.data);
    startProgressStream();
    router.refresh();
  }

  async function handleReview() {
    setBusy("review");
    setError(null);
    setReviewJustApproved(false);
    const result = await questionBankApi.review(jdId);
    setBusy(null);

    if (!result.success) {
      setError(result.error.message);
      return;
    }
    setStatus(result.data);
    setReviewJustApproved(true);
    router.refresh();
  }

  return {
    status,
    busy,
    error,
    progress,
    reviewJustApproved,
    preset,
    setPreset,
    templates,
    handleGenerate,
    handleReview,
  };
}

function EmptyBankPrompt({ isBusy, busy, onGenerate }: { isBusy: boolean; busy: string | null; onGenerate: () => void }) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40">
      <p className="text-xs font-medium text-slate-600 dark:text-slate-400">No question bank generated for this job yet.</p>
      <Button
        size="sm"
        loading={busy === "generate"}
        disabled={isBusy}
        onClick={onGenerate}
        leftIcon={<Sparkles className="h-3.5 w-3.5" />}
      >
        Generate question bank
      </Button>
    </div>
  );
}

function QuestionBankStatusBanners({
  status,
  reviewJustApproved,
}: {
  status: BankStatusResponse;
  reviewJustApproved: boolean;
}) {
  return (
    <>
      {status.status === "FAILED" && (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-medium text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
          Generation failed. One or more sections did not reach minimum questions. Regenerate to retry.
        </div>
      )}

      {status.below_recommended && status.ready && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs font-medium text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
          Meets minimum for assignment, but larger bank is recommended for rotation.
        </div>
      )}

      {reviewJustApproved && status.is_approved && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-medium text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <p className="font-semibold">
            All 3 sections are approved and ready for candidates.
          </p>
        </div>
      )}
    </>
  );
}

function QuestionBankActionsRow({
  status,
  busy,
  isBusy,
  onRegenerate,
  onReview,
}: {
  status: BankStatusResponse;
  busy: "generate" | "regenerate" | "review" | null;
  isBusy: boolean;
  onRegenerate: () => void;
  onReview: () => void;
  onReviewJustApproved?: boolean;
}) {
  return (
    <div className="mt-5 flex flex-wrap gap-3">
      <Button
        variant="outline"
        size="sm"
        loading={busy === "regenerate"}
        disabled={isBusy}
        onClick={onRegenerate}
        leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
      >
        Regenerate bank
      </Button>
      {status.ready && !status.is_approved && (
        <Button
          size="sm"
          loading={busy === "review"}
          disabled={isBusy}
          onClick={onReview}
          leftIcon={<ShieldCheck className="h-3.5 w-3.5" />}
        >
          Review &amp; approve for candidates
        </Button>
      )}
      {status.ready && status.is_approved && (
        <Button size="sm" variant="outline" disabled leftIcon={<CheckCircle2 className="h-3.5 w-3.5" />}>
          Approved for candidates
        </Button>
      )}
    </div>
  );
}

function QuestionBankStatusHeader({
  status,
  busy,
  error,
  progress,
  reviewJustApproved,
  preset,
  setPreset,
  templates,
  onGenerate,
  onRegenerate,
  onReview,
}: {
  status: BankStatusResponse;
  busy: "generate" | "regenerate" | "review" | null;
  error: string | null;
  progress: ProgressState | null;
  reviewJustApproved: boolean;
  preset: string;
  setPreset: (preset: string) => void;
  templates: ExamTemplate[];
  onGenerate: () => void;
  onRegenerate: () => void;
  onReview: () => void;
}) {
  const isBusy = busy !== null;

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/70 dark:text-indigo-400">
            <Database className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Question Bank</p>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Reusable Reasoning / Practical / Technical sections, generated once and shared across candidates.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {status.status && (
            <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold uppercase text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              {status.status}
            </span>
          )}
          {status.is_approved && (
            <span className="flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Approved
            </span>
          )}
        </div>
      </div>

      <GenerationPresetSelect preset={preset} disabled={isBusy} templates={templates} onChange={setPreset} />

      {!status.exists && <EmptyBankPrompt isBusy={isBusy} busy={busy} onGenerate={onGenerate} />}

      {status.exists && <QuestionBankStatusBanners status={status} reviewJustApproved={reviewJustApproved} />}

      {status.exists && (
        <QuestionBankActionsRow status={status} busy={busy} isBusy={isBusy} onRegenerate={onRegenerate} onReview={onReview} />
      )}

      {(progress || status.status === "GENERATING") && <GenerationProgressBar progress={progress} />}

      {error && (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-medium text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
          {error}
        </div>
      )}
    </div>
  );
}

export function QuestionBankPanel({ jdId, initialStatus }: QuestionBankPanelProps) {
  const {
    status,
    busy,
    error,
    progress,
    reviewJustApproved,
    preset,
    setPreset,
    templates,
    handleGenerate,
    handleReview,
  } = useQuestionBankGeneration(jdId, initialStatus);

  return (
    <div className="flex flex-col gap-5">
      {/* ── Status header ──────────────────────────────────── */}
      <QuestionBankStatusHeader
        status={status}
        busy={busy}
        error={error}
        progress={progress}
        reviewJustApproved={reviewJustApproved}
        preset={preset}
        setPreset={setPreset}
        templates={templates}
        onGenerate={() => handleGenerate(false)}
        onRegenerate={() => handleGenerate(true)}
        onReview={handleReview}
      />

      {/* ── Per-section breakdown ──────────────────────────── */}
      {status.exists && <SectionBreakdownTable sections={status.sections} />}
    </div>
  );
}
