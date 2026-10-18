"use client";

import { useState } from "react";
import { CheckCircle, Pencil, Save } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { evaluationApi } from "@/lib/api/evaluation";
import type { Evaluation, QuestionFeedback } from "@/types/evaluation";

type AdminScoreOverrideProps = {
  feedback: QuestionFeedback;
  attemptId: string;
  onUpdate: (updated: Evaluation) => void;
};

export function AdminScoreOverride({ feedback: fb, attemptId, onUpdate }: AdminScoreOverrideProps) {
  const [adminScore, setAdminScore] = useState<string>(
    fb.admin_awarded_score !== null && fb.admin_awarded_score !== undefined
      ? String(fb.admin_awarded_score)
      : ""
  );
  const [savingScore, setSavingScore] = useState(false);
  const [scoreSaved, setScoreSaved] = useState(false);
  const hasAdminScore = fb.admin_awarded_score !== null && fb.admin_awarded_score !== undefined;

  async function handleSaveScore() {
    const parsed = adminScore === "" ? null : parseInt(adminScore, 10);
    if (adminScore !== "" && (isNaN(parsed!) || parsed! < 0 || parsed! > fb.max_score)) return;
    setSavingScore(true);
    try {
      const result = await evaluationApi.setQuestionScore(attemptId, {
        question_feedback_id: fb.id,
        admin_score: parsed,
      });
      if (result.success) {
        onUpdate(result.data);
        setScoreSaved(true);
        setTimeout(() => setScoreSaved(false), 2000);
      }
    } finally {
      setSavingScore(false);
    }
  }

  async function handleClearScore() {
    setAdminScore("");
    setSavingScore(true);
    try {
      const result = await evaluationApi.setQuestionScore(attemptId, {
        question_feedback_id: fb.id,
        admin_score: null,
      });
      if (result.success) onUpdate(result.data);
    } finally {
      setSavingScore(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900 print:hidden">
      <div className="flex items-center gap-2 mb-2.5">
        <Pencil className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-900 dark:text-white">Admin Question Score</p>
        {hasAdminScore && (
          <Badge variant="purple" className="text-[10px]">
            Active: {fb.admin_awarded_score}/{fb.max_score}
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-2.5">
        <input
          type="number"
          min={0}
          max={fb.max_score}
          value={adminScore}
          onChange={(e) => setAdminScore(e.target.value)}
          placeholder={`0 - ${fb.max_score}`}
          className="w-24 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 shadow-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
        />
        <span className="text-xs font-medium text-slate-400">/ {fb.max_score}</span>
        <Button
          size="sm"
          variant={scoreSaved ? "secondary" : "primary"}
          onClick={handleSaveScore}
          loading={savingScore}
          leftIcon={scoreSaved ? <CheckCircle className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
        >
          {scoreSaved ? "Saved" : "Save"}
        </Button>
        {hasAdminScore && (
          <button
            type="button"
            onClick={handleClearScore}
            disabled={savingScore}
            className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-white underline underline-offset-2 transition-colors disabled:opacity-50"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
