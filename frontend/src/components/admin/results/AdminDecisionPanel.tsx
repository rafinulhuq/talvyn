"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { CheckCircle, Save, Target } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { evaluationApi } from "@/lib/api/evaluation";
import type { AIRecommendation, Evaluation } from "@/types/evaluation";
import { RECOMMENDATION_CONFIG, RECOMMENDATION_THRESHOLDS } from "@/types/evaluation";

const recommendations: AIRecommendation[] = ["STRONG_HIRE", "HIRE", "MAYBE", "NO_HIRE"];

export function AdminDecisionPanel({
  evaluation,
  onUpdate,
}: {
  evaluation: Evaluation;
  onUpdate: (updated: Evaluation) => void;
}) {
  const [rec, setRec] = useState<AIRecommendation | "">(
    evaluation.admin_override_recommendation ?? ""
  );
  const [notes, setNotes] = useState(evaluation.admin_notes ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const result = await evaluationApi.override(evaluation.attempt_id, {
        recommendation: rec || null,
        notes: notes || null,
      });
      if (result.success) {
        onUpdate(result.data);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5 dark:border-slate-800">
        <Target className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-900 dark:text-white">Admin Hiring Decision</p>
      </div>

      <p className="text-xs text-slate-500 leading-relaxed">
        Override the AI recommendation with your team&apos;s final decision.
        The original AI assessment is preserved and visible to reviewers.
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {recommendations.map((recommendation) => {
          const cfg = RECOMMENDATION_CONFIG[recommendation];
          const threshold = RECOMMENDATION_THRESHOLDS[recommendation];
          const isSelected = rec === recommendation;
          return (
            <button
              key={recommendation}
              type="button"
              onClick={() => setRec(isSelected ? "" : recommendation)}
              className={clsx(
                "flex flex-col gap-1 rounded-xl border p-3 text-left transition-all shadow-xs",
                isSelected
                  ? "border-indigo-600 bg-indigo-50/80 text-indigo-900 ring-1 ring-indigo-500/20 dark:border-indigo-500 dark:bg-indigo-950/40 dark:text-indigo-200"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700/60"
              )}
            >
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                <span>{cfg.emoji}</span>
                <span>{cfg.label}</span>
              </div>
              <span className="text-[10px] text-slate-400 font-medium">{threshold.range}</span>
            </button>
          );
        })}
      </div>

      <div>
        <label htmlFor="decision-notes" className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 block">
          Private Decision Notes
        </label>
        <textarea
          id="decision-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add private evaluation notes for the hiring team…"
          rows={3}
          className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 shadow-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
        />
      </div>

      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={handleSave}
          loading={saving}
          leftIcon={
            saved ? (
              <CheckCircle className="h-3.5 w-3.5" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )
          }
          variant="primary"
        >
          {saved ? "Saved" : "Save Decision"}
        </Button>
      </div>
    </div>
  );
}
