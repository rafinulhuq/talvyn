"use client";

import { MoreHorizontal, RefreshCw, ScanSearch, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/api/client";

export function AnalyzeButton({ jdId, again, disabled }: { jdId: string; again: boolean; disabled?: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  async function run() {
    setLoading(true);
    const res = await api(`/api/jd/${jdId}/analyze`, { base: "", method: "POST" });
    setLoading(false);
    if (!res.ok) return toast({ title: "Couldn't start the analysis", description: res.error.message, tone: "danger" });
    router.refresh();
  }
  return (
    <Button variant={again ? "secondary" : "primary"} loading={loading} disabled={disabled} onClick={run}>
      <ScanSearch aria-hidden className="size-4" />
      {again ? "Re-run analysis" : "Analyse skills"}
    </Button>
  );
}

export function JdMenu({ jdId, title, canRegenerate }: { jdId: string; title: string; canRegenerate: boolean }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState<null | { candidates?: number }>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function regenerate() {
    const res = await api(`/api/v1/jd/${jdId}/regenerate`, { method: "POST" });
    if (!res.ok) return toast({ title: "Couldn't rewrite the description", description: res.error.message, tone: "danger" });
    router.refresh();
  }

  async function remove(force: boolean) {
    setBusy(true);
    const res = await api(`/api/v1/jd/${jdId}${force ? "?force=true" : ""}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) {
      setConfirm(null);
      toast({ title: "Moved to trash", description: `${title} can be restored from Trash.` });
      router.push("/dashboard/jds");
      router.refresh();
      return;
    }
    if (res.error.code === "JD_HAS_CANDIDATES") {
      const n = Number(res.error.details?.candidate_count ?? 0);
      return setConfirm({ candidates: n });
    }
    setError(res.error.message);
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" aria-label="More actions">
            <MoreHorizontal aria-hidden className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {canRegenerate && (
            <DropdownMenuItem onSelect={() => void regenerate()}>
              <RefreshCw aria-hidden /> Rewrite from the brief
            </DropdownMenuItem>
          )}
          {canRegenerate && <DropdownMenuSeparator />}
          <DropdownMenuItem destructive onSelect={() => setConfirm({})}>
            <Trash2 aria-hidden /> Move to trash
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirm !== null} onOpenChange={(o) => !o && (setConfirm(null), setError(undefined))}>
        <DialogContent
          title={`Move "${title}" to trash?`}
          description={
            confirm?.candidates
              ? `${confirm.candidates} ${confirm.candidates === 1 ? "candidate has" : "candidates have"} been invited to this role. Their invitations stop working, but their results stay restorable from Trash.`
              : "Its tests go with it. You can restore it from Trash."
          }
          footer={
            <>
              <DialogClose asChild>
                <Button variant="ghost">Keep it</Button>
              </DialogClose>
              <Button variant="danger" loading={busy} onClick={() => void remove(Boolean(confirm?.candidates))}>
                {confirm?.candidates ? "Move to trash anyway" : "Move to trash"}
              </Button>
            </>
          }
        >
          {error && <Alert tone="danger">{error}</Alert>}
        </DialogContent>
      </Dialog>
    </>
  );
}
