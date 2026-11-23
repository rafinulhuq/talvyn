"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { DIFFICULTY_LABEL, QUESTION_TYPE_LABEL } from "@/lib/domain/test";
import type { Difficulty, OptionLabel, Question } from "@/types/test";

const LABELS: OptionLabel[] = ["A", "B", "C", "D"];
const LEVELS: Difficulty[] = ["EASY", "MEDIUM", "HARD"];

type Draft = {
  text: string;
  skill: string;
  difficulty: Difficulty;
  marks: string;
  options: Record<OptionLabel, string>;
  correct: OptionLabel;
  explanation: string;
  expected: string;
  rubric: string;
  language: string;
  starter: string;
};

function toDraft(q: Question): Draft {
  const options = { A: "", B: "", C: "", D: "" };
  let correct: OptionLabel = LABELS.includes(q.correct_answer as OptionLabel) ? (q.correct_answer as OptionLabel) : "A";
  (q.options ?? []).slice(0, 4).forEach((o, i) => {
    const l = LABELS[i] as OptionLabel;
    options[l] = o.text;
    if (o.is_correct) correct = l;
  });
  return {
    text: q.question_text,
    skill: q.skill_tested ?? "",
    difficulty: q.difficulty === "MIXED" ? "MEDIUM" : q.difficulty,
    marks: String(q.marks),
    options,
    correct,
    explanation: q.explanation ?? "",
    expected: q.expected_answer ?? "",
    rubric: q.scoring_rubric ?? "",
    language: q.code_language ?? "",
    starter: q.code_starter ?? "",
  };
}

/** Side sheet for one question; the list stays visible behind it. */
export function QuestionEditor({ question, number, onClose }: { question: Question | null; number: number; onClose: () => void }) {
  return (
    <Sheet open={question !== null} onOpenChange={(o) => !o && onClose()}>
      {question && (
        <SheetContent title={`Edit question ${number}`} description={QUESTION_TYPE_LABEL[question.question_type].one} className="max-w-2xl">
          {/* Keyed so reopening another question starts from its own values. */}
          <EditorForm key={question.id} question={question} onSaved={onClose} />
        </SheetContent>
      )}
    </Sheet>
  );
}

