"use client";

import { X } from "lucide-react";
import { useId, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";

/**
 * Free-text list input: type and press Enter or comma to add; Backspace on an
 * empty field removes the last item. Pasting "a, b, c" adds all three.
 */
export function TagInput({
  value,
  onChange,
  placeholder,
  max = 25,
  invalid,
  id,
  describedBy,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  max?: number;
  invalid?: boolean;
  id?: string;
  describedBy?: string;
}) {
  const [draft, setDraft] = useState("");
  const autoId = useId();
  const inputId = id ?? autoId;

  const add = (raw: string) => {
    const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
    if (!parts.length) return;
    const next = [...value];
    for (const p of parts) if (!next.some((v) => v.toLowerCase() === p.toLowerCase()) && next.length < max) next.push(p);
    onChange(next);
    setDraft("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(draft);
    } else if (e.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div
      className={cn(
        "flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-control border bg-surface px-2 py-1.5 transition-colors",
        "focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25",
        invalid ? "border-danger" : "border-line-strong hover:border-ink-faint",
      )}
    >
      {value.map((tag) => (
        <span key={tag} className="inline-flex h-6 items-center gap-1 rounded-control bg-sunken pl-2 pr-1 text-sm text-ink">
          {tag}
          <button
            type="button"
            onClick={() => onChange(value.filter((t) => t !== tag))}
            aria-label={`Remove ${tag}`}
            className="grid size-4 place-items-center rounded-[3px] text-ink-muted hover:bg-line hover:text-ink"
          >
            <X aria-hidden className="size-3" />
          </button>
        </span>
      ))}
      <input
        id={inputId}
        value={draft}
        onChange={(e) => (e.target.value.includes(",") ? add(e.target.value) : setDraft(e.target.value))}
        onKeyDown={onKeyDown}
        onBlur={() => add(draft)}
        placeholder={value.length ? "" : placeholder}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className="min-w-24 flex-1 bg-transparent px-1 text-base text-ink outline-none placeholder:text-ink-faint"
      />
    </div>
  );
}
