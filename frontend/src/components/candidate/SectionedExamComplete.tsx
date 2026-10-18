/**
 * SectionedExamComplete — post-submission status screen for the sectioned
 * exam (Master Prompt 2/3).
 *
 * CQ evaluation now runs once, in the background, after the final section
 * is submitted (not synchronously) — so unlike the legacy TestComplete,
 * this screen polls exam status until it resolves, showing exactly the
 * three states Master Prompt 3 calls for: "Submission received" →
 * "Evaluation in progress" → "Completed".
 *
 * Deliberately never shows scores, AI-risk, or any model output to the
 * candidate — those are admin-only (see exam_reports.py / the admin report
 * view). This screen only ever renders a status message.
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle, Clock, Loader2 } from "lucide-react";
import { candidateExamsApi } from "@/lib/api/candidateExams";

interface SectionedExamCompleteProps {
  examAttemptId: string;
}

const POLL_INTERVAL_MS = 5_000;
const TERMINAL_STATUSES = new Set(["EVALUATED", "FAILED"]);

type DisplayState = "submitted" | "evaluating" | "evaluated" | "failed";

function statusToDisplay(status: string): DisplayState {
  if (status === "EVALUATED") return "evaluated";
  if (status === "FAILED") return "failed";
  if (status === "EVALUATING") return "evaluating";
  return "submitted"; // SUBMITTED, or anything else concluded
}

const config: Record<DisplayState, { icon: React.ReactNode; heading: string; body: string }> = {
  submitted: {
    icon: <CheckCircle className="h-8 w-8 text-indigo-600 dark:text-indigo-400" />,
    heading: "Submission received",
    body: "All 3 sections have been submitted. Your answers are being prepared for evaluation.",
  },
  evaluating: {
    icon: <Loader2 className="h-8 w-8 animate-spin text-indigo-600 dark:text-indigo-400" />,
    heading: "Evaluation in progress",
    body: "The hiring team's assessment pipeline is reviewing your answers now. This usually takes a few minutes.",
  },
  evaluated: {
    icon: <CheckCircle className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />,
    heading: "Completed",
    body: "Your assessment has been fully evaluated. The hiring team will be in touch with next steps.",
  },
  failed: {
    icon: <Clock className="h-8 w-8 text-amber-600 dark:text-amber-400" />,
    heading: "Submission received",
    body: "Your answers were submitted and saved successfully. Evaluation is taking a little longer than usual — there's nothing further for you to do, the hiring team has been notified.",
  },
};

export function SectionedExamComplete({ examAttemptId }: SectionedExamCompleteProps) {
  const [display, setDisplay] = useState<DisplayState>("submitted");
  const stoppedRef = useRef(false);

  useEffect(() => {
    stoppedRef.current = false;

    const poll = async () => {
      if (stoppedRef.current) return;
      try {
        const status = await candidateExamsApi.getStatus(examAttemptId);
        if (stoppedRef.current) return;
        setDisplay(statusToDisplay(status.status));
        if (TERMINAL_STATUSES.has(status.status)) {
          stoppedRef.current = true;
        }
      } catch {
        // Network hiccup — keep polling, don't alarm the candidate.
      }
    };

    poll();
    const interval = setInterval(() => {
      if (stoppedRef.current) {
        clearInterval(interval);
        return;
      }
      poll();
    }, POLL_INTERVAL_MS);

    return () => {
      stoppedRef.current = true;
      clearInterval(interval);
    };
  }, [examAttemptId]);

  const { icon, heading, body } = config[display];

  return (
    <div className="flex flex-col items-center gap-6 py-8 text-center font-sans">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-300 bg-slate-50 shadow-sm ring-1 ring-slate-900/5 dark:border-slate-800 dark:bg-slate-800">
        {icon}
      </div>

      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{heading}</h1>
        <p className="mt-2 max-w-sm text-sm font-normal text-slate-600 leading-relaxed dark:text-slate-400">{body}</p>
      </div>

      <div className="w-full max-w-sm rounded-xl border border-slate-300 bg-white p-5 text-left shadow-sm ring-1 ring-slate-900/5 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-sm font-semibold tracking-wide text-slate-900 mb-3 dark:text-white">What happens next</p>
        <ul className="flex flex-col gap-2.5">
          {[
            "Your answers are being reviewed by the hiring team.",
            "Results are typically shared within a few business days.",
            "This link is now inactive and cannot be reused.",
          ].map((item) => (
            <li key={item} className="flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-300">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-600 dark:bg-indigo-400" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-xs text-slate-500 max-w-xs dark:text-slate-400">You can safely close this window. Good luck!</p>
    </div>
  );
}
