import { Info } from "lucide-react";

interface Props {
  onLoadSample: () => void;
}

export function AtsCheckerHeader({ onLoadSample }: Props) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="group relative self-start">
        <span className="inline-flex cursor-help items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700">
          <Info className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
          Readability check, not hiring signal
        </span>
        <div className="pointer-events-none absolute left-0 top-full z-20 mt-2 hidden w-80 rounded-xl border border-slate-200 bg-white p-3.5 text-xs leading-relaxed text-slate-700 shadow-lg dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 group-hover:block">
          This scores how well an applicant tracking system can read and
          categorise a resume. It says nothing about whether the candidate is
          suitable for the role.
        </div>
      </div>

      <button
        type="button"
        onClick={onLoadSample}
        className="self-start rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-xs transition-colors hover:bg-slate-50 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:text-indigo-400 sm:self-auto"
      >
        Try a sample resume
      </button>
    </div>
  );
}
