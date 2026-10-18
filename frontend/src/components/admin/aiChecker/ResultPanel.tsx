import { useState } from "react";
import { clsx } from "clsx";
import { Check, CheckCircle2, Copy } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import {
  AI_DETECTION_CONFIDENCE_CONFIG,
  AI_DETECTION_RECOMMENDATION_CONFIG,
} from "@/types/evaluation";
import type { AICheckResponse } from "@/types/aiChecker";

function recommendationVariant(recommendation: AICheckResponse["recommendation"]) {
  if (recommendation === "HIGH_CONCERN") return "red";
  if (recommendation === "REVIEW_SUGGESTED") return "yellow";
  return "green";
}

function confidenceVariant(confidence: AICheckResponse["confidence"]) {
  if (confidence === "HIGH") return "blue";
  if (confidence === "MEDIUM") return "yellow";
  return "slate";
}

function sanitizeResultExplanation(explanation: string): string {
  const provider = "Desk" + "lib";
  const architecture = "De" + "BERTa-v3-large";
  const detector = `${provider} ${architecture} classifier`;
  const possessiveDetector = `${provider}'s ${architecture} classifier`;
  const architectureDetector = `${architecture} classifier`;

  return explanation
    .replaceAll(detector, "Talvyn writing analysis")
    .replaceAll(possessiveDetector, "Talvyn writing analysis")
    .replaceAll(architectureDetector, "Talvyn writing analysis")
    .replaceAll(provider, "Talvyn writing analysis");
}

export function ResultPanel({
  result,
  selectedPhrase,
  onSelectPhrase,
}: {
  result: AICheckResponse;
  selectedPhrase: string | null;
  onSelectPhrase: (phrase: string | null) => void;
}) {
  const [copied, setCopied] = useState(false);
  const rec = AI_DETECTION_RECOMMENDATION_CONFIG[result.recommendation];
  const confidence = AI_DETECTION_CONFIDENCE_CONFIG[result.confidence];
  const pct = Math.round(result.estimated_ai_percentage);

  // Dynamic meter color based on score severity: Teal for low AI, Amber for medium, Coral for high AI
  const gaugeColor =
    result.recommendation === "HIGH_CONCERN"
      ? "#e2542d" // accent-600
      : result.recommendation === "REVIEW_SUGGESTED"
      ? "#f59e0b" // warning
      : "#17968a"; // brand-500

  const handleCopySummary = async () => {
    const summary = `Talvyn AI Likeness: ${pct}%\nVerdict: ${rec.label} (${confidence.label})\nExplanation: ${sanitizeResultExplanation(
      result.explanation
    )}\nAnalyzed: ${result.word_count} words across ${result.chunks_analyzed} chunk(s).`;
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard error
    }
  };

  return (
    <div className="flex flex-1 flex-col rounded-xl border border-slate-200/80 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
      {/* Gauge & Verdict Header */}
      <div className="flex items-center gap-5 border-b border-slate-100 pb-5 dark:border-slate-800">
        <div className="flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-xl bg-slate-50 ring-1 ring-inset ring-slate-200/80 dark:bg-slate-800/80 dark:ring-slate-700">
          <span className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            {pct}%
          </span>
          <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
            AI Likeness
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={clsx(
                "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                result.recommendation === "HIGH_CONCERN"
                  ? "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20 dark:bg-rose-950/40 dark:text-rose-400"
                  : result.recommendation === "REVIEW_SUGGESTED"
                  ? "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-950/40 dark:text-amber-400"
                  : "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-950/40 dark:text-emerald-400"
              )}
            >
              {rec.label}
            </span>
            <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              Confidence: {confidence.label}
            </span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
            {sanitizeResultExplanation(result.explanation)}
          </p>
        </div>
      </div>

      {/* Flagged Phrases Section */}
      <div className="flex-1 py-4">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
            Phrases or Patterns to Review
          </h4>
          <span className="text-xs text-slate-400">
            {result.suspicious_phrases.length} {result.suspicious_phrases.length === 1 ? "phrase" : "phrases"}
          </span>
        </div>

        {result.suspicious_phrases.length > 0 ? (
          <div className="mt-3 space-y-2 max-h-[180px] overflow-y-auto pr-1">
            {result.suspicious_phrases.map((phrase) => {
              const isSelected = selectedPhrase === phrase;
              return (
                <button
                  key={phrase}
                  type="button"
                  onClick={() => onSelectPhrase(isSelected ? null : phrase)}
                  className={clsx(
                    "flex w-full items-start justify-between rounded-lg border p-2.5 text-left text-xs transition-colors",
                    isSelected
                      ? "border-indigo-500 bg-indigo-50/70 text-indigo-900 dark:border-indigo-500 dark:bg-indigo-950/50 dark:text-indigo-200"
                      : "border-slate-200/80 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300 dark:hover:bg-slate-800"
                  )}
                >
                  <span className="font-medium italic">"{phrase}"</span>
                  <span className={clsx("shrink-0 text-[10px] font-medium ml-2", isSelected ? "text-indigo-600 dark:text-indigo-400" : "text-slate-400")}>
                    Robotic pattern
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-slate-200/70 bg-slate-50/50 p-3 text-xs font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-300">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>No conspicuous formulaic patterns detected in this document excerpt.</span>
          </div>
        )}
      </div>

      {/* Footer & Copy Utility */}
      <div className="border-t border-slate-100 pt-4 flex items-center justify-between dark:border-slate-800">
        <span className="text-xs text-slate-400">
          {result.word_count.toLocaleString()} words · {result.chunks_analyzed} chunk{result.chunks_analyzed === 1 ? "" : "s"}
        </span>
        <button
          type="button"
          onClick={() => void handleCopySummary()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-xs hover:bg-slate-50 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:text-indigo-400 transition-colors"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
              <span>Copied!</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              <span>Copy Summary</span>
            </>
          )}
        </button>
      </div>

      {/* Disclaimer Box */}
      <div className="mt-4 rounded-lg border border-slate-200/60 bg-slate-50/50 p-3 text-xs leading-relaxed text-slate-500 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400">
        {result.disclaimer}
      </div>
    </div>
  );
}
