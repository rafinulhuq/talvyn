"use client";

import { Download, MoreHorizontal, Printer, RefreshCw, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/api/client";

/**
 * Scoring runs synchronously on the backend (MCQs instantly, written answers
 * through the AI model). If the request outlives the connection, poll until
 * the evaluation appears, for up to 10 minutes.
 */
async function runScoring(attemptId: string): Promise<string | null> {
  const res = await api(`/api/v1/evaluation/trigger`, { method: "POST", body: { attempt_id: attemptId } });
  if (res.ok) return null;
  if (res.status === 503) return "The AI model isn't reachable right now. Try again in a few minutes.";
  if (res.status === 502) return "The AI model returned something we couldn't use. Try again.";
  if (res.status === 429) return "Scoring was started several times in a row. Wait a minute, then try again.";
  if (![0, 504].includes(res.status)) return res.error.message;
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const poll = await api(`/api/v1/evaluation/${attemptId}`);
    if (poll.ok) return null;
    if (![0, 404].includes(poll.status)) break;
  }
  return "Scoring is taking longer than expected. Refresh this page in a minute.";
}

export function ScoreNow({ attemptId }: { attemptId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  async function go() {
    setBusy(true);
    setError(undefined);
    const err = await runScoring(attemptId);
    setBusy(false);
    if (err) return setError(err);
    toast({ title: "Scored", tone: "success" });
    router.refresh();
  }
  return (
    <div className="flex flex-col items-start gap-3">
      {error && <Alert tone="danger">{error}</Alert>}
      <Button variant="primary" loading={busy} onClick={() => void go()}>
        <Sparkles aria-hidden className="size-4" /> {busy ? "Scoring" : "Score this test"}
      </Button>
      {busy && <p className="text-sm text-ink-muted">Multiple choice is marked instantly; written answers go through the AI model, which takes a minute or two.</p>}
    </div>
  );
}

export function ReportActions({ attemptId }: { attemptId: string }) {
  const router = useRouter();
  const [rerun, setRerun] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [exporting, setExporting] = useState(false);

  async function exportDocx() {
    setExporting(true);
    try {
      const res = await fetch(`/api/proxy/api/v1/evaluation/${attemptId}/export`, { credentials: "same-origin" });
      if (!res.ok) throw new Error(String(res.status));
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `evaluation_${attemptId.slice(0, 8)}.docx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      toast({ title: "The report didn't download", description: "Try again in a moment.", tone: "danger" });
    }
    setExporting(false);
  }

  async function doRerun() {
    setBusy(true);
    setError(undefined);
    const err = await runScoring(attemptId);
    setBusy(false);
    if (err) return setError(err);
    setRerun(false);
    toast({ title: "Scored again", tone: "success" });
    router.refresh();
  }

  return (
    <div data-print="hide" className="flex items-center gap-2">
      <Button variant="secondary" loading={exporting} onClick={() => void exportDocx()}>
        <Download aria-hidden className="size-4" /> Word report
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" aria-label="More actions">
            <MoreHorizontal aria-hidden className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={() => window.print()}>
            <Printer aria-hidden /> Print or save as PDF
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setRerun(true)}>
            <RefreshCw aria-hidden /> Score again
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={rerun} onOpenChange={(o) => !busy && (setRerun(o), setError(undefined))}>
        <DialogContent
          title="Score this test again?"
          description="The answers are marked again from scratch. This report is replaced, including any reviewer decision, notes and score changes. Takes a minute or two."
          footer={
            <>
              <DialogClose asChild>
                <Button variant="ghost" disabled={busy}>
                  Keep this report
                </Button>
              </DialogClose>
              <Button variant="primary" loading={busy} onClick={() => void doRerun()}>
                {busy ? "Scoring" : "Score again"}
              </Button>
            </>
          }
        >
          {error && <Alert tone="danger">{error}</Alert>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
