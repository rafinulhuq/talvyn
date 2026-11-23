"use client";

import { useId } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import type { DifficultyMix } from "@/types/test";

export const MIX_PRESETS: { id: string; label: string; hint: string; mix: DifficultyMix }[] = [
  { id: "entry", label: "Entry level", hint: "Mostly fundamentals", mix: { easy_percent: 50, medium_percent: 40, hard_percent: 10 } },
  { id: "balanced", label: "Balanced", hint: "Suits most roles", mix: { easy_percent: 30, medium_percent: 50, hard_percent: 20 } },
  { id: "senior", label: "Senior", hint: "Weighted to hard questions", mix: { easy_percent: 15, medium_percent: 45, hard_percent: 40 } },
];

const same = (a: DifficultyMix, b: DifficultyMix) =>
  a.easy_percent === b.easy_percent && a.medium_percent === b.medium_percent && a.hard_percent === b.hard_percent;

const BANDS = [
  { key: "easy_percent", label: "Easy", cls: "bg-accent/35" },
  { key: "medium_percent", label: "Medium", cls: "bg-accent/65" },
  { key: "hard_percent", label: "Hard", cls: "bg-accent" },
] as const;

/** Preset chooser plus exact percentages. Hard is always the remainder, so the three add up to 100. */
export function DifficultyMixField({ value, onChange, suggested }: { value: DifficultyMix; onChange: (m: DifficultyMix) => void; suggested?: DifficultyMix }) {
  const options = suggested && !MIX_PRESETS.some((p) => same(p.mix, suggested))
    ? [{ id: "suggested", label: "From the analysis", hint: "Matched to this role", mix: suggested }, ...MIX_PRESETS]
    : MIX_PRESETS;

  const name = useId();

  function set(key: "easy_percent" | "medium_percent", raw: string) {
    const n = Math.max(0, Math.min(100, Math.round(Number(raw) || 0)));
    const other = key === "easy_percent" ? value.medium_percent : value.easy_percent;
    const v = Math.min(n, 100 - other);
    const next = { ...value, [key]: v };
    onChange({ ...next, hard_percent: 100 - next.easy_percent - next.medium_percent });
  }

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1.5 text-sm font-medium text-ink">Difficulty mix</legend>
      <div className={cn("grid gap-2", options.length > 3 ? "sm:grid-cols-2" : "sm:grid-cols-3")}>
        {options.map((p) => {
          const on = same(p.mix, value);
          return (
            // Native radios: arrow keys and screen readers work without extra code.
            <label
              key={p.id}
              className={cn(
                "cursor-pointer rounded-control border px-3 py-2 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent",
                on ? "border-accent bg-accent-soft/60" : "border-line-strong hover:bg-sunken",
              )}
            >
              <input type="radio" name={`mix-${name}`} className="sr-only" checked={on} onChange={() => onChange(p.mix)} />
              <span className="block text-base font-medium text-ink">{p.label}</span>
              <span className="block text-sm text-ink-muted">{p.hint}</span>
            </label>
          );
        })}
      </div>

      <div aria-hidden className="flex h-2 gap-0.5 overflow-hidden rounded-full">
        {BANDS.map((b) => (
          <span key={b.key} className={cn("h-full transition-[flex-grow] duration-200", b.cls)} style={{ flexGrow: value[b.key] }} />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {BANDS.map((b) => (
          <label key={b.key} className="flex flex-col gap-1 text-sm text-ink-muted">
            <span className="flex items-center gap-1.5">
              <span aria-hidden className={cn("size-2 rounded-full", b.cls)} />
              {b.label}
            </span>
            {b.key === "hard_percent" ? (
              <span className="flex h-9 items-center text-base text-ink">
                {value.hard_percent}%<span className="sr-only"> (the remainder)</span>
              </span>
            ) : (
              <span className="relative">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={100}
                  value={value[b.key]}
                  onChange={(e) => set(b.key, e.target.value)}
                  className="pr-7"
                />
                <span aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted">%</span>
              </span>
            )}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
