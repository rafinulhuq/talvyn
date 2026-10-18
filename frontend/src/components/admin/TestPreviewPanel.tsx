/**
 * TestPreviewPanel
 *
 * Renders the test questions exactly as a candidate will see them,
 * with a "Show answers" toggle that reveals:
 *   MCQ: the correct option (green) + explanation
 *   Open-ended: expected answer + scoring rubric
 *   Code: evaluation notes / explanation
 *
 * Answers typed/selected here are local state only — nothing is submitted.
 */

"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Eye, EyeOff, Info } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { MCQQuestion } from "@/components/candidate/MCQQuestion";
import { OpenEndedQuestion } from "@/components/candidate/OpenEndedQuestion";
import { CodeQuestion } from "@/components/candidate/CodeQuestion";
import { sortQuestions } from "@/lib/questionSort";
import type { Test, Question } from "@/types/test";
import type { QuestionForCandidate } from "@/types/attempt";

type CandidateDifficulty = QuestionForCandidate["difficulty"];

function toCandidateDifficulty(difficulty: Question["difficulty"]): CandidateDifficulty {
  return difficulty === "MIXED" ? "MEDIUM" : difficulty;
}

// Strip answer key fields — produce what candidates actually see
function toCandidate(q: Question): QuestionForCandidate {
  return {
    id: q.id,
    question_type: q.question_type,
    question_text: q.question_text,
    skill_tested: q.skill_tested,
    difficulty: toCandidateDifficulty(q.difficulty),
    marks: q.marks,
    order_index: q.order_index,
    // Strip is_correct from options
    options: q.options
      ? q.options.map(({ label, text }) => ({ label, text }))
      : null,
    code_language: q.code_language,
    code_starter: q.code_starter,
  };
}

interface TestPreviewPanelProps {
  test: Test;
}

