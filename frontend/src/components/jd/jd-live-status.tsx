"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef } from "react";
import { Alert } from "@/components/ui/alert";
import { api } from "@/lib/api/client";
import { jdStatus } from "@/lib/domain/jd";
import { usePoll } from "@/lib/use-poll";
import type { JdStatus } from "@/types/jd";

const BUSY_COPY: Record<string, string> = {
  "Reading file": "Reading the file and pulling out its text. This usually takes a few seconds.",
  "Writing draft": "Writing the job description from your brief. This takes a minute or two on the self-hosted model.",
  "Extracting skills": "Analysing the text for skills, tools and seniority. This takes up to two minutes.",
  "Generating tests": "Writing the technical, reasoning and problem-solving tests. Larger roles take several minutes.",
};

/** Polls /status while work is running; refreshes the page when the state changes. */
export function JdLiveStatus({ jdId, initial, errorMessage }: { jdId: string; initial: JdStatus; errorMessage: string | null }) {
  const router = useRouter();
  const last = useRef(`${initial.parse_status}/${initial.generation_status}/${initial.has_extracted_data}/${initial.has_tests}`);
  const s = jdStatus(initial.parse_status, initial.generation_status, initial.has_extracted_data);

  usePoll(
    async () => {
      const res = await api<JdStatus>(`/api/v1/jd/${jdId}/status`);
      if (!res.ok) return;
      const key = `${res.data.parse_status}/${res.data.generation_status}/${res.data.has_extracted_data}/${res.data.has_tests}`;
      if (key !== last.current) {
        last.current = key;
        router.refresh();
      }
    },
    3000,
    s.busy,
  );

  if (s.busy) {
    return (
      <div role="status" className="flex items-start gap-3 rounded-panel border border-accent/25 bg-accent-soft/40 p-4">
        <Loader2 aria-hidden className="mt-0.5 size-4 shrink-0 animate-spin text-accent" />
        <div>
          <p className="text-base font-medium text-ink">{s.label}</p>
          <p className="mt-0.5 text-base text-ink-muted">{BUSY_COPY[s.label] ?? "Working on it."} You can leave this page; it keeps going.</p>
        </div>
      </div>
    );
  }
  // Backend error strings are technical (model output, parser errors): show plain
  // language up front, keep the raw text one click away for whoever debugs it.
  const details = errorMessage ? (
    <details className="mt-2">
      <summary className="cursor-pointer text-sm text-ink-muted hover:text-ink">Technical details</summary>
      <p className="mt-1 break-words font-mono text-xs text-ink-muted">{errorMessage}</p>
    </details>
  ) : null;
  if (initial.parse_status === "FAILED") {
    return (
      <Alert tone="danger" title="We couldn't read this file">
        It may be scanned or password-protected. Upload a text-based PDF or Word file instead.
        {details}
      </Alert>
    );
  }
  if (initial.generation_status === "FAILED") {
    return (
      <Alert tone="danger" title="The last step didn't finish">
        The AI model didn&apos;t return a usable result. Try again. If it keeps failing, the model server may need attention.
        {details}
      </Alert>
    );
  }
  return null;
}
