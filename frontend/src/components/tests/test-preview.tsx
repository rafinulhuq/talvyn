"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/cn";
import { QUESTION_TYPE_LABEL, plural, sortQuestions } from "@/lib/domain/test";
import type { Test } from "@/types/test";

/**
 * The test as a candidate sees it, one question at a time. Answers stay in
 * this page only; nothing is submitted. "Show answers" adds the reviewer view.
 */
export function TestPreview({ test }: { test: Test }) {
  const qs = sortQuestions(test.questions);
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [reveal, setReveal] = useState(false);
  const q = qs[i];
  if (!q) return <p className="text-base text-ink-muted">This test has no questions to preview.</p>;
  const answered = qs.filter((x) => answers[x.id]?.trim()).length;
  const set = (v: string) => setAnswers((a) => ({ ...a, [q.id]: v }));

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
      <article aria-labelledby="pq-title" className="rounded-panel border border-line bg-surface">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-3.5">
          <h2 id="pq-title" className="text-base font-medium text-ink">
            Question {i + 1} of {qs.length}
          </h2>
          <span className="text-sm text-ink-muted">
            {QUESTION_TYPE_LABEL[q.question_type].one}, {plural(q.marks, "mark")}
          </span>
        </header>
        <div className="px-6 py-6">
          <p className="max-w-[68ch] whitespace-pre-wrap text-md text-ink">{q.question_text}</p>

          {q.question_type === "MCQ" && (
            <fieldset className="mt-5 flex flex-col gap-2">
              <legend className="sr-only">Choose one answer</legend>
              {(q.options ?? []).map((o) => {
                const chosen = answers[q.id] === o.label;
                const right = reveal && o.is_correct;
                return (
                  <label
                    key={o.label}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-control border px-4 py-3 text-base transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent",
                      right ? "border-success/50 bg-success-soft" : chosen ? "border-accent bg-accent-soft/50" : "border-line-strong hover:bg-sunken",
                    )}
                  >
                    <input type="radio" name={`pq-${q.id}`} className="mt-1 accent-[var(--accent)]" checked={chosen} onChange={() => set(o.label)} />
                    <span className="flex-1 text-ink">{o.text}</span>
                    {right && <span className="text-sm font-medium text-success">Correct</span>}
                  </label>
                );
              })}
            </fieldset>
          )}

          {q.question_type === "OPEN_ENDED" && (
            <Textarea aria-label="Your answer" rows={8} className="mt-5" value={answers[q.id] ?? ""} onChange={(e) => set(e.target.value)} placeholder="Type your answer" />
          )}

          {q.question_type === "CODE" && (
            <Textarea
              aria-label="Your code"
              rows={12}
              spellCheck={false}
              className="mt-5 font-mono text-sm"
              value={answers[q.id] ?? q.code_starter ?? ""}
              onChange={(e) => set(e.target.value)}
            />
          )}

          {reveal && (q.explanation || q.expected_answer || q.scoring_rubric) && (
            <div className="mt-5 rounded-control border border-line bg-sunken p-4 text-base">
              <p className="text-sm font-medium text-ink-muted">Reviewer notes. Candidates never see this.</p>
              {q.expected_answer && <p className="mt-2 whitespace-pre-wrap text-ink">{q.expected_answer}</p>}
              {q.scoring_rubric && <p className="mt-2 whitespace-pre-wrap text-ink-muted">{q.scoring_rubric}</p>}
              {q.explanation && <p className="mt-2 whitespace-pre-wrap text-ink">{q.explanation}</p>}
            </div>
          )}
        </div>
        <footer className="flex items-center justify-between border-t border-line px-6 py-3">
          <Button variant="secondary" disabled={i === 0} onClick={() => setI(i - 1)}>
            <ChevronLeft aria-hidden className="size-4" /> Previous
          </Button>
          <Button variant="primary" disabled={i === qs.length - 1} onClick={() => setI(i + 1)}>
            Next <ChevronRight aria-hidden className="size-4" />
          </Button>
        </footer>
      </article>

      <aside className="flex flex-col gap-4 rounded-panel border border-line bg-surface p-4 lg:sticky lg:top-6">
        <label className="flex items-center justify-between gap-3 text-base text-ink">
          Show answers
          <Switch checked={reveal} onCheckedChange={setReveal} />
        </label>
        <div>
          <p className="text-sm text-ink-muted">
            {answered} of {qs.length} answered
          </p>
          <ol aria-label="Questions" className="mt-2 grid grid-cols-6 gap-1.5">
            {qs.map((x, n) => (
              <li key={x.id}>
                <button
                  type="button"
                  aria-label={`Question ${n + 1}${answers[x.id]?.trim() ? ", answered" : ""}`}
                  aria-current={n === i ? "step" : undefined}
                  onClick={() => setI(n)}
                  className={cn(
                    "grid h-8 w-full place-items-center rounded-control border text-sm",
                    n === i ? "border-accent bg-accent text-accent-ink" : answers[x.id]?.trim() ? "border-accent/40 bg-accent-soft text-accent-soft-ink" : "border-line text-ink-muted hover:bg-sunken",
                  )}
                >
                  {n + 1}
                </button>
              </li>
            ))}
          </ol>
        </div>
        <p className="text-sm text-ink-muted">This is a preview. Nothing you enter is saved or scored.</p>
      </aside>
    </div>
  );
}
