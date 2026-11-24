"use client";

import { Archive, Check, Mail, MoreHorizontal, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/api/client";
import type { FeedbackStatus } from "@/lib/highgarden";

export function FeedbackActions({ id, status }: { id: string; status: FeedbackStatus }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function setStatus(next: FeedbackStatus) {
    const res = await api(`/api/highgarden/feedback/${id}`, { method: "PATCH", base: "", body: { status: next } });
    if (!res.ok) return toast({ title: "Not changed", description: res.error.message, tone: "danger" });
    router.refresh();
  }
  async function remove() {
    setBusy(true);
    const res = await api(`/api/highgarden/feedback/${id}`, { method: "DELETE", base: "" });
    setBusy(false);
    setConfirming(false);
    if (!res.ok) return toast({ title: "Not deleted", description: res.error.message, tone: "danger" });
    toast({ title: "Feedback deleted" });
    router.refresh();
  }

  return (
    <div className="flex items-center gap-1">
      {status === "UNREAD" && (
        <Button size="sm" variant="secondary" onClick={() => void setStatus("READ")}>
          <Check aria-hidden className="size-3.5" /> Mark read
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" aria-label="Feedback actions">
            <MoreHorizontal aria-hidden className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {status !== "UNREAD" && (
            <DropdownMenuItem onSelect={() => void setStatus("UNREAD")}>
              <Mail aria-hidden /> Mark unread
            </DropdownMenuItem>
          )}
          {status !== "ARCHIVED" && (
            <DropdownMenuItem onSelect={() => void setStatus("ARCHIVED")}>
              <Archive aria-hidden /> Archive
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem destructive onSelect={() => setConfirming(true)}>
            <Trash2 aria-hidden /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent
          title="Delete this feedback?"
          description="It's removed for good. Archive it instead if you might need it later."
          footer={
            <>
              <DialogClose asChild>
                <Button variant="secondary">Cancel</Button>
              </DialogClose>
              <Button variant="danger" loading={busy} onClick={() => void remove()}>
                Delete
              </Button>
            </>
          }
        />
      </Dialog>
    </div>
  );
}
