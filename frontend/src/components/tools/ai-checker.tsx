"use client";

import { ScanText } from "lucide-react";
import { useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { DocumentInput, words, type Doc } from "./document-input";

type Result = {
  estimated_ai_percentage: number;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  suspicious_phrases: string[];
  explanation: string;
  recommendation: "NO_CONCERN" | "REVIEW_SUGGESTED" | "HIGH_CONCERN";
  chunks_analyzed: number;
  word_count: number;
  disclaimer: string;
};
type Job = { job_id: string; status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED"; detail: string; result: Result | null; error: string | null };

const REC = {
  NO_CONCERN: { label: "No concern", tone: "success" },
  REVIEW_SUGGESTED: { label: "Worth a closer look", tone: "warning" },
  HIGH_CONCERN: { label: "Strong AI-style signals", tone: "danger" },
} as const;
const MIN_WORDS = 20;

/** Highlights the model's flagged phrases inside the text (case-insensitive, first-come). */
function Highlighted({ text, phrases }: { text: string; phrases: string[] }) {
  const usable = phrases.map((p) => p.trim()).filter((p) => p.length > 3);
  if (!usable.length) return <p className="whitespace-pre-wrap text-md text-ink">{text}</p>;
  const re = new RegExp(`(${usable.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return (
    <p className="whitespace-pre-wrap text-md text-ink">
      {text.split(re).map((part, i) => (i % 2 === 1 ? <mark key={i} className="rounded-[2px] bg-warning-soft px-0.5 text-ink">{part}</mark> : part))}
    </p>
  );
}

export function AiChecker() {
  const [doc, setDoc] = useState<Doc>({ text: "", name: null, method: "native" });
  const [phase, setPhase] = useState<{ kind: "idle" } | { kind: "checking"; detail: string } | { kind: "error"; message: string } | { kind: "done"; result: Result; text: string }>({ kind: "idle" });
  const run = useRef(0);

  async function check() {
    const id = ++run.current;
    const text = doc.text.trim();
    setPhase({ kind: "checking", detail: "Queued" });
    const start = await api<{ job_id: string }>("/api/v1/ai-checker/jobs", { method: "POST", body: { text, title: doc.name } });
    if (run.current !== id) return;
    if (!start.ok) return setPhase({ kind: "error", message: start.status === 429 ? "Too many checks in a row. Wait a minute and try again." : start.error.message });
    // Long documents are analysed in chunks by the AI model; poll for up to six minutes.
    for (let i = 0; i < 180; i++) {
      await new Promise((r) => setTimeout(r, i === 0 ? 1000 : 2000));
      if (run.current !== id) return;
      const s = await api<Job>(`/api/v1/ai-checker/jobs/${start.data.job_id}`);
      if (run.current !== id) return;
      if (!s.ok) return setPhase({ kind: "error", message: s.error.message });
      if (s.data.status === "SUCCEEDED" && s.data.result) return setPhase({ kind: "done", result: s.data.result, text });
      if (s.data.status === "FAILED") return setPhase({ kind: "error", message: s.data.error ?? "The check didn't finish. Try again." });
      setPhase({ kind: "checking", detail: s.data.detail });
    }
    setPhase({ kind: "error", message: "The check is taking longer than expected. Try again in a minute." });
  }

  const n = words(doc.text);
  const ready = n >= MIN_WORDS && doc.text.trim().length >= 100;
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Panel title="Document" description="A cover letter, written answer, essay or any prose of at least 20 words.">
        <div className="flex flex-col gap-4">
          <DocumentInput doc={doc} onChange={(d) => (setDoc(d), phase.kind !== "checking" && setPhase({ kind: "idle" }))} extractPath="/api/ai-checker/extract" placeholder="Paste the text to check" minWords={MIN_WORDS} />
          <div>
            <Button variant="primary" disabled={!ready} loading={phase.kind === "checking"} onClick={() => void check()}>
              <ScanText aria-hidden className="size-4" /> {phase.kind === "checking" ? "Checking" : "Check the writing"}
            </Button>
            {phase.kind === "checking" && <p className="mt-2 text-sm text-ink-muted" aria-live="polite">{phase.detail}. Longer documents take a minute or two.</p>}
          </div>
        </div>
      </Panel>

      <Panel title="Result">
        {phase.kind === "error" ? (
          <Alert tone="danger">{phase.message}</Alert>
        ) : phase.kind !== "done" ? (
          <p className="text-base text-ink-muted">The estimate appears here. It&apos;s a signal for a conversation, never proof.</p>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-end gap-4">
              <p className="text-[2.75rem] leading-none tabular-nums text-ink">{Math.round(phase.result.estimated_ai_percentage)}%</p>
              <div className="pb-1">
                <p className="text-sm text-ink-muted">Estimated AI-style writing</p>
                <p className="mt-1 flex items-center gap-2">
                  <Badge tone={REC[phase.result.recommendation].tone}>{REC[phase.result.recommendation].label}</Badge>
                  <span className="text-sm text-ink-muted">{phase.result.confidence.toLowerCase()} confidence</span>
                </p>
              </div>
            </div>
            <p className="text-md text-ink">{phase.result.explanation}</p>
            <p className="text-sm text-ink-muted">
              {phase.result.word_count.toLocaleString("en")} words analysed in {phase.result.chunks_analyzed} {phase.result.chunks_analyzed === 1 ? "part" : "parts"}.
            </p>
            {phase.result.suspicious_phrases.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-ink">Phrases that read as generated, highlighted</h3>
                <div className={cn("mt-2 max-h-96 overflow-y-auto rounded-control border border-line bg-sunken p-4")}>
                  <Highlighted text={phase.text} phrases={phase.result.suspicious_phrases} />
                </div>
              </div>
            )}
            <Alert>{phase.result.disclaimer}</Alert>
          </div>
        )}
      </Panel>
    </div>
  );
}
