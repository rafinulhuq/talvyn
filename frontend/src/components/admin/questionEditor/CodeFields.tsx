import type { Dispatch } from "react";
import type { Question } from "@/types/test";
import { FieldBlock } from "./FieldBlock";
import type { DraftAction } from "./questionDraft";

interface Props {
  question: Question;
  editing: boolean;
  codeLanguage: string;
  codeStarter: string;
  dispatchDraft: Dispatch<DraftAction>;
}

export function CodeFields({ question, editing, codeLanguage, codeStarter, dispatchDraft }: Props) {
  return (
    <>
      <FieldBlock label="Language" htmlFor="question-code-language">
        {editing ? (
          <input
            id="question-code-language"
            type="text"
            value={codeLanguage}
            onChange={(e) => dispatchDraft({ type: "setField", field: "codeLanguage", value: e.target.value })}
            placeholder="e.g. python, javascript"
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
          />
        ) : (
          <p className="text-sm text-slate-600">{question.code_language ?? "—"}</p>
        )}
      </FieldBlock>

      <FieldBlock label="Starter Code">
        {editing ? (
          <textarea
            value={codeStarter}
            onChange={(e) => dispatchDraft({ type: "setField", field: "codeStarter", value: e.target.value })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400 resize-none"
            rows={4}
          />
        ) : question.code_starter ? (
          <pre className="whitespace-pre-wrap rounded-lg bg-white px-3 py-2 text-sm font-mono text-slate-700 dark:bg-slate-900 dark:text-slate-300">
            {question.code_starter}
          </pre>
        ) : (
          <p className="text-sm text-slate-600">—</p>
        )}
      </FieldBlock>
    </>
  );
}
