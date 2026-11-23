"use client";

import { CheckCircle2, Library, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/api/client";
import { tidyStep } from "@/lib/domain/test";
import { usePoll } from "@/lib/use-poll";
import { useProgressStream } from "@/lib/use-progress-stream";
import type { BankStatus, ExamTemplate } from "@/types/test";

const SECTIONS = [
  { key: "REASONING", label: "Reasoning" },
  { key: "PRACTICAL", label: "Practical" },
  { key: "TECHNICAL", label: "Technical" },
] as const;

type Preset = { id: string; label: string; hint: string; mcq?: number; cq?: number; weights?: Record<string, number> | null };
const BUILT_IN: Preset[] = [
  { id: "standard", label: "Standard", hint: "40 multiple choice and 20 written per section" },
  { id: "quick", label: "Quick", hint: "20 multiple choice and 10 written per section. Faster to generate, still usable.", mcq: 20, cq: 10 },
];

function bankBadge(s: BankStatus): { label: string; tone: BadgeTone } {
  if (s.status === "GENERATING") return { label: "Generating", tone: "accent" };
  if (s.status === "FAILED") return { label: "Failed", tone: "danger" };
  if (s.is_approved) return { label: "Approved for candidates", tone: "success" };
  if (s.ready) return { label: "Ready for review", tone: "warning" };
  return { label: "Incomplete", tone: "warning" };
}

export function BankPanel({ jdId, initial, templates }: { jdId: string; initial: BankStatus; templates: ExamTemplate[] }) {
  const router = useRouter();
  const presets: Preset[] = [
    ...BUILT_IN,
    ...templates.map((t) => ({
      id: t.id,
      label: t.name,
      hint: t.description ?? "Saved exam template",
      mcq: t.config_json.mcq_target ?? undefined,
      cq: t.config_json.cq_target ?? undefined,
      weights: t.config_json.section_weights,
    })),
  ];
  const [presetId, setPresetId] = useState("standard");
  const [busy, setBusy] = useState<"generate" | "review" | null>(null);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [error, setError] = useState<string>();
  const s = initial;
  const generating = s.status === "GENERATING";
  const last = useRef(s.status);

  const progress = useProgressStream(generating ? `/api/proxy/api/v1/jd/${jdId}/question-bank/progress/stream` : null, () => router.refresh());
  usePoll(
    async () => {
      const res = await api<BankStatus>(`/api/v1/jd/${jdId}/question-bank/status`);
      if (res.ok && res.data.status !== last.current) {
        last.current = res.data.status;
        router.refresh();
      }
    },
    5000,
    generating,
  );

  async function generate(again: boolean) {
    const p = presets.find((x) => x.id === presetId) ?? BUILT_IN[0]!;
    setBusy("generate");
    setError(undefined);
    if (p.weights) {
      // Section weights drive scoring, not question counts, so they're stored on the role first.
      const cfg = await api(`/api/v1/jd/${jdId}/question-bank/config`, { method: "PATCH", body: { section_weights: p.weights } });
      if (!cfg.ok) {
        setBusy(null);
        return setError(`The template's section weights weren't saved: ${cfg.error.message}`);
      }
    }
    const body = { ...(p.mcq ? { mcq_target: p.mcq } : {}), ...(p.cq ? { cq_target: p.cq } : {}) };
    const res = await api<BankStatus>(`/api/v1/jd/${jdId}/question-bank/${again ? "regenerate" : "generate"}`, { method: "POST", body });
    setBusy(null);
    setConfirmRegen(false);
    if (!res.ok) {
      return setError(
        res.error.code === "QUESTION_BANK_MODE_DISABLED"
          ? "Question banks are turned off on this server. Ask whoever runs Talvyn to enable them."
          : res.error.message,
      );
    }
    router.refresh();
  }

  async function approve() {
    setBusy("review");
    setError(undefined);
    const res = await api<BankStatus>(`/api/v1/jd/${jdId}/question-bank/review`, { method: "POST", body: {} });
    setBusy(null);
    if (!res.ok) return setError(res.error.message);
    toast({ title: "Question bank approved", description: "Candidates invited to this role now get questions drawn from it.", tone: "success" });
    router.refresh();
  }

  const presetHint = presets.find((p) => p.id === presetId)?.hint;
  const presetField = (
    <Field label="Bank size" className="w-full sm:w-80">
      <Select value={presetId} onValueChange={setPresetId}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {presets.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );

  if (!s.exists) {
    return (
      <div className="rounded-panel border border-line bg-surface">
        <EmptyState
          icon={Library}
          title="No question bank yet"
          description="A bank is a large pool of questions in three sections. Each candidate gets their own selection from it, so answers are harder to pass around. Generating one takes a while; it runs in the background."
        />
        <div className="border-t border-line px-6 py-4">
          <div className="flex flex-wrap items-end gap-3">
            {presetField}
            <Button variant="primary" loading={busy === "generate"} onClick={() => void generate(false)}>
              Generate question bank
            </Button>
          </div>
          <p className="mt-1.5 text-sm text-ink-muted">{presetHint}</p>
        </div>
        {error && (
          <div className="px-6 pb-5">
            <Alert tone="danger">{error}</Alert>
          </div>
        )}
      </div>
    );
  }

  const badge = bankBadge(s);
  const pct = Math.max(0, Math.min(100, Math.round(progress?.pct ?? 0)));

  return (
    <div className="flex flex-col gap-6">
      {error && <Alert tone="danger">{error}</Alert>}

      {generating && (
        <section aria-labelledby="bank-gen" className="rounded-panel border border-accent/25 bg-surface p-5">
          <h2 id="bank-gen" className="text-md font-medium text-ink">
            Building the question bank
          </h2>
          <div aria-live="polite">
            <p className="mt-0.5 text-base text-ink">{progress?.step ? tidyStep(progress.step) : "Waiting for the model to start"}</p>
            {progress?.detail && <p className="text-sm text-ink-muted">{progress.detail}</p>}
          </div>
          <div
            role="progressbar"
            aria-label="Question bank progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress ? pct : undefined}
            className="mt-4 h-1.5 overflow-hidden rounded-full bg-sunken"
          >
            {progress ? (
              <div className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out" style={{ width: `${Math.max(pct, 2)}%` }} />
            ) : (
              <div className="h-full w-1/4 animate-indeterminate rounded-full bg-accent/60 motion-reduce:animate-none" />
            )}
          </div>
          <p className="mt-3 text-sm text-ink-muted">Large banks can take well over half an hour on the self-hosted model. You can leave this page; it keeps going.</p>
        </section>
      )}

      {s.status === "FAILED" && (
        <Alert tone="danger" title="The bank didn't finish">
          The model stopped before the bank was complete. Regenerate it to try again.
        </Alert>
      )}

      <Panel
        title={
          <span className="flex items-center gap-2.5">
            Sections
            <Badge tone={badge.tone} dot>
              {badge.label}
            </Badge>
          </span>
        }
        description={
          s.is_approved
            ? "Every section is approved. New candidates for this role get questions from this bank."
            : s.ready
              ? "Every section has enough questions. Approve the bank to start using it for candidates."
              : "Sections below the minimum can't be used for candidates yet."
        }
        actions={
          !generating && (
            <>
              <Button variant="secondary" size="sm" onClick={() => setConfirmRegen(true)}>
                <RefreshCw aria-hidden className="size-3.5" /> Regenerate
              </Button>
              {s.ready && !s.is_approved && (
                <Button variant="primary" size="sm" loading={busy === "review"} onClick={() => void approve()}>
                  <CheckCircle2 aria-hidden className="size-3.5" /> Approve bank
                </Button>
              )}
            </>
          )
        }
        bodyClassName="p-0"
      >
        <Table aria-label="Questions per section">
          <THead>
            <tr>
              <TH>Section</TH>
              <TH className="text-right">Multiple choice</TH>
              <TH className="text-right">Written</TH>
              <TH>Size</TH>
            </tr>
          </THead>
          <tbody>
            {SECTIONS.map(({ key, label }) => {
              const sec = s.sections[key];
              return (
                <TR key={key}>
                  <TD className="font-medium text-ink">{label}</TD>
                  <TD className="text-right">{sec?.mcq ?? 0}</TD>
                  <TD className="text-right">{sec?.cq ?? 0}</TD>
                  <TD>
                    {!sec ? (
                      <span className="text-ink-muted">Not started</span>
                    ) : sec.meets_commercial_recommended ? (
                      <Badge tone="success">Recommended size</Badge>
                    ) : sec.meets_minimum ? (
                      <Badge tone="accent">Minimum met</Badge>
                    ) : (
                      <Badge tone="danger">Below minimum</Badge>
                    )}
                  </TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      </Panel>

      {s.below_recommended && s.ready && (
        <p className="text-sm text-ink-muted">
          Some sections are smaller than recommended. The bank works, but candidates are more likely to see the same questions.
        </p>
      )}

      <Dialog open={confirmRegen} onOpenChange={setConfirmRegen}>
        <DialogContent
          title="Regenerate the question bank?"
          description="The current bank is archived, not deleted, so exams already given keep their questions. A new bank is built in the background and needs approving again."
          footer={
            <>
              <DialogClose asChild>
                <Button variant="ghost">Keep current bank</Button>
              </DialogClose>
              <Button variant="primary" loading={busy === "generate"} onClick={() => void generate(true)}>
                Regenerate bank
              </Button>
            </>
          }
        >
          {presetField}
          <p className="mt-1.5 text-sm text-ink-muted">{presetHint}</p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
