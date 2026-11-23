"use client";

import { CircleAlert, CircleCheck, FileSearch, Info, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { ScoreMeter } from "@/components/ui/score-meter";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TagInput } from "@/components/ui/tag-input";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { DocumentInput, words, type Doc } from "./document-input";

type Severity = "CRITICAL" | "WARNING" | "INFO" | "GOOD";
type Report = {
  score: number;
  band: "EXCELLENT" | "GOOD" | "NEEDS_WORK" | "POOR";
  headline: string;
  categories: { key: string; label: string; score: number; max_score: number; summary: string }[];
  findings: { category: string; severity: Severity; message: string; suggestion: string | null }[];
  keyword_match: { source: "JD" | "MANUAL" | "NONE"; jd_title: string | null; matched: string[]; missing: string[]; must_have_missing: string[]; coverage_percent: number };
  detected_sections: string[];
  missing_sections: string[];
  detected_contact: { email: string | null; phone: string | null; location: string | null; links: string[] };
  word_count: number;
  estimated_pages: number;
  disclaimer: string;
};

const BAND = { EXCELLENT: { l: "Excellent", t: "success" }, GOOD: { l: "Good", t: "success" }, NEEDS_WORK: { l: "Needs work", t: "warning" }, POOR: { l: "Poor", t: "danger" } } as const;
const SEV: Record<Severity, { icon: typeof Info; cls: string; order: number }> = {
  CRITICAL: { icon: CircleAlert, cls: "text-danger", order: 0 },
  WARNING: { icon: TriangleAlert, cls: "text-warning", order: 1 },
  INFO: { icon: Info, cls: "text-ink-muted", order: 2 },
  GOOD: { icon: CircleCheck, cls: "text-success", order: 3 },
};
const NONE = "__none__";
const MANUAL = "__manual__";
const MIN_WORDS = 30;

