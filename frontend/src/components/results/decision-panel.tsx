"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { RECOMMENDATION } from "@/lib/domain/invitation";
import type { Recommendation } from "@/types/invitation";

const ORDER: Recommendation[] = ["STRONG_HIRE", "HIRE", "MAYBE", "NO_HIRE"];

/** The reviewer's call. The AI suggestion is kept and shown alongside; it's never overwritten. */
export function DecisionPanel({ attemptId, ai, override, notes }: { attemptId: string; ai: Recommendation; override: Recommendation | null; notes: string | null }) {
  const router = useRouter();
  const [pick, setPick] = useState<Recommendation | null>(override);
  const [text, setText] = useState(notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const dirty = pick !== override || text !== (notes ?? "");

  async function save() {
    setBusy(true);
    setError(undefined);
    const res = await api(`/api/v1/evaluation/${attemptId}/override`, { method: "PATCH", body: { recommendation: pick, notes: text.trim() } });
    setBusy(false);
    if (!res.ok) return setError(res.error.message);
    toast({ title: "Decision saved", tone: "success" });
    router.refresh();
  }

  return (
    <div data-print="hide" className="flex flex-col gap-4">
      <fieldset>
        <legend className="text-sm font-medium text-ink">Your decision</legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {ORDER.map((r) => {
            const on = pick === r;
            return (
              <label
                key={r}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-2 rounded-control border px-3 py-2 text-base has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent",
                  on ? "border-accent bg-accent-soft/60 text-ink" : "border-line-strong text-ink hover:bg-sunken",
                )}
              >
                <input type="radio" name="decision" className="sr-only" checked={on} onChange={() => setPick(r)} />
                {RECOMMENDATION[r].label}
                {r === ai && <span className="text-xs text-ink-muted">AI</span>}
              </label>
            );
          })}
        </div>
        {pick && (
          <button type="button" className="mt-2 text-sm text-ink-muted hover:text-ink" onClick={() => setPick(null)}>
            Clear my decision and use the AI suggestion
          </button>
        )}
      </fieldset>
      <Field label="Notes for the hiring team" optional hint="Private. Never shown to the candidate.">
        <Textarea rows={3} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} />
      </Field>
      {error && <Alert tone="danger">{error}</Alert>}
      <div>
        <Button variant="primary" disabled={!dirty} loading={busy} onClick={() => void save()}>
          Save decision
        </Button>
      </div>
    </div>
  );
}

export function RecommendationBadge({ rec, by }: { rec: Recommendation; by: "ai" | "reviewer" }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Badge tone={RECOMMENDATION[rec].tone} className="h-6 px-2 text-sm">
        {RECOMMENDATION[rec].label}
      </Badge>
      <span className="text-sm text-ink-muted">{by === "reviewer" ? "Reviewer's decision" : "AI suggestion"}</span>
    </span>
  );
}