function EditorForm({ question: q, onSaved }: { question: Question; onSaved: () => void }) {
  const router = useRouter();
  const [d, setD] = useState(() => toDraft(q));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  const [saving, setSaving] = useState(false);

  function set<K extends keyof Draft>(k: K, v: Draft[K]) {
    setD((p) => ({ ...p, [k]: v }));
    setErrors((e) => ({ ...e, [k]: "" }));
    setFormError(undefined);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    const err: Record<string, string> = {};
    const marks = Number(d.marks);
    if (d.text.trim().length < 10) err.text = "Use at least 10 characters.";
    if (!Number.isInteger(marks) || marks < 1 || marks > 20) err.marks = "A whole number from 1 to 20.";
    if (q.question_type === "MCQ") LABELS.forEach((l) => !d.options[l].trim() && (err[`opt${l}`] = "Write this option."));
    setErrors(err);
    if (Object.values(err).some(Boolean)) return;

    const body: Record<string, unknown> = {
      question_text: d.text.trim(),
      skill_tested: d.skill.trim(),
      difficulty: d.difficulty,
      marks,
    };
    if (q.question_type === "MCQ") {
      body.options = LABELS.map((l) => ({ label: l, text: d.options[l].trim(), is_correct: l === d.correct }));
      body.correct_answer = d.correct;
      body.explanation = d.explanation.trim();
    } else if (q.question_type === "OPEN_ENDED") {
      body.expected_answer = d.expected.trim();
      body.scoring_rubric = d.rubric.trim();
    } else {
      body.code_language = d.language.trim();
      body.code_starter = d.starter;
      body.explanation = d.explanation.trim();
    }

    setSaving(true);
    const res = await api<Question>(`/api/v1/tests/questions/${q.id}`, { method: "PATCH", body });
    setSaving(false);
    if (!res.ok) return setFormError(res.error.message);
    toast({ title: "Question saved", tone: "success" });
    onSaved();
    router.refresh();
  }

  return (
    <form onSubmit={save} noValidate className="flex flex-col gap-5">
      {formError && <Alert tone="danger">{formError}</Alert>}
      <Field label="Question" error={errors.text}>
        <Textarea rows={5} value={d.text} onChange={(e) => set("text", e.target.value)} />
      </Field>

      {q.question_type === "MCQ" && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-medium text-ink">Options</legend>
          <p className="-mt-1 mb-1 text-sm text-ink-muted">Select the correct answer.</p>
          {LABELS.map((l) => (
            <div key={l} className="flex items-start gap-3">
              <label
                className={cn(
                  "mt-1 grid size-7 shrink-0 cursor-pointer place-items-center rounded-control border text-sm font-medium has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent",
                  d.correct === l ? "border-success bg-success-soft text-success" : "border-line-strong text-ink-muted hover:bg-sunken",
                )}
              >
                <input type="radio" name={`correct-${q.id}`} className="sr-only" checked={d.correct === l} onChange={() => set("correct", l)} />
                {l}
                <span className="sr-only">{d.correct === l ? ", correct answer" : ", mark as correct"}</span>
              </label>
              <div className="flex-1">
                <Input
                  aria-label={`Option ${l}`}
                  aria-invalid={errors[`opt${l}`] ? true : undefined}
                  value={d.options[l]}
                  onChange={(e) => {
                    setD((p) => ({ ...p, options: { ...p.options, [l]: e.target.value } }));
                    setErrors((er) => ({ ...er, [`opt${l}`]: "" }));
                  }}
                />
                {errors[`opt${l}`] && <p className="mt-1 text-sm text-danger">{errors[`opt${l}`]}</p>}
              </div>
            </div>
          ))}
        </fieldset>
      )}

      {q.question_type === "OPEN_ENDED" && (
        <>
          <Field label="Model answer" hint="What a strong answer covers. Used when scoring.">
            <Textarea rows={5} value={d.expected} onChange={(e) => set("expected", e.target.value)} />
          </Field>
          <Field label="Scoring guide" hint="How marks are awarded.">
            <Textarea rows={4} value={d.rubric} onChange={(e) => set("rubric", e.target.value)} />
          </Field>
        </>
      )}

      {q.question_type === "CODE" && (
        <>
          <Field label="Language">
            <Input value={d.language} onChange={(e) => set("language", e.target.value)} placeholder="python" />
          </Field>
          <Field label="Starter code" optional>
            <Textarea rows={8} className="font-mono text-sm" spellCheck={false} value={d.starter} onChange={(e) => set("starter", e.target.value)} />
          </Field>
        </>
      )}

      {q.question_type !== "OPEN_ENDED" && (
        <Field label="Explanation" optional hint="Shown to reviewers with the answer, never to candidates.">
          <Textarea rows={3} value={d.explanation} onChange={(e) => set("explanation", e.target.value)} />
        </Field>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Skill tested" optional className="sm:col-span-1">
          <Input value={d.skill} onChange={(e) => set("skill", e.target.value)} />
        </Field>
        <Field label="Difficulty">
          <Select value={d.difficulty} onValueChange={(v) => set("difficulty", v as Difficulty)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LEVELS.map((l) => (
                <SelectItem key={l} value={l}>
                  {DIFFICULTY_LABEL[l]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Marks" error={errors.marks}>
          <Input type="number" inputMode="numeric" min={1} max={20} value={d.marks} onChange={(e) => set("marks", e.target.value)} />
        </Field>
      </div>

      <div className="sticky bottom-0 -mx-6 -mb-5 flex justify-end gap-2 border-t border-line bg-surface px-6 py-3">
        <Button type="submit" variant="primary" loading={saving}>
          Save question
        </Button>
      </div>
    </form>
  );
}