export function AtsChecker({ roles }: { roles: { id: string; title: string }[] }) {
  const [doc, setDoc] = useState<Doc>({ text: "", name: null, method: "native" });
  const [target, setTarget] = useState(NONE);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [report, setReport] = useState<Report | null>(null);

  async function check() {
    setBusy(true);
    setError(undefined);
    const res = await api<Report>("/api/v1/ats/check", {
      method: "POST",
      body: {
        text: doc.text.trim(),
        filename: doc.name,
        extraction_method: doc.method,
        ...(target !== NONE && target !== MANUAL ? { jd_id: target } : {}),
        ...(target === MANUAL && keywords.length ? { keywords } : {}),
      },
    });
    setBusy(false);
    if (!res.ok) return setError(res.status === 429 ? "Too many checks in a row. Wait a minute and try again." : res.error.message);
    setReport(res.data);
  }

  const ready = words(doc.text) >= MIN_WORDS && doc.text.trim().length >= 50;
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Panel title="Résumé" description="How a typical applicant tracking system would read it: parsing, sections, contact details, formatting and keywords.">
        <div className="flex flex-col gap-4">
          <DocumentInput doc={doc} onChange={(d) => (setDoc(d), setReport(null))} extractPath="/api/ats/extract" placeholder="Paste the résumé text" minWords={MIN_WORDS} />
          <Field label="Match keywords against" optional>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No role (skip keyword matching)</SelectItem>
                <SelectItem value={MANUAL}>Keywords I type</SelectItem>
                {roles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {target === MANUAL && (
            <Field label="Keywords" hint="Press Enter after each.">
              <TagInput value={keywords} onChange={setKeywords} placeholder="Laravel, MySQL, REST APIs" max={200} />
            </Field>
          )}
          {error && <Alert tone="danger">{error}</Alert>}
          <div>
            <Button variant="primary" disabled={!ready} loading={busy} onClick={() => void check()}>
              <FileSearch aria-hidden className="size-4" /> {busy ? "Checking" : "Check the résumé"}
            </Button>
          </div>
        </div>
      </Panel>

      <div className="flex flex-col gap-6">
        {!report ? (
          <Panel title="Report">
            <p className="text-base text-ink-muted">The report appears here. It&apos;s rule-based and runs instantly; no AI model is involved.</p>
          </Panel>
        ) : (
          <>
            <Panel title="Report">
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <Badge tone={BAND[report.band].t} className="h-6 px-2 text-sm">
                    {BAND[report.band].l}
                  </Badge>
                  <span className="text-base text-ink">{report.headline}</span>
                </div>
                <ScoreMeter value={report.score} label="Overall" />
                <div className="grid gap-4 sm:grid-cols-2">
                  {report.categories.map((c) => (
                    <div key={c.key}>
                      <ScoreMeter size="sm" value={c.max_score ? (c.score / c.max_score) * 100 : 0} label={c.label} />
                      <p className="mt-1 text-sm text-ink-muted">{c.summary}</p>
                    </div>
                  ))}
                </div>
                <p className="text-sm text-ink-muted">
                  {report.word_count.toLocaleString("en")} words, about {report.estimated_pages} {report.estimated_pages === 1 ? "page" : "pages"}.
                </p>
              </div>
            </Panel>
            <Panel title="What to fix">
              <ul className="flex flex-col gap-3">
                {[...report.findings]
                  .sort((a, b) => SEV[a.severity].order - SEV[b.severity].order)
                  .map((f, i) => {
                    const S = SEV[f.severity];
                    return (
                      <li key={i} className="flex gap-3">
                        <S.icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", S.cls)} />
                        <div>
                          <p className="text-base text-ink">
                            <span className="sr-only">{f.severity.toLowerCase()}: </span>
                            {f.message}
                          </p>
                          {f.suggestion && <p className="text-sm text-ink-muted">{f.suggestion}</p>}
                        </div>
                      </li>
                    );
                  })}
              </ul>
            </Panel>
            {report.keyword_match.source !== "NONE" && (
              <Panel title={report.keyword_match.jd_title ? `Keywords for ${report.keyword_match.jd_title}` : "Keywords"} description={`${Math.round(report.keyword_match.coverage_percent)}% covered`}>
                <div className="flex flex-col gap-3">
                  <Chips title="Found" items={report.keyword_match.matched} tone="success" />
                  <Chips title="Missing must-haves" items={report.keyword_match.must_have_missing} tone="danger" />
                  <Chips
                    title="Missing"
                    items={report.keyword_match.missing.filter((k) => !report.keyword_match.must_have_missing.some((m) => m.toLowerCase() === k.toLowerCase()))}
                    tone="neutral"
                  />
                </div>
              </Panel>
            )}
            <Panel title="What the system found">
              <dl className="grid gap-4 sm:grid-cols-2">
                <Def k="Sections found" v={report.detected_sections.join(", ") || "None"} />
                <Def k="Sections missing" v={report.missing_sections.join(", ") || "None"} />
                <Def k="Email" v={report.detected_contact.email ?? "Not found"} />
                <Def k="Phone" v={report.detected_contact.phone ?? "Not found"} />
                <Def k="Location" v={report.detected_contact.location ?? "Not found"} />
                <Def k="Links" v={report.detected_contact.links.join(", ") || "None"} />
              </dl>
              <Alert className="mt-4">{report.disclaimer}</Alert>
            </Panel>
          </>
        )}
      </div>
    </div>
  );
}

function Chips({ title, items: raw, tone }: { title: string; items: string[]; tone: "success" | "danger" | "neutral" }) {
  // The backend can list the same keyword more than once (e.g. from two skill lists).
  const items = [...new Map(raw.map((k) => [k.trim().toLowerCase(), k.trim()])).values()];
  if (!items.length) return null;
  return (
    <div>
      <p className="text-sm text-ink-muted">{title}</p>
      <ul className="mt-1 flex flex-wrap gap-1.5">
        {items.map((k) => (
          <li key={k}>
            <Badge tone={tone}>{k}</Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Def({ k, v }: { k: string; v: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-ink-muted">{k}</dt>
      <dd className="break-words text-base text-ink">{v}</dd>
    </div>
  );
}
