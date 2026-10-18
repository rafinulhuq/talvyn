import { Info } from "lucide-react";

interface Props {
  onLoadSample: (type: "human" | "ai") => void;
}

export function AiCheckerHeader({ onLoadSample }: Props) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        {/* De-cluttered Inline Advisory Chip */}
        <div className="group relative">
          <span className="inline-flex cursor-help items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700">
            <Info className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
            Review signal, not verdict
          </span>
          <div className="pointer-events-none absolute left-0 top-full z-20 mt-2 hidden w-80 rounded-xl border border-slate-200 bg-white p-3.5 text-xs leading-relaxed text-slate-700 shadow-lg dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 group-hover:block">
            AI-text detection can be wrong in both directions. Use this score alongside human review, source context, and the document itself.
          </div>
        </div>
      </div>

      {/* Quick Sample Presets */}
      <div className="flex items-center gap-2 self-start sm:self-auto text-xs">
        <span className="font-medium text-slate-400">
          Try sample:
        </span>
        <button
          type="button"
          onClick={() => onLoadSample("human")}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-xs transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-750"
        >
          Human Sample
        </button>
        <button
          type="button"
          onClick={() => onLoadSample("ai")}
          className="rounded-lg border border-indigo-200 bg-indigo-50/70 px-3 py-1.5 text-xs font-medium text-indigo-700 shadow-xs transition-colors hover:bg-indigo-100/70 dark:border-indigo-900/60 dark:bg-indigo-950/40 dark:text-indigo-300"
        >
          AI Sample
        </button>
      </div>
    </div>
  );
}
