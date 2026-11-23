"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/api/client";

export function DeleteCandidate({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  async function remove() {
    setBusy(true);
    const res = await api(`/api/v1/candidates/${id}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) return toast({ title: "Couldn't move to trash", description: res.error.message, tone: "danger" });
    setOpen(false);
    toast({ title: "Moved to trash", description: `${name} can be restored from Trash.` });
    router.push("/dashboard/candidates");
    router.refresh();
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Trash2 aria-hidden className="size-4" /> Move to trash
      </Button>
      <DialogContent
        title={`Move ${name} to trash?`}
        description="They disappear from the candidate directory. Their past results are kept, and they can be restored from Trash."
        footer={
          <>
            <DialogClose asChild>
              <Button variant="ghost">Keep</Button>
            </DialogClose>
            <Button variant="danger" loading={busy} onClick={() => void remove()}>
              Move to trash
            </Button>
          </>
        }
      />
    </Dialog>
  );
}
