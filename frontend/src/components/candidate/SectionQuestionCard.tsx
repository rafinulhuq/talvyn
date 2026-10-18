"use client";

import { MCQQuestion } from "@/components/candidate/MCQQuestion";
import { OpenEndedQuestion } from "@/components/candidate/OpenEndedQuestion";
import { CodeQuestion } from "@/components/candidate/CodeQuestion";
import type { QuestionForCandidate } from "@/types/attempt";

type SectionQuestionCardProps = {
  question: QuestionForCandidate;
  answer: string | undefined;
  onChange: (questionId: string, value: string) => void;
  disabled: boolean;
  index: number;
};

export function SectionQuestionCard({ question, answer, onChange, disabled, index }: SectionQuestionCardProps) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-6 sm:p-8 my-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
      {question.question_type === "MCQ" ? (
        <MCQQuestion
          question={question}
          selectedOption={answer ?? null}
          onChange={onChange}
          disabled={disabled}
          index={index}
        />
      ) : question.question_type === "CODE" ? (
        <CodeQuestion
          question={question}
          value={answer ?? (question.code_starter ?? "")}
          onChange={onChange}
          disabled={disabled}
          index={index}
        />
      ) : (
        <OpenEndedQuestion
          question={question}
          value={answer ?? ""}
          onChange={onChange}
          disabled={disabled}
          index={index}
        />
      )}
    </div>
  );
}
