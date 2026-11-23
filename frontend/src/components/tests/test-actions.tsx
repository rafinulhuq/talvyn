"use client";

import { Check, Eye, MoreHorizontal, RefreshCw, Trash2, Undo2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/api/client";
import type { Test } from "@/types/test";
import { useInUseGuard } from "./in-use-confirm";

export function TestActions({ test }: { test: Test }) {
  const router = useRouter();
  const { guard, dialog } = useInUseGuard();
  const [statusBusy, setStatusBusy] = useState(false);
  const [modal, setModal] = useState<"regenerate" | "delete" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const approved = test.status === "APPROVED";
  const base = `/dashboard/jds/${test.jd_id}/tests`;

  async function setStatus(next: "APPROVED" | "DRAFT") {
    setStatusBusy(true);
    const res = await api<Test>(`/api/v1/tests/${test.id}/status`, { method: "POST", body: { status: next } });
    setStatusBusy(false);
    if (!res.ok) return toast({ title: "Couldn't change the status", description: res.error.message, tone: "danger" });
    toast({
      title: next === "APPROVED" ? "Test approved" : "Moved back to draft",
      description: next === "APPROVED" ? "Candidates can now be invited to it." : "New invitations can't use it until it's approved again.",
      tone: next === "APPROVED" ? "success" : undefined,
    });
    router.refresh();
  }

  async function regenerate() {
    setBusy(true);
    setError(undefined);
    // Synchronous on the backend: one model call for one test, so this can take a few minutes.
    const res = await api<Test>(`/api/v1/tests/${test.id}/regenerate`, { method: "POST", body: {} });
    setBusy(false);
    if (!res.ok) {
      setError(
        res.error.code === "AI_SERVICE_UNAVAILABLE"
          ? "The AI model isn't reachable right now. Try again in a few minutes."
          : res.error.code === "AI_PARSE_ERROR"
            ? "The AI model returned questions we couldn't use. Try again."
            : res.error.message,
      );
      return;
    }
    setModal(null);
    toast({ title: "Questions regenerated", description: "The test is back in draft. Review it, then approve.", tone: "success" });
    router.refresh();
  }

  async function remove() {
    setBusy(true);
    const run = (force: boolean) => api(`/api/v1/tests/${test.id}${force ? "?force=true" : ""}`, { method: "DELETE" });
    const after = () => {
      toast({ title: "Test deleted" });
      router.push(base);
      router.refresh();
    };
    const res = await guard(run, (r) => (r.ok ? after() : toast({ title: "Couldn't delete", description: r.error.message, tone: "danger" })));
    setBusy(false);
    setModal(null);
    if (res === null) return;
    if (!res.ok) return toast({ title: "Couldn't delete", description: res.error.message, tone: "danger" });
    after();
  }

  return (
    <>
      <Button variant="secondary" asChild>
        <Link href={`${base}/${test.id}/preview`}>
          <Eye aria-hidden className="size-4" /> Preview
        </Link>
      </Button>
      {test.status !== "ARCHIVED" &&
        (approved ? (
          <Button variant="secondary" loading={statusBusy} onClick={() => void setStatus("DRAFT")}>
            <Undo2 aria-hidden className="size-4" /> Move to draft
          </Button>
        ) : (
          <Button variant="primary" loading={statusBusy} disabled={test.questions.length === 0} onClick={() => void setStatus("APPROVED")}>
            <Check aria-hidden className="size-4" /> Approve test
          </Button>
        ))}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" aria-label="More actions">
            <MoreHorizontal aria-hidden className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={() => setModal("regenerate")}>
            <RefreshCw aria-hidden /> Regenerate questions
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem destructive onSelect={() => setModal("delete")}>
            <Trash2 aria-hidden /> Delete test
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={modal !== null} onOpenChange={(o) => !o && !busy && (setModal(null), setError(undefined))}>
        {modal === "regenerate" ? (
          <DialogContent
            title="Regenerate all questions?"
            description="Every question in this test is replaced with new ones written from the role's skills, and the test returns to draft. Your edits to the current questions are lost. This takes a few minutes."
            footer={
              <>
                <DialogClose asChild>
                  <Button variant="ghost" disabled={busy}>
                    Keep these questions
                  </Button>
                </DialogClose>
                <Button variant="primary" loading={busy} onClick={() => void regenerate()}>
                  {busy ? "Regenerating" : "Regenerate questions"}
                </Button>
              </>
            }
          >
            {error && <Alert tone="danger">{error}</Alert>}
          </DialogContent>
        ) : (
          <DialogContent
            title={`Delete "${test.title}"?`}
            description="The test and its questions are deleted. This can't be undone."
            footer={
              <>
                <DialogClose asChild>
                  <Button variant="ghost">Keep it</Button>
                </DialogClose>
                <Button variant="danger" loading={busy} onClick={() => void remove()}>
                  Delete test
                </Button>
              </>
            }
          />
        )}
      </Dialog>
      {dialog}
    </>
  );
}
