"use client";

import { ChevronDown, RotateCcw, SlidersHorizontal } from "lucide-react";

export interface DifficultyDist {
  easy: number;
  medium: number;
}

interface Props {
  value: DifficultyDist;
  defaultValue: DifficultyDist;
  onChange: (v: DifficultyDist) => void;
  open: boolean;
  onToggle: () => void;
}

export function DifficultyCustomizer({
  value,
  defaultValue,
  onChange,
  open,
  onToggle,
}: Props) {
  const { easy, medium } = value;
  // Hard is always auto-calculated so the distribution always sums to 100
  const hard = Math.max(0, 100 - easy - medium);

  function handleEasy(raw: number) {
    const newEasy = clamp(raw, 0, 100);
    // Cap medium so easy + medium ≤ 100
    const newMedium = clamp(medium, 0, 100 - newEasy);
    onChange({ easy: newEasy, medium: newMedium });
  }

  function handleMedium(raw: number) {
    const newMedium = clamp(raw, 0, 100 - easy);
    onChange({ easy, medium: newMedium });
  }

  const isDefault = easy === defaultValue.easy && medium === defaultValue.medium;

  return (
    <div className="mt-2 rounded-xl bg-slate-100 text-sm dark:bg-slate-800/60">
      {/* Header toggle */}
      <button
        type="button"
        onClick={onToggle}
        className="flex min-h-[44px] w-full items-center gap-2 px-3 py-2 text-left sm:min-h-0"
      >
        <SlidersHorizontal className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        <span className="flex-1 text-xs font-medium text-slate-600">
          Difficulty
        </span>
        {/* The spelled-out summary does not fit next to the label on a 360px
            screen, so narrow viewports get the ratio on its own. */}
        <span className="hidden text-xs tabular-nums text-slate-500 sm:inline">
          {easy}% easy · {medium}% med · {hard}% hard
        </span>
        <span className="text-xs tabular-nums text-slate-500 sm:hidden">
          {easy}/{medium}/{hard}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div className="border-t border-slate-200/70 px-3 pb-3 pt-2.5 dark:border-slate-700/40">
          {/* Stacked visual bar */}
          <div className="mb-3 flex h-2 w-full overflow-hidden rounded-full">
            <div
              className="bg-success transition-[width] duration-300"
              style={{ width: `${easy}%` }}
            />
            <div
              className="bg-warning transition-[width] duration-300"
              style={{ width: `${medium}%` }}
            />
            <div
              className="bg-danger transition-[width] duration-300"
              style={{ width: `${hard}%` }}
            />
          </div>

          <div className="flex flex-col gap-2">
            <SliderRow
              label="Easy"
              labelColor="text-success-dark"
              value={easy}
              max={100 - medium}
              accentClass="text-success"
              onChange={handleEasy}
            />
            <SliderRow
              label="Medium"
              labelColor="text-warning-dark"
              value={medium}
              max={100 - easy}
              accentClass="text-warning"
              onChange={handleMedium}
            />

            {/* Hard is derived */}
            <div className="flex items-center gap-2.5">
              <span className="w-12 text-xs font-medium text-danger-dark">
                Hard
              </span>
              <div className="relative flex-1 h-1.5 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-danger/60 transition-[width] duration-300"
                  style={{ width: `${hard}%` }}
                />
              </div>
              <span className="w-9 text-right text-xs tabular-nums text-slate-500">
                {hard}%
              </span>
              <span className="text-xs text-slate-400">(auto)</span>
            </div>
          </div>

          {!isDefault && (
            <button
              type="button"
              onClick={() => onChange(defaultValue)}
              className="mt-2.5 flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700 transition-colors"
            >
              <RotateCcw className="h-3 w-3" />
              Reset to AI recommendation
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function SliderRow({
  label,
  labelColor,
  value,
  max,
  accentClass,
  onChange,
}: {
  label: string;
  labelColor: string;
  value: number;
  max: number;
  accentClass: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={`w-12 shrink-0 text-xs font-medium ${labelColor}`}>{label}</span>
      <input
        type="range"
        aria-label={label}
        min={0}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`range-touch flex-1 ${accentClass}`}
      />
      <span className="w-9 text-right text-xs tabular-nums font-medium text-slate-700">
        {value}%
      </span>
    </div>
  );
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
