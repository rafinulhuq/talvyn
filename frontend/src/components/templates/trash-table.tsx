"use client";

import { RotateCcw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/api/client";
import { formatRelative } from "@/lib/format";

export type TrashItem = { entity_type: "jd" | "test" | "candidate" | "blog" | string; id: string; label: string; sublabel: string | null; deleted_at: string };

const KIND: Record<string, { label: string; purge: string }> = {
  jd: { label: "Job description", purge: "Its tests, invitations and results are deleted with it." },
  test: { label: "Test", purge: "Its questions and any attempts at it are deleted with it." },
  candidate: { label: "Candidate", purge: "Their invitations, answers and results are deleted with them." },
  blog: { label: "Blog post", purge: "The post is deleted for good." },
};

export function TrashTable({ items }: { items: TrashItem[] }) {
  const router = useRouter();
  const [purging, setPurging] = useState<TrashItem | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function restore(i: TrashItem) {
    setBusy(i.id);
    const res = await api(`/api/v1/trash/${i.entity_type}/${i.id}/restore`, { method: "POST", body: {} });
    setBusy(null);
    if (!res.ok) return toast({ title: "Not restored", description: res.error.message, tone: "danger" });
    toast({ title: `${i.label} restored`, tone: "success" });
    router.refresh();
  }
  async function purge(i: TrashItem) {
    setBusy(i.id);
    const res = await api(`/api/v1/trash/${i.entity_type}/${i.id}`, { method: "DELETE" });
    setBusy(null);
    setPurging(null);
    if (!res.ok) return toast({ title: "Not deleted", description: res.error.message, tone: "danger" });
    toast({ title: `${i.label} deleted for good` });
    router.refresh();
  }

  return (
    <>
      <Table aria-label="Trash">
        <THead>
          <tr>
            <TH>Item</TH>
            <TH>Type</TH>
            <TH>Moved to trash</TH>
            <TH className="text-right">
              <span className="sr-only">Actions</span>
            </TH>
          </tr>
        </THead>
        <tbody>
          {items.map((i) => (
            <TR key={`${i.entity_type}-${i.id}`}>
              <TD>
                <span className="block font-medium text-ink">{i.label}</span>
                {i.sublabel && <span className="text-sm text-ink-muted">{i.sublabel}</span>}
              </TD>
              <TD>
                <Badge>{KIND[i.entity_type]?.label ?? i.entity_type}</Badge>
              </TD>
              <TD className="text-ink-muted">{formatRelative(i.deleted_at)}</TD>
              <TD>
                <span className="flex justify-end gap-2">
                  <Button size="sm" variant="secondary" loading={busy === i.id && !purging} onClick={() => void restore(i)}>
                    <RotateCcw aria-hidden className="size-3.5" /> Restore
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setPurging(i)} aria-label={`Delete ${i.label} for good`}>
                    <Trash2 aria-hidden className="size-3.5" />
                  </Button>
                </span>
              </TD>
            </TR>
          ))}
        </tbody>
      </Table>
      <Dialog open={purging !== null} onOpenChange={(o) => !o && setPurging(null)}>
        <DialogContent
          title={`Delete ${purging?.label ?? "this"} for good?`}
          description={`${KIND[purging?.entity_type ?? ""]?.purge ?? ""} This can't be undone.`}
          footer={
            <>
              <DialogClose asChild>
                <Button variant="ghost">Keep in trash</Button>
              </DialogClose>
              <Button variant="danger" loading={busy === purging?.id} onClick={() => purging && void purge(purging)}>
                Delete for good
              </Button>
            </>
          }
        />
      </Dialog>
    </>
  );
}
