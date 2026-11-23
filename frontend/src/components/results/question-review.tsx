"use client";

import { Check, Pencil, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import type { QuestionFeedback } from "@/types/evaluation";

const TYPE: Record<string, string> = { MCQ: "Multiple choice", OPEN_ENDED: "Written answer", CODE: "Code" };

export function QuestionReview({ attemptId, fb, number }: { attemptId: string; fb: QuestionFeedback; number: number }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(fb.admin_awarded_score ?? fb.awarded_score));
  const [busy, setBusy] = useState(false);
  const effective = fb.admin_awarded_score ?? fb.awarded_score;
  const overridden = fb.admin_awarded_score != null;

  async function save(score: number | null) {
    setBusy(true);
    const res = await api(`/api/v1/evaluation/${attemptId}/question-score`, { method: "PATCH", body: { question_feedback_id: fb.id, admin_score: score } });
    setBusy(false);
    if (!res.ok) return toast({ title: "Score not saved", description: res.error.message, tone: "danger" });
    setEditing(false);
    toast({ title: score === null ? "Back to the AI's score" : "Score changed", description: "Totals were recalculated.", tone: "success" });
    router.refresh();
  }

  const n = Number(value);
  const valid = value.trim() !== "" && Number.isInteger(n) && n >= 0 && n <= fb.max_score;

  return (
    <article className="rounded-panel border border-line bg-surface p-5">
      <header className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-ink">Question {number}</span>
        <span className="text-sm text-ink-muted">{TYPE[fb.question_type] ?? fb.question_type}</span>
        <span className="ml-auto flex items-center gap-2">
          {editing ? (
            <span data-print="hide" className="flex items-center gap-1.5">
              <Input aria-label={`Score for question ${number}`} type="number" min={0} max={fb.max_score} value={value} onChange={(e) => setValue(e.target.value)} className="h-7 w-16" />
              <span className="text-sm text-ink-muted">of {fb.max_score}</span>
              <Button size="sm" variant="primary" disabled={!valid} loading={busy} onClick={() => void save(n)} aria-label="Save score">
                <Check aria-hidden className="size-3.5" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)} aria-label="Cancel">
                <X aria-hidden className="size-3.5" />
              </Button>
            </span>
          ) : (
            <>
              <span className={cn("text-base font-medium tabular-nums", effective === fb.max_score ? "text-success" : effective === 0 ? "text-danger" : "text-ink")}>
                {effective} of {fb.max_score}
              </span>
              {overridden && <Badge tone="accent">Changed by reviewer</Badge>}
              <Button data-print="hide" size="sm" variant="ghost" onClick={() => setEditing(true)} aria-label={`Change the score for question ${number}`}>
                <Pencil aria-hidden className="size-3.5" />
              </Button>
            </>
          )}
        </span>
      </header>
      {fb.question_text && <p className="mt-3 max-w-[72ch] whitespace-pre-wrap text-md text-ink">{fb.question_text}</p>}

      {fb.question_type === "MCQ" && fb.question_options ? (
        <ul className="mt-3 flex flex-col gap-1.5">
          {fb.question_options.map((o) => {
            const right = o.label === fb.correct_answer;
            const chosen = o.label === fb.candidate_answer;
            return (
              <li key={o.label} className={cn("flex items-start gap-2.5 rounded-control border px-3 py-2 text-base", right ? "border-success/40 bg-success-soft" : chosen ? "border-danger/40 bg-danger-soft" : "border-line")}>
                <span className="w-4 shrink-0 font-medium text-ink-muted">{o.label}</span>
                <span className="flex-1 text-ink">{o.text}</span>
                {chosen && <span className={cn("text-sm font-medium", right ? "text-success" : "text-danger")}>Their answer</span>}
                {right && !chosen && <span className="text-sm text-success">Correct</span>}
              </li>
            );
          })}
          {!fb.candidate_answer && <li className="text-sm text-ink-muted">Not answered.</li>}
        </ul>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          <div className={cn("rounded-control border border-line bg-sunken p-3 text-base", fb.question_type === "CODE" && "font-mono text-sm")}>
            <p className="mb-1 font-sans text-sm text-ink-muted">Their answer</p>
            <p className="whitespace-pre-wrap text-ink">{fb.candidate_answer?.trim() || "Not answered."}</p>
          </div>
          {fb.ai_feedback && (
            <div>
              <p className="text-sm font-medium text-ink">AI feedback</p>
              <p className="mt-1 text-base text-ink-muted">{fb.ai_feedback}</p>
            </div>
          )}
          {(fb.matched_criteria.length > 0 || fb.missed_criteria.length > 0) && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Criteria title="Covered" items={fb.matched_criteria} tone="success" />
              <Criteria title="Missed" items={fb.missed_criteria} tone="danger" />
            </div>
          )}
          {fb.estimated_ai_percentage != null && (
            <p className="text-sm text-ink-muted">
              Estimated AI-written: <span className="font-medium text-ink">{Math.round(fb.estimated_ai_percentage)}%</span>
              {fb.ai_detection_confidence ? `, ${fb.ai_detection_confidence.toLowerCase()} confidence` : ""}. An estimate to prompt a conversation, not proof.
            </p>
          )}
        </div>
      )}
      {overridden && (
        <button data-print="hide" type="button" className="mt-3 text-sm text-ink-muted hover:text-ink" disabled={busy} onClick={() => void save(null)}>
          Restore the AI&apos;s score ({fb.awarded_score} of {fb.max_score})
        </button>
      )}
    </article>
  );
}

function Criteria({ title, items, tone }: { title: string; items: string[]; tone: "success" | "danger" }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="text-sm font-medium text-ink">{title}</p>
      <ul className="mt-1 flex flex-col gap-1">
        {items.map((c) => (
          <li key={c} className="flex gap-2 text-base text-ink-muted">
            <span aria-hidden className={cn("mt-2 size-1.5 shrink-0 rounded-full", tone === "success" ? "bg-success" : "bg-danger")} />
            {c}
          </li>
        ))}
      </ul>
    </div>
  );
}
