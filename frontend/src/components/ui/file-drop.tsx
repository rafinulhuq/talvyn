"use client";

import { FileText, Upload, X } from "lucide-react";
import { useId, useRef, useState, type DragEvent } from "react";
import { cn } from "@/lib/cn";

const fmtSize = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);

/** Click or drop a single file. Validation (type/size) is the caller's job; errors render below. */
export function FileDrop({
  accept,
  hint,
  file,
  onFile,
  error,
  disabled,
}: {
  accept: string;
  hint: string;
  file: File | null;
  onFile: (f: File | null) => void;
  error?: string;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const hintId = useId();

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (!disabled && e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]);
  };

  if (file) {
    return (
      <div className="flex items-center gap-3 rounded-panel border border-line bg-surface px-4 py-3">
        <span className="grid size-9 place-items-center rounded-control bg-sunken text-ink-muted">
          <FileText aria-hidden className="size-4.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-medium text-ink">{file.name}</span>
          <span className="block text-sm text-ink-muted">{fmtSize(file.size)}</span>
        </span>
        {!disabled && (
          <button type="button" onClick={() => onFile(null)} aria-label="Remove file" className="grid size-7 place-items-center rounded-control text-ink-muted hover:bg-sunken hover:text-ink">
            <X aria-hidden className="size-4" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        disabled={disabled}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        aria-describedby={hintId}
        className={cn(
          "flex flex-col items-center gap-2 rounded-panel border border-dashed px-6 py-10 text-center transition-colors",
          over ? "border-accent bg-accent-soft/40" : error ? "border-danger" : "border-line-strong bg-surface hover:border-ink-faint hover:bg-sunken/40",
        )}
      >
        <Upload aria-hidden className="size-5 text-ink-muted" />
        <span className="text-base text-ink">
          <span className="font-medium text-accent">Choose a file</span> or drag it here
        </span>
        <span id={hintId} className="text-sm text-ink-muted">
          {hint}
        </span>
      </button>
      <input ref={input} type="file" accept={accept} className="sr-only" tabIndex={-1} onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
