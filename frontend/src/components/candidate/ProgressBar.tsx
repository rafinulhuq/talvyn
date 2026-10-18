/**
 * ProgressBar — shows answered / total questions.
 */

"use client";

interface ProgressBarProps {
  current: number;  // 0-based current question index
  total: number;
  answered: number;
}

export function ProgressBar({ current, total, answered }: ProgressBarProps) {
  const percent = total > 0 ? Math.round((answered / total) * 100) : 0;
  return (
    <div className="flex flex-col gap-2 font-sans">
      <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
        <span>
          Question {current + 1} of {total}
        </span>
        <span className="font-mono text-indigo-600">{answered} answered ({percent}%)</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-indigo-600 transition-[width] duration-300 ease-out"
          style={{ width: `${percent}%` }}
          role="progressbar"
          aria-valuenow={answered}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-label={`${answered} of ${total} questions answered`}
        />
      </div>
    </div>
  );
}
