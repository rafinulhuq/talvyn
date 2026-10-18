import { clsx } from "clsx";
import { AlertTriangle, BrainCircuit, CheckCircle2, Loader2 } from "lucide-react";
import type { AICheckResponse } from "@/types/aiChecker";
import type { CheckState } from "@/hooks/useAiCheckerFlow";
import { ResultPanel } from "./ResultPanel";

interface Props {
  state: CheckState;
  result: AICheckResponse | null;
  selectedPhrase: string | null;
  onSelectPhrase: (phrase: string | null) => void;
}

function ExtractingState({ filename }: { filename: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
      <Loader2 className="h-5 w-5 animate-spin text-indigo-600 dark:text-indigo-400" />
      <div>
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Extracting text
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400">{filename}</p>
      </div>
    </div>
  );
}

function CheckingStep({ done, label }: { done: boolean; label: string }) {
  return (
    <div
      className={clsx(
        "flex items-center gap-2 text-xs transition",
        done ? "font-medium text-slate-900 dark:text-slate-100" : "text-slate-400 dark:text-slate-500"
      )}
    >
      {done ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
      ) : (
        <div className="h-2 w-2 rounded-full bg-slate-300 dark:bg-slate-700 animate-pulse" />
      )}
      <span>{label}</span>
    </div>
  );
}

function CheckingState({ state }: { state: Extract<CheckState, { phase: "checking" }> }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-slate-200/80 bg-white p-8 text-center shadow-xs dark:border-slate-800 dark:bg-slate-900">
      <div className="relative flex h-16 w-16 items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-indigo-600 dark:text-indigo-400" />
        <BrainCircuit className="absolute h-6 w-6 text-indigo-600 dark:text-indigo-400" />
      </div>
      <h3 className="mt-4 text-base font-semibold text-slate-900 dark:text-slate-100">
        Evaluating Linguistic Markers
      </h3>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        {state.detail ?? "Analyzing representative sections..."}
      </p>

      <div className="mt-6 w-full max-w-xs space-y-2 text-left">
        <div className="flex items-center gap-2 text-xs font-medium text-slate-900 dark:text-slate-100">
          <CheckCircle2 className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
          <span>Document extracted & chunked</span>
        </div>
        <CheckingStep done={Boolean(state.step && state.step >= 2)} label="Evaluating token perplexity & entropy" />
        <CheckingStep done={Boolean(state.step && state.step >= 3)} label="Synthesizing recommendation" />
      </div>
    </div>
  );
}

function ErrorState({ state }: { state: Extract<CheckState, { phase: "error" }> }) {
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-5 shadow-xs dark:border-rose-900/50 dark:bg-rose-950/20">
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400" />
        <div>
          <p className="text-sm font-semibold text-rose-900 dark:text-rose-300">
            Could not complete check
          </p>
          <p className="mt-1 text-xs leading-relaxed text-rose-800 dark:text-rose-300/90">
            {state.message}
          </p>
          {state.detail && (
            <p className="mt-2 text-[11px] text-rose-600 dark:text-rose-400">
              {state.detail}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function HowItWorksPanel() {
  return (
    <div className="flex flex-1 flex-col rounded-xl border border-slate-200/80 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
        <BrainCircuit className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
        How Talvyn Analyzes Likeness
      </div>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Multi-vector classifier evaluating three core linguistic markers:
      </p>

      <div className="mt-4 space-y-3 flex-1">
        <div className="rounded-lg border border-slate-200/70 bg-slate-50/50 p-3.5 text-xs dark:border-slate-800 dark:bg-slate-800/40">
          <span className="font-semibold text-slate-900 dark:text-slate-100 block">
            1. Perplexity &amp; Vocabulary Entropy
          </span>
          <p className="mt-1 text-slate-500 leading-relaxed dark:text-slate-400">
            Evaluates how predictably tokens follow each other. LLMs favor high-probability word sequences; authentic technical writing contains varied, idiosyncratic terminology.
          </p>
        </div>

        <div className="rounded-lg border border-slate-200/70 bg-slate-50/50 p-3.5 text-xs dark:border-slate-800 dark:bg-slate-800/40">
          <span className="font-semibold text-slate-900 dark:text-slate-100 block">
            2. Burstiness &amp; Cadence Variance
          </span>
          <p className="mt-1 text-slate-500 leading-relaxed dark:text-slate-400">
            Measures sentence length variance. Authentic human writing mixes short punchy sentences with compound technical clauses.
          </p>
        </div>

        <div className="rounded-lg border border-slate-200/70 bg-slate-50/50 p-3.5 text-xs dark:border-slate-800 dark:bg-slate-800/40">
          <span className="font-semibold text-slate-900 dark:text-slate-100 block">
            3. Formulaic Phrasing Patterns
          </span>
          <p className="mt-1 text-slate-500 leading-relaxed dark:text-slate-400">
            Identifies telltale filler transitions and generic abstract self-descriptions.
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-amber-200/80 bg-amber-50/60 p-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300 leading-relaxed">
        💡 Paste at least <strong className="font-semibold">20 words</strong> on the left or drop a file to trigger the analysis engine.
      </div>
    </div>
  );
}

export function DiagnosticPanel({ state, result, selectedPhrase, onSelectPhrase }: Props) {
  const showResult = Boolean(result);
  const showHowItWorks = !showResult && state.phase !== "checking" && state.phase !== "extracting";

  return (
    <aside className="flex flex-col space-y-4">
      {state.phase === "extracting" && <ExtractingState filename={state.filename} />}
      {state.phase === "checking" && <CheckingState state={state} />}
      {state.phase === "error" && <ErrorState state={state} />}

      {showResult && result && (
        <ResultPanel result={result} selectedPhrase={selectedPhrase} onSelectPhrase={onSelectPhrase} />
      )}
      {showHowItWorks && <HowItWorksPanel />}
    </aside>
  );
}
