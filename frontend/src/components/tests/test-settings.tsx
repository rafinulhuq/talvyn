"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/api/client";
import { DIFFICULTY_LABEL } from "@/lib/domain/test";
import type { Difficulty, Test } from "@/types/test";

type Draft = { title: string; description: string; duration: string; difficulty: Difficulty; passing: string };

const fromTest = (t: Test): Draft => ({
  title: t.title,
  description: t.description ?? "",
  duration: String(t.duration_minutes),
  difficulty: t.difficulty,
  passing: t.passing_marks == null ? "" : String(t.passing_marks),
});

export function TestSettings({ test }: { test: Test }) {
  const router = useRouter();
  const [draft, setDraft] = useState(() => fromTest(test));
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({});
  const [formError, setFormError] = useState<string>();
  const [saving, setSaving] = useState(false);

  // Re-sync when the server copy changes (after save, regenerate or a question edit).
  const [seen, setSeen] = useState(test.updated_at);
  if (seen !== test.updated_at) {
    setSeen(test.updated_at);
    setDraft(fromTest(test));
  }

  const initial = fromTest(test);
  const dirty = (Object.keys(initial) as (keyof Draft)[]).some((k) => initial[k] !== draft[k]);

  function set<K extends keyof Draft>(k: K, v: Draft[K]) {
    setDraft((d) => ({ ...d, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
    setFormError(undefined);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    const duration = Number(draft.duration);
    const passing = draft.passing.trim() === "" ? null : Number(draft.passing);
    if (draft.title.trim().length < 5) next.title = "Use at least 5 characters.";
    if (!Number.isInteger(duration) || duration < 15 || duration > 180) next.duration = "Between 15 and 180 minutes.";
    if (passing !== null && (!Number.isInteger(passing) || passing < 0 || passing > test.total_marks))
      next.passing = `A whole number from 0 to ${test.total_marks}.`;
    if (passing === null && test.passing_marks != null) next.passing = "A pass mark can be changed but not removed.";
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;

    setSaving(true);
    const res = await api<Test>(`/api/v1/tests/${test.id}`, {
      method: "PATCH",
      body: {
        title: draft.title.trim(),
        description: draft.description.trim(),
        duration_minutes: duration,
        difficulty: draft.difficulty,
        ...(passing !== null ? { passing_marks: passing } : {}),
      },
    });
    setSaving(false);
    if (!res.ok) return setFormError(res.error.message);
    toast({ title: "Settings saved", tone: "success" });
    router.refresh();
  }

  return (
    <Panel title="Settings" description="What candidates see before they start, and how they pass.">
      <form onSubmit={save} noValidate className="flex flex-col gap-4">
        {formError && <Alert tone="danger">{formError}</Alert>}
        <Field label="Title" error={errors.title}>
          <Input value={draft.title} onChange={(e) => set("title", e.target.value)} />
        </Field>
        <Field label="Instructions" optional hint="Shown on the start screen.">
          <Textarea rows={3} value={draft.description} onChange={(e) => set("description", e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Time limit" error={errors.duration} hint="Minutes">
            <Input type="number" inputMode="numeric" min={15} max={180} value={draft.duration} onChange={(e) => set("duration", e.target.value)} />
          </Field>
          <Field label="Pass mark" error={errors.passing} hint={`Out of ${test.total_marks}`} optional={test.passing_marks == null}>
            <Input type="number" inputMode="numeric" min={0} max={test.total_marks} value={draft.passing} onChange={(e) => set("passing", e.target.value)} />
          </Field>
        </div>
        <Field label="Overall difficulty">
          <Select value={draft.difficulty} onValueChange={(v) => set("difficulty", v as Difficulty)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(DIFFICULTY_LABEL) as Difficulty[]).map((d) => (
                <SelectItem key={d} value={d}>
                  {DIFFICULTY_LABEL[d]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <div className="flex items-center justify-end gap-2">
          {dirty && (
            <Button type="button" variant="ghost" onClick={() => (setDraft(initial), setErrors({}))}>
              Discard
            </Button>
          )}
          <Button type="submit" variant="primary" disabled={!dirty} loading={saving}>
            Save settings
          </Button>
        </div>
      </form>
    </Panel>
  );
}
