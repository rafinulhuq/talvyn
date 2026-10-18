"use client";

import { useCallback, useRef, useState } from "react";
import { clsx } from "clsx";
import { Code2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import type { QuestionForCandidate } from "@/types/attempt";

const MAX_CHARS = 20_000;

const LANGUAGE_LABELS: Record<string, string> = {
  python: "Python",
  javascript: "JavaScript",
  typescript: "TypeScript",
  java: "Java",
  cpp: "C++",
  c: "C",
  csharp: "C#",
  go: "Go",
  rust: "Rust",
  sql: "SQL",
  bash: "Bash",
};

interface CodeQuestionProps {
  question: QuestionForCandidate;
  value: string;
  onChange: (questionId: string, code: string) => void;
  disabled?: boolean;
  index: number;
}

export function CodeQuestion({
  question,
  value,
  onChange,
  disabled = false,
  index,
}: CodeQuestionProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [lineCount, setLineCount] = useState(() => (value ? value.split("\n").length : 1));

  const langKey = (question.code_language || "").toLowerCase();
  const langLabel = LANGUAGE_LABELS[langKey] || question.code_language || "Code";

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const v = e.target.value.slice(0, MAX_CHARS);
      onChange(question.id, v);
      setLineCount(v.split("\n").length);
    },
    [onChange, question.id]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Tab") {
        e.preventDefault();
        const ta = textareaRef.current;
        if (!ta || disabled) return;
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const next = value.substring(0, start) + "  " + value.substring(end);
        onChange(question.id, next.slice(0, MAX_CHARS));
        requestAnimationFrame(() => {
          ta.selectionStart = ta.selectionEnd = start + 2;
        });
      }
    },
    [disabled, onChange, question.id, value]
  );

  const lineNumbers = Array.from({ length: Math.max(lineCount, 12) }, (_, i) => i + 1);
  const nearLimit = value.length > MAX_CHARS * 0.9;

  return (
    <div className="flex flex-col gap-4 text-slate-900 dark:text-slate-100">
      {/* Question Header */}
      <div>
        <div className="mb-2 flex items-center gap-2">
          <span className="inline-flex items-center rounded-md bg-indigo-600 px-2.5 py-0.5 text-xs font-semibold text-white shadow-xs">
            Q{index + 1}
          </span>
          {question.skill_tested && (
            <span className="inline-flex items-center rounded-md bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              {question.skill_tested}
            </span>
          )}
        </div>
        <p className="text-base font-semibold leading-relaxed text-slate-900 dark:text-slate-100">
          {question.question_text}
        </p>
      </div>

      {/* Starter code */}
      {question.code_starter && (
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/50">
          <p className="mb-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
            Starter Code Template
          </p>
          <pre className="overflow-x-auto text-xs text-slate-800 dark:text-slate-200 font-mono leading-relaxed">
            {question.code_starter}
          </pre>
        </div>
      )}

      {/* Meta bar */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Worth{" "}
          <span className="font-semibold text-slate-900 dark:text-slate-100">
            {question.marks} marks
          </span>
          . Write concise, optimal code.
        </p>
        <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 shadow-xs dark:border-slate-700 dark:bg-slate-800">
          <Code2 className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
          <span className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-200">
            {langLabel}
          </span>
        </div>
      </div>

      {/* Modern Monospace Editor */}
      <div
        className={clsx(
          "relative flex overflow-hidden rounded-xl border border-slate-200/80 bg-slate-950 font-mono text-sm shadow-xs transition-colors focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 dark:border-slate-800",
          nearLimit && "ring-2 ring-amber-500",
          disabled && "opacity-50"
        )}
      >
        {/* Line numbers column */}
        <div
          aria-hidden
          className="select-none border-r border-slate-800 bg-slate-900/80 px-3 py-3 text-right font-mono text-xs text-slate-500 leading-6 tabular-nums"
          style={{ minWidth: "2.75rem" }}
        >
          {lineNumbers.map((n) => (
            <div key={n}>{n}</div>
          ))}
        </div>

        {/* Textarea code field */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={`# Write your ${langLabel} solution here...`}
          rows={Math.max(lineCount + 3, 14)}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          className={clsx(
            "w-full resize-none bg-transparent px-4 py-3 text-slate-100 leading-6 font-mono text-sm",
            "placeholder:text-slate-600",
            "focus:outline-none",
            "disabled:cursor-not-allowed"
          )}
          aria-label={`Code solution for question ${index + 1}`}
        />
      </div>

      {/* Editor footer */}
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 tabular-nums">
        <span>
          {lineCount} line{lineCount !== 1 ? "s" : ""}
        </span>
        <span
          className={clsx(
            "tabular-nums",
            nearLimit && "font-semibold text-amber-500"
          )}
        >
          {value.length.toLocaleString()} / {MAX_CHARS.toLocaleString()} chars
          {nearLimit && " (approaching limit)"}
        </span>
      </div>
    </div>
  );
}
