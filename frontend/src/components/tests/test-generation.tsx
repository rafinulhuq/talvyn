"use client";

import { RefreshCw, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/api/client";
import { tidyStep } from "@/lib/domain/test";
import { usePoll } from "@/lib/use-poll";
import { useProgressStream } from "@/lib/use-progress-stream";
import type { JdStatus } from "@/types/jd";
import type { DifficultyMix } from "@/types/test";
import { DifficultyMixField } from "./difficulty-mix";


/** Opens the set-up dialog and starts background generation of the three tests. */
export function GenerateTestsButton({
  jdId,
  hasTests,
  approvedCount,
  suggested,
  disabled,
}: {
  jdId: string;
  hasTests: boolean;
  approvedCount: number;
  suggested: DifficultyMix;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mix, setMix] = useState(suggested);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function start() {
    setBusy(true);
    setError(undefined);
    const res = await api(`/api/v1/tests/generate/${jdId}`, { method: "POST", body: { difficulty_distribution: mix } });
    setBusy(false);
    if (!res.ok) {
      setError(res.status === 429 ? "Generation was started several times in a row. Wait a minute, then try again." : res.error.message);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (setOpen(o), setError(undefined))}>
      <Button variant={hasTests ? "secondary" : "primary"} disabled={disabled} onClick={() => setOpen(true)}>
        {hasTests ? <RefreshCw aria-hidden className="size-4" /> : <Sparkles aria-hidden className="size-4" />}
        {hasTests ? "Regenerate tests" : "Generate tests"}
      </Button>
      <DialogContent
        title={hasTests ? "Regenerate the tests" : "Generate the tests"}
        description="Three tests are written from this role's skills: technical, reasoning and problem solving. It runs in the background, so you can leave this page."
        footer={
          <>
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button variant="primary" loading={busy} onClick={() => void start()}>
              {hasTests ? "Regenerate tests" : "Generate tests"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <DifficultyMixField value={mix} onChange={setMix} suggested={suggested} />
          {hasTests && (
            <Alert>
              Draft tests are replaced.{" "}
              {approvedCount > 0
                ? `${approvedCount === 1 ? "The approved test is" : `The ${approvedCount} approved tests are`} archived, so candidates' results stay intact.`
                : "No test is approved yet, so nothing is archived."}
            </Alert>
          )}
          {error && <Alert tone="danger">{error}</Alert>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Live progress while the backend generates. The SSE stream drives the bar;
 * a slow /status poll is the source of truth for "finished" (the stream may drop).
 */
export function GenerationProgress({ jdId, status }: { jdId: string; status: JdStatus }) {
  const router = useRouter();
  const generating = status.generation_status === "GENERATING";
  const [cancelling, setCancelling] = useState(false);
  const last = useRef(status.generation_status);

  const progress = useProgressStream(generating ? `/api/proxy/api/v1/tests/progress/${jdId}/stream` : null, () => router.refresh());

  usePoll(
    async () => {
      const res = await api<JdStatus>(`/api/v1/jd/${jdId}/status`);
      if (res.ok && res.data.generation_status !== last.current) {
        last.current = res.data.generation_status;
        router.refresh();
      }
    },
    5000,
    generating,
  );

  async function cancel() {
    setCancelling(true);
    const res = await api(`/api/v1/tests/cancel/${jdId}`, { method: "POST", body: {} });
    setCancelling(false);
    if (!res.ok) return toast({ title: "Couldn't stop generation", description: res.error.message, tone: "danger" });
    toast({ title: "Generation stopped", description: "Draft tests from this run were removed." });
    router.refresh();
  }

  if (generating) {
    const pct = Math.max(0, Math.min(100, Math.round(progress?.pct ?? 0)));
    return (
      <section aria-labelledby="gen-title" className="rounded-panel border border-accent/25 bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="gen-title" className="text-md font-medium text-ink">
              Writing the tests
            </h2>
            <div aria-live="polite">
              <p className="mt-0.5 text-base text-ink">{progress?.step ? tidyStep(progress.step) : "Waiting for the model to start"}</p>
              {progress?.detail && <p className="text-sm text-ink-muted">{progress.detail}</p>}
            </div>
          </div>
          <Button variant="ghost" size="sm" loading={cancelling} onClick={() => void cancel()}>
            Stop generation
          </Button>
        </div>
        <div
          role="progressbar"
          aria-label="Test generation progress"
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
        <p className="mt-3 text-sm text-ink-muted">
          {progress ? `${pct}% done. ` : ""}This takes several minutes on the self-hosted model. You can leave this page; it keeps going.
        </p>
      </section>
    );
  }

  if (status.generation_status === "FAILED") {
    return (
      <Alert tone="danger" title="The tests weren't generated">
        The AI model didn&apos;t return usable questions. Generate again. If it keeps failing, the model server may need attention.
        {status.error_message && (
          <details className="mt-2">
            <summary className="cursor-pointer text-sm text-ink-muted hover:text-ink">Technical details</summary>
            <p className="mt-1 break-words font-mono text-xs text-ink-muted">{status.error_message}</p>
          </details>
        )}
      </Alert>
    );
  }
  return null;
}