export function TestPreviewPanel({ test }: TestPreviewPanelProps) {
  const questions = sortQuestions(test.questions);
  const candidateQuestions = questions.map(toCandidate);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [showAnswer, setShowAnswer] = useState(false);

  const current = candidateQuestions[currentIndex];
  const currentAdmin = questions[currentIndex];
  const answeredCount = Object.keys(answers).filter((id) =>
    candidateQuestions.some((q) => q.id === id)
  ).length;

  function handleChange(questionId: string, value: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }

  function goTo(index: number) {
    setCurrentIndex(index);
    setShowAnswer(false);
  }

  const canPrev = currentIndex > 0;
  const canNext = currentIndex < questions.length - 1;

  return (
    <div className="flex flex-col gap-5">
      {/* Preview mode banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/70 dark:text-indigo-400">
            <Eye className="h-4 w-4" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">Candidate Preview Cockpit</p>
            <p className="text-[11px] font-normal text-slate-500 dark:text-slate-400">
              Exact simulation of candidate exam HUD. Answers are local only.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowAnswer((v) => !v)}
          className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all shadow-xs ${
            showAnswer
              ? "bg-indigo-600 text-white hover:bg-indigo-700"
              : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          }`}
        >
          {showAnswer ? (
            <>
              <EyeOff className="h-3.5 w-3.5" />
              Hide Answer Key
            </>
          ) : (
            <>
              <Eye className="h-3.5 w-3.5" />
              Show Answer Key
            </>
          )}
        </button>
      </div>

      {/* Progress */}
      <div className="flex items-center justify-between text-xs font-medium text-slate-600 dark:text-slate-400">
        <span>
          Question {currentIndex + 1} of {questions.length}
        </span>
        <span className="font-semibold text-slate-900 dark:text-slate-100">{answeredCount} / {questions.length} answered</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className="h-full rounded-full bg-indigo-600 transition-[width] duration-200 dark:bg-indigo-500"
          style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
        />
      </div>

      {/* Question */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
          <span
            className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase ${
              current.difficulty === "EASY"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-400"
                : current.difficulty === "HARD"
                ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800/60 dark:bg-rose-950/40 dark:text-rose-400"
                : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-400"
            }`}
          >
            {current.difficulty}
          </span>
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
            {current.marks} mark{current.marks !== 1 ? "s" : ""}
          </span>
        </div>

        {current.question_type === "MCQ" ? (
          <MCQQuestion
            question={current}
            selectedOption={answers[current.id] ?? null}
            onChange={handleChange}
            index={currentIndex}
          />
        ) : current.question_type === "CODE" ? (
          <CodeQuestion
            question={current}
            value={answers[current.id] ?? ""}
            onChange={handleChange}
            index={currentIndex}
          />
        ) : (
          <OpenEndedQuestion
            question={current}
            value={answers[current.id] ?? ""}
            onChange={handleChange}
            index={currentIndex}
          />
        )}

        {/* Answer key overlay */}
        {showAnswer && <AnswerKey question={currentAdmin} />}
      </div>

      {/* Navigation */}
      <div className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <Button
          variant="outline"
          size="sm"
          disabled={!canPrev}
          onClick={() => goTo(currentIndex - 1)}
          leftIcon={<ChevronLeft className="h-4 w-4" />}
        >
          Previous
        </Button>

        {/* Question block-nav */}
        <div className="flex flex-1 flex-wrap justify-center gap-1.5">
          {questions.map((q, i) => (
            <button
              key={q.id}
              type="button"
              onClick={() => goTo(i)}
              className={`h-8 w-8 rounded-lg text-xs font-semibold transition-all ${
                i === currentIndex
                  ? "bg-indigo-600 text-white shadow-xs"
                  : answers[candidateQuestions[i].id]
                    ? "border border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/70 dark:text-indigo-300"
                    : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              {i + 1}
            </button>
          ))}
        </div>

        <Button
          variant="outline"
          size="sm"
          disabled={!canNext}
          onClick={() => goTo(currentIndex + 1)}
          rightIcon={<ChevronRight className="h-4 w-4" />}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

// ── Answer key ────────────────────────────────────────────────

function AnswerKey({ question }: { question: Question }) {
  if (question.question_type === "MCQ") {
    const correct = question.options?.find((o) => o.is_correct);
    return (
      <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/30">
        <div className="mb-2 flex items-center gap-1.5">
          <Info className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
          <p className="text-xs font-bold uppercase tracking-wider text-emerald-900 dark:text-emerald-300">Correct Answer Key</p>
        </div>
        <p className="text-xs font-semibold text-emerald-950 dark:text-emerald-100">
          {correct ? `${correct.label}. ${correct.text}` : (question.correct_answer ?? "—")}
        </p>
        {question.explanation && (
          <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">{question.explanation}</p>
        )}
      </div>
    );
  }

  if (question.question_type === "OPEN_ENDED") {
    return (
      <div className="mt-5 flex flex-col gap-2 rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 dark:border-indigo-900/60 dark:bg-indigo-950/30">
        <p className="text-xs font-bold uppercase tracking-wider text-indigo-900 dark:text-indigo-300">Expected Answer / Rubric</p>
        {question.expected_answer && (
          <p className="text-xs whitespace-pre-wrap text-slate-800 dark:text-slate-200">{question.expected_answer}</p>
        )}
        {question.scoring_rubric && (
          <div className="mt-2 border-t border-indigo-200/60 pt-2 dark:border-indigo-900/60">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-400">
              Scoring Rubric
            </p>
            <p className="text-xs whitespace-pre-wrap text-slate-700 dark:text-slate-300">{question.scoring_rubric}</p>
          </div>
        )}
        {!question.expected_answer && !question.scoring_rubric && (
          <p className="text-xs italic text-slate-500">No expected answer or rubric defined.</p>
        )}
      </div>
    );
  }

  // CODE
  return (
    <div className="mt-5 rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 dark:border-indigo-900/60 dark:bg-indigo-950/30">
      <p className="mb-2 text-xs font-bold uppercase tracking-wider text-indigo-900 dark:text-indigo-300">Evaluation Notes</p>
      {question.explanation ? (
        <p className="text-xs whitespace-pre-wrap leading-relaxed text-slate-800 dark:text-slate-200">{question.explanation}</p>
      ) : (
        <p className="text-xs italic text-slate-500">No evaluation notes provided.</p>
      )}
    </div>
  );
}
