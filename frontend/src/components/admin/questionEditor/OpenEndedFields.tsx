import type { Dispatch } from "react";
import type { Question } from "@/types/test";
import { FieldBlock } from "./FieldBlock";
import type { DraftAction } from "./questionDraft";

interface Props {
  question: Question;
  editing: boolean;
  expectedAnswer: string;
  scoringRubric: string;
  dispatchDraft: Dispatch<DraftAction>;
}

export function OpenEndedFields({ question, editing, expectedAnswer, scoringRubric, dispatchDraft }: Props) {
  return (
    <>
      <FieldBlock label="Expected Answer">
        {editing ? (
          <textarea
            value={expectedAnswer}
            onChange={(e) => dispatchDraft({ type: "setField", field: "expectedAnswer", value: e.target.value })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400 resize-none"
            rows={4}
          />
        ) : (
          <p className="text-sm text-slate-600">{question.expected_answer}</p>
        )}
      </FieldBlock>

      <FieldBlock label="Scoring Rubric">
        {editing ? (
          <textarea
            value={scoringRubric}
            onChange={(e) => dispatchDraft({ type: "setField", field: "scoringRubric", value: e.target.value })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400 resize-none"
            rows={3}
          />
        ) : (
          <p className="text-sm text-slate-600">{question.scoring_rubric}</p>
        )}
      </FieldBlock>
    </>
  );
}
