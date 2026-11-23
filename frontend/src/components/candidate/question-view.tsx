"use client";

import { useEffect, useEffectEvent, useRef } from "react";
import { Kbd } from "@/components/ui/kbd";
import { MAX_ANSWER_CHARS } from "@/lib/candidate/answers";
import { cn } from "@/lib/cn";
import type { CandidateQuestion, OptionLabel } from "@/types/attempt";

const KEYS: Record<string, OptionLabel> = { "1": "A", "2": "B", "3": "C", "4": "D", a: "A", b: "B", c: "C", d: "D" };
const LANG: Record<string, string> = { python: "Python", javascript: "JavaScript", typescript: "TypeScript", java: "Java", cpp: "C++", c: "C", csharp: "C#", go: "Go", rust: "Rust", sql: "SQL", bash: "Bash", php: "PHP" };

type Props = { question: CandidateQuestion; value: string | undefined; onChange: (id: string, v: string) => void; disabled?: boolean; number: number; total: number };

export function QuestionView(props: Props) {
  const { question: q, number, total } = props;
  const kind = q.question_type === "MCQ" ? "Multiple choice" : q.question_type === "CODE" ? `Code${q.code_language ? `, ${LANG[q.code_language.toLowerCase()] ?? q.code_language}` : ""}` : "Written answer";
  return (
    <article aria-labelledby={`q-${q.id}`} className="rounded-panel border border-line bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3 sm:px-6">
        <span className="text-sm font-medium text-ink">
          Question {number} <span className="font-normal text-ink-muted">of {total}</span>
        </span>
        <span className="text-sm text-ink-muted">
          {kind}, {q.marks} {q.marks === 1 ? "mark" : "marks"}
        </span>
      </header>
      <div className="px-5 py-6 sm:px-6">
        <p id={`q-${q.id}`} className="max-w-[68ch] whitespace-pre-wrap text-md text-ink">
          {q.question_text}
        </p>
        <div className="mt-6">
          {q.question_type === "MCQ" ? <Choices {...props} /> : q.question_type === "CODE" ? <CodeAnswer {...props} /> : <TextAnswer {...props} />}
        </div>
      </div>
    </article>
  );
}

function Choices({ question: q, value, onChange, disabled }: Props) {
  // 1–4 or A–D pick an option. Ignored in text fields and with Ctrl/Cmd/Alt held,
  // so Ctrl+C never quietly selects option C.
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (disabled || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "TEXTAREA" || (t.tagName === "INPUT" && (t as HTMLInputElement).type !== "radio"))) return;
    const opt = KEYS[e.key.toLowerCase()];
    if (opt && q.options?.some((o) => o.label === opt)) onChange(q.id, opt);
  });
  useEffect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <fieldset>
      <legend className="sr-only">Choose one answer</legend>
      <div className="flex flex-col gap-2">
        {(q.options ?? []).map((o) => {
          const on = value === o.label;
          return (
            <label
              key={o.label}
              className={cn(
                "flex cursor-pointer items-start gap-3.5 rounded-control border px-4 py-3.5 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent",
                on ? "border-accent bg-accent-soft/60" : "border-line-strong hover:bg-sunken",
                disabled && "pointer-events-none opacity-60",
              )}
            >
              <input type="radio" name={`opt-${q.id}`} className="sr-only" checked={on} disabled={disabled} onChange={() => onChange(q.id, o.label)} />
              <span
                aria-hidden
                className={cn("grid size-6 shrink-0 place-items-center rounded-control border text-sm font-medium", on ? "border-accent bg-accent text-accent-ink" : "border-line-strong text-ink-muted")}
              >
                {o.label}
              </span>
              <span className="pt-0.5 text-md text-ink">{o.text}</span>
            </label>
          );
        })}
      </div>
      <p className="mt-4 hidden text-sm text-ink-muted sm:block">
        Press <Kbd>1</Kbd> to <Kbd>4</Kbd> or <Kbd>A</Kbd> to <Kbd>D</Kbd> to choose.
      </p>
    </fieldset>
  );
}

function Counter({ value, words }: { value: string; words?: boolean }) {
  const near = value.length > MAX_ANSWER_CHARS * 0.9;
  const w = value.trim() ? value.trim().split(/\s+/).length : 0;
  return (
    <p className={cn("mt-2 flex justify-between text-sm", near ? "text-warning" : "text-ink-muted")} aria-live={near ? "polite" : "off"}>
      <span>{words ? `${w} ${w === 1 ? "word" : "words"}` : `${value ? value.split("\n").length : 1} lines`}</span>
      <span>
        {value.length.toLocaleString("en")} of {MAX_ANSWER_CHARS.toLocaleString("en")} characters
      </span>
    </p>
  );
}

function TextAnswer({ question: q, value = "", onChange, disabled }: Props) {
  return (
    <div>
      <label htmlFor={`a-${q.id}`} className="sr-only">
        Your answer
      </label>
      <textarea
        id={`a-${q.id}`}
        value={value}
        disabled={disabled}
        maxLength={MAX_ANSWER_CHARS}
        rows={10}
        spellCheck
        placeholder="Write your answer"
        onChange={(e) => onChange(q.id, e.target.value)}
        className="w-full resize-y rounded-control border border-line-strong bg-surface px-3.5 py-3 text-md text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none disabled:opacity-60"
      />
      <Counter value={value} words />
    </div>
  );
}

function CodeAnswer({ question: q, value, onChange, disabled }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const escaped = useRef(false);
  const code = value ?? q.code_starter ?? "";
  return (
    <div>
      <label htmlFor={`a-${q.id}`} className="sr-only">
        Your code
      </label>
      <textarea
        id={`a-${q.id}`}
        ref={ref}
        value={code}
        disabled={disabled}
        maxLength={MAX_ANSWER_CHARS}
        rows={16}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        onChange={(e) => onChange(q.id, e.target.value)}
        onKeyDown={(e) => {
          // Tab indents (two spaces) instead of leaving the editor. Esc then Tab moves focus on,
          // so keyboard users are never trapped here.
          if (e.key === "Escape") {
            escaped.current = true;
            return;
          }
          if (e.key !== "Tab" || e.shiftKey || disabled || escaped.current) {
            escaped.current = false;
            return;
          }
          e.preventDefault();
          const ta = e.currentTarget;
          const { selectionStart: s, selectionEnd: end } = ta;
          const next = `${code.slice(0, s)}  ${code.slice(end)}`.slice(0, MAX_ANSWER_CHARS);
          onChange(q.id, next);
          requestAnimationFrame(() => ref.current?.setSelectionRange(s + 2, s + 2));
        }}
        className="w-full resize-y rounded-control border border-line-strong bg-sunken px-3.5 py-3 font-mono text-sm leading-6 text-ink focus:border-accent focus:outline-none disabled:opacity-60"
      />
      <Counter value={code} />
      <p className="mt-1 text-sm text-ink-muted">
        <Kbd>Tab</Kbd> indents. Press <Kbd>Esc</Kbd> then <Kbd>Tab</Kbd> to leave the editor.
      </p>
    </div>
  );
}
