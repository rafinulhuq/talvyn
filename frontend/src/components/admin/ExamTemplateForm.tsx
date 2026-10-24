"use client";

import { useState } from "react";
import { z } from "zod";
import { AlertCircle, LayoutTemplate, X } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { examTemplatesApi } from "@/lib/api/examTemplates";
import { SECTION_LABELS, SECTION_ORDER, type ExamTemplate, type SectionType } from "@/types/exam";

const templateSchema = z
  .object({
    name: z.string().min(1, "Name is required").max(255, "Name is too long").trim(),
    description: z.string().max(1000, "Description is too long").trim().optional(),
    mcqTarget: z.coerce.number().int().min(1).max(200),
    cqTarget: z.coerce.number().int().min(1).max(100),
    reasoningWeight: z.coerce.number().min(0).max(100),
    practicalWeight: z.coerce.number().min(0).max(100),
    technicalWeight: z.coerce.number().min(0).max(100),
  })
  .refine(
    (v) => Math.abs(v.reasoningWeight + v.practicalWeight + v.technicalWeight - 100) < 0.5,
    { message: "Section weights must add up to 100%", path: ["reasoningWeight"] }
  );

type FormValues = z.infer<typeof templateSchema>;
type FormErrors = Partial<Record<keyof FormValues, string>>;

const WEIGHT_FIELD: Record<SectionType, keyof FormValues> = {
  REASONING: "reasoningWeight",
  PRACTICAL: "practicalWeight",
  TECHNICAL: "technicalWeight",
};

function defaultsFrom(template?: ExamTemplate): FormValues {
  const weights = template?.config_json.section_weights;
  return {
    name: template?.name ?? "",
    description: template?.description ?? "",
    mcqTarget: template?.config_json.mcq_target ?? 40,
    cqTarget: template?.config_json.cq_target ?? 20,
    reasoningWeight: Math.round((weights?.REASONING ?? 0.3) * 100),
    practicalWeight: Math.round((weights?.PRACTICAL ?? 0.35) * 100),
    technicalWeight: Math.round((weights?.TECHNICAL ?? 0.35) * 100),
  };
}

interface ExamTemplateFormProps {
  template?: ExamTemplate; // present → edit mode, absent → create mode
  onSaved: () => void;
  onCancel: () => void;
}

export function ExamTemplateForm({ template, onSaved, onCancel }: ExamTemplateFormProps) {
  const [values, setValues] = useState<Record<keyof FormValues, string>>(() => {
    const d = defaultsFrom(template);
    return Object.fromEntries(Object.entries(d).map(([k, v]) => [k, String(v)])) as Record<
      keyof FormValues,
      string
    >;
  });
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function setField(key: keyof FormValues, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    const parsed = templateSchema.safeParse(values);
    if (!parsed.success) {
      const errors: FormErrors = {};
      for (const issue of parsed.error.issues) {
        errors[issue.path[0] as keyof FormErrors] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setSaving(true);

    try {
      const payload = {
        name: parsed.data.name,
        description: parsed.data.description || null,
        mcq_target: parsed.data.mcqTarget,
        cq_target: parsed.data.cqTarget,
        section_weights: {
          REASONING: parsed.data.reasoningWeight / 100,
          PRACTICAL: parsed.data.practicalWeight / 100,
          TECHNICAL: parsed.data.technicalWeight / 100,
        },
      };

      const result = template
        ? await examTemplatesApi.update(template.id, payload)
        : await examTemplatesApi.create(payload);

      if (!result.success) {
        setSubmitError(result.error.message);
        return;
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="mb-6 flex flex-col gap-4 rounded-2xl bg-slate-100 p-5 dark:bg-slate-800/60"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LayoutTemplate className="h-4 w-4 text-slate-400 dark:text-slate-500" />
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">
            {template ? "Edit template" : "New template"}
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="rounded p-1 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          aria-label="Cancel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Template name"
          placeholder="Standard senior-engineer bank"
          value={values.name}
          onChange={(e) => setField("name", e.target.value)}
          error={fieldErrors.name}
          disabled={saving}
        />
        <Input
          label="Description (optional)"
          placeholder="40 MCQ / 20 CQ, weighted toward Technical"
          value={values.description}
          onChange={(e) => setField("description", e.target.value)}
          error={fieldErrors.description}
          disabled={saving}
        />
        <Input
          label="MCQ target"
          type="number"
          min={1}
          max={200}
          value={values.mcqTarget}
          onChange={(e) => setField("mcqTarget", e.target.value)}
          error={fieldErrors.mcqTarget}
          disabled={saving}
        />
        <Input
          label="Open-ended (CQ) target"
          type="number"
          min={1}
          max={100}
          value={values.cqTarget}
          onChange={(e) => setField("cqTarget", e.target.value)}
          error={fieldErrors.cqTarget}
          disabled={saving}
        />
      </div>

      <div>
        <p className="mb-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
          Section weights <span className="font-normal text-slate-400 dark:text-slate-500">(must add up to 100%)</span>
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          {SECTION_ORDER.map((section) => (
            <Input
              key={section}
              label={SECTION_LABELS[section]}
              type="number"
              min={0}
              max={100}
              value={values[WEIGHT_FIELD[section]]}
              onChange={(e) => setField(WEIGHT_FIELD[section], e.target.value)}
              disabled={saving}
            />
          ))}
        </div>
        {fieldErrors.reasoningWeight && (
          <p className="mt-1.5 text-xs text-danger">{fieldErrors.reasoningWeight}</p>
        )}
      </div>

      {submitError && (
        <div className="flex items-start gap-2.5 rounded-lg border border-danger/20 bg-danger-light px-3 py-2.5">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          <p className="text-xs text-danger-dark">{submitError}</p>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" loading={saving} leftIcon={<LayoutTemplate className="h-3.5 w-3.5" />}>
          {saving ? "Saving…" : template ? "Save changes" : "Create template"}
        </Button>
      </div>
    </form>
  );
}
