"use client";

import { Check, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { DIFFICULTY_LABEL, QUESTION_TYPE_LABEL, plural, sortQuestions } from "@/lib/domain/test";
import type { Question, QuestionType } from "@/types/test";
import { useInUseGuard } from "./in-use-confirm";
import { QuestionEditor } from "./question-editor";

const TYPES: QuestionType[] = ["MCQ", "OPEN_ENDED", "CODE"];

export function QuestionList({ testId, questions }: { testId: string; questions: Question[] }) {
  const router = useRouter();
  const sorted = useMemo(() => sortQuestions(questions), [questions]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [answers, setAnswers] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const { guard, dialog } = useInUseGuard();

  // Drop selections for questions that no longer exist (after a delete or regenerate).
  const live = new Set(sorted.map((q) => q.id));
  const picked = [...selected].filter((id) => live.has(id));

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  async function remove() {
    setBusy(true);
    const ids = picked;
    const run = (force: boolean) =>
      api<{ deleted_count: number }>(`/api/v1/tests/${testId}/questions/bulk-delete`, { method: "POST", body: { question_ids: ids, force } });
    const done = (n: number) => {
      toast({ title: n === 1 ? "Question deleted" : `${n} questions deleted` });
      setSelected(new Set());
      router.refresh();
    };
    const res = await guard(run, (r) => (r.ok ? done(r.data.deleted_count) : toast({ title: "Couldn't delete", description: r.error.message, tone: "danger" })));
    setBusy(false);
    setConfirm(false);
    if (res === null) return;
    if (!res.ok) return toast({ title: "Couldn't delete", description: res.error.message, tone: "danger" });
    done(res.data.deleted_count);
  }

  if (sorted.length === 0) {
    return (
      <div className="rounded-panel border border-line bg-surface">
        <EmptyState title="This test has no questions" description="Regenerate the questions from the menu above, or delete the test." />
      </div>
    );
  }

  const editingIndex = sorted.findIndex((q) => q.id === editing);

  return (
    <section aria-label="Questions" className="flex flex-col gap-4">
      <div className="sticky top-0 z-10 -mx-1 flex min-h-11 flex-wrap items-center gap-3 bg-canvas px-1 py-1.5">
        {picked.length > 0 ? (
          <>
            <span className="text-base font-medium text-ink">{picked.length} selected</span>
            <Button size="sm" variant="secondary" onClick={() => setConfirm(true)}>
              <Trash2 aria-hidden className="size-3.5" /> Delete
            </Button>
            <button type="button" className="text-sm text-ink-muted hover:text-ink" onClick={() => setSelected(new Set())}>
              Clear selection
            </button>
          </>
        ) : (
          <h2 className="text-md font-medium text-ink">{plural(sorted.length, "question")}</h2>
        )}
        <label className="ml-auto flex items-center gap-2 text-sm text-ink-muted">
          <Switch checked={answers} onCheckedChange={setAnswers} />
          Show answers
        </label>
      </div>

      {TYPES.map((type) => {
        const group = sorted.filter((q) => q.question_type === type);
        if (!group.length) return null;
        const marks = group.reduce((s, q) => s + q.marks, 0);
        return (
          <div key={type} className="flex flex-col gap-2">
            <h3 className="flex items-baseline justify-between text-sm text-ink-muted">
              <span>
                <span className="font-medium text-ink">{QUESTION_TYPE_LABEL[type].many}</span> ({group.length})
              </span>
              <span>{plural(marks, "mark")}</span>
            </h3>
            <ol className="flex flex-col gap-2">
              {group.map((q) => {
                const n = sorted.indexOf(q) + 1;
                const isSel = picked.includes(q.id);
                return (
                  <li
                    key={q.id}
                    className={cn("rounded-panel border bg-surface p-4 transition-colors", isSel ? "border-accent/50 bg-accent-soft/30" : "border-line")}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        aria-label={`Select question ${n}`}
                        checked={isSel}
                        onChange={() => toggle(q.id)}
                        className="mt-1 size-4 cursor-pointer accent-[var(--accent)]"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-ink">Question {n}</span>
                          <Badge>{DIFFICULTY_LABEL[q.difficulty]}</Badge>
                          <Badge>{plural(q.marks, "mark")}</Badge>
                          {q.skill_tested && <span className="truncate text-sm text-ink-muted">{q.skill_tested}</span>}
                          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setEditing(q.id)}>
                            <Pencil aria-hidden className="size-3.5" /> Edit
                          </Button>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-md text-ink">{q.question_text}</p>
                        <QuestionBody q={q} answers={answers} />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        );
      })}

      <QuestionEditor question={sorted[editingIndex] ?? null} number={editingIndex + 1} onClose={() => setEditing(null)} />

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent
          title={`Delete ${plural(picked.length, "question")}?`}
          description="The test's total marks are recalculated. This can't be undone."
          footer={
            <>
              <DialogClose asChild>
                <Button variant="ghost">Keep them</Button>
              </DialogClose>
              <Button variant="danger" loading={busy} onClick={() => void remove()}>
                Delete
              </Button>
            </>
          }
        />
      </Dialog>
      {dialog}
    </section>
  );
}

function QuestionBody({ q, answers }: { q: Question; answers: boolean }) {
  if (q.question_type === "MCQ") {
    return (
      <ul className="mt-3 flex flex-col gap-1.5">
        {(q.options ?? []).map((o) => {
          const right = answers && o.is_correct;
          return (
            <li
              key={o.label}
              className={cn("flex items-start gap-2.5 rounded-control border px-3 py-2 text-base", right ? "border-success/40 bg-success-soft" : "border-line")}
            >
              <span className={cn("w-4 shrink-0 font-medium", right ? "text-success" : "text-ink-muted")}>{o.label}</span>
              <span className="flex-1 text-ink">{o.text}</span>
              {right && (
                <span className="inline-flex items-center gap-1 text-sm font-medium text-success">
                  <Check aria-hidden className="size-3.5" /> Correct
                </span>
              )}
            </li>
          );
        })}
        {answers && q.explanation && <li className="mt-1 text-sm text-ink-muted">{q.explanation}</li>}
      </ul>
    );
  }
  if (q.question_type === "CODE") {
    return (
      <>
        {q.code_starter && (
          <pre className="mt-3 overflow-x-auto rounded-control border border-line bg-sunken p-3 font-mono text-sm text-ink">
            <code>{q.code_starter}</code>
          </pre>
        )}
        {q.code_language && <p className="mt-2 text-sm text-ink-muted">Language: {q.code_language}</p>}
        {answers && q.explanation && <p className="mt-2 text-sm text-ink-muted">{q.explanation}</p>}
      </>
    );
  }
  if (!answers) return null;
  return (
    <dl className="mt-3 grid gap-3 rounded-control bg-sunken p-3 text-base sm:grid-cols-2">
      <div>
        <dt className="text-sm font-medium text-ink-muted">Model answer</dt>
        <dd className="mt-1 whitespace-pre-wrap text-ink">{q.expected_answer || "Not provided"}</dd>
      </div>
      <div>
        <dt className="text-sm font-medium text-ink-muted">Scoring guide</dt>
        <dd className="mt-1 whitespace-pre-wrap text-ink">{q.scoring_rubric || "Not provided"}</dd>
      </div>
    </dl>
  );
}
