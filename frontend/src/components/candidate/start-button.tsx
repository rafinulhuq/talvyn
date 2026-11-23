"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { attempts, exams } from "@/lib/candidate/client";

/**
 * Agree to the rules, then start. For "test" it starts test N of the invitation;
 * for "exam" it starts (or resumes) the sectioned exam. Starting is idempotent on the backend.
 */
export function StartButton({ kind, testIndex = 0, totalTests = 1 }: { kind: "test" | "exam"; testIndex?: number; totalTests?: number }) {
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function start() {
    setBusy(true);
    setError(undefined);
    const res =
      kind === "test"
        ? await attempts.start(testIndex).then((r) => (r.ok ? { ...r, href: `/tests/session/exam?attempt=${encodeURIComponent(r.data.attempt_id)}` } : r))
        : await exams.start().then((r) => (r.ok ? { ...r, href: `/exam/session/section?attempt=${encodeURIComponent(r.data.exam_attempt_id)}` } : r));
    if (res.ok) return router.push(res.href);
    setBusy(false);
    const s = res.status;
    const detail = res.error.code !== "ERROR" || s === 403 || s === 409 ? res.error.message : undefined;
    setError(
      s === 409
        ? (detail ?? "This assessment has already been submitted.")
        : s === 403 && detail
          ? detail
          : s === 400 || s === 401
            ? "This link is no longer valid. Open the link from your invitation email again."
            : s === 0
              ? "You appear to be offline. Check your connection and try again."
              : "The assessment didn't start. Wait a moment and try again.",
    );
  }

  const label = kind === "test" && totalTests > 1 ? `Start test ${testIndex + 1} of ${totalTests}` : "Start the assessment";
  return (
    <div className="flex flex-col gap-4 border-t border-line pt-5">
      <label className="flex cursor-pointer items-start gap-3 text-base text-ink">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]" />
        <span>I understand these rules. Copy and paste are off, and leaving this window ends the assessment.</span>
      </label>
      {error && <Alert tone="danger">{error}</Alert>}
      <Button variant="primary" className="h-10 w-full" disabled={!agreed} loading={busy} onClick={() => void start()}>
        {busy ? "Starting" : label}
      </Button>
      <p className="text-sm text-ink-muted">The timer starts as soon as you press start.</p>
    </div>
  );
}
