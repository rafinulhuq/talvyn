"use client";

import { Ban, ClipboardCheck, MoreHorizontal, Send, TriangleAlert, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, dataTableColumns } from "@/components/ui/data-table";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip } from "@/components/ui/tooltip";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/api/client";
import { invitationStatus, isOpenInvitation } from "@/lib/domain/invitation";
import { formatDate, formatRelative } from "@/lib/format";
import type { Invitation, ResendResult } from "@/types/invitation";
import { ManualLink } from "./shared";

type Act = { kind: "revoke" | "resent"; inv: Invitation; link?: string | null } | null;

function RowMenu({ inv, onAct }: { inv: Invitation; onAct: (a: Act) => void }) {
  const router = useRouter();
  const open = isOpenInvitation(inv.status);

  async function resend() {
    const res = await api<ResendResult>(`/api/v1/invitations/${inv.id}/resend`, { method: "POST", body: { extend_expiry: true } });
    if (!res.ok) return toast({ title: "Couldn't resend", description: res.error.message, tone: "danger" });
    if (!res.data.email_sent && res.data.magic_link) onAct({ kind: "resent", inv, link: res.data.magic_link });
    else toast({ title: "Invitation resent", description: `New link sent. It expires ${formatDate(res.data.new_expires_at)}.`, tone: "success" });
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={`Actions for ${inv.candidate_name ?? "candidate"}`} onClick={(e) => e.stopPropagation()}>
          <MoreHorizontal aria-hidden className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem asChild>
          <Link href={`/dashboard/candidates/${inv.candidate_id}`}>
            <UserRound aria-hidden /> View candidate
          </Link>
        </DropdownMenuItem>
        {inv.attempt_id && (
          <DropdownMenuItem asChild>
            <Link href={`/dashboard/results/${inv.attempt_id}?c=${inv.candidate_id}`}>
              <ClipboardCheck aria-hidden /> View result
            </Link>
          </DropdownMenuItem>
        )}
        {open && (
          <DropdownMenuItem onSelect={() => void resend()}>
            <Send aria-hidden /> Resend with a new link
          </DropdownMenuItem>
        )}
        {open && (
          <DropdownMenuItem destructive onSelect={() => onAct({ kind: "revoke", inv })}>
            <Ban aria-hidden /> Revoke invitation
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function buildColumns(onAct: (a: Act) => void) {
  const col = dataTableColumns<Invitation>();
  return col.columns([
    col.accessor((i) => i.candidate_name ?? i.candidate_email ?? "", {
      id: "candidate",
      header: "Candidate",
      cell: (info) => {
        const i = info.row.original;
        return (
          <div className="flex min-w-48 flex-col">
            <span className="font-medium text-ink">{i.candidate_name ?? "Unnamed"}</span>
            <span className="text-sm text-ink-muted">{i.candidate_email}</span>
          </div>
        );
      },
    }),
    col.accessor("status", {
      header: "Status",
      cell: (info) => {
        const i = info.row.original;
        const s = invitationStatus(i.status);
        return (
          <span className="inline-flex items-center gap-2">
            <Badge tone={s.tone} dot>
              {s.label}
            </Badge>
            {i.flagged_duplicate_device && (
              <Tooltip content={i.flagged_duplicate_reason ?? "Another candidate used the same device."}>
                <span tabIndex={0} className="inline-flex items-center gap-1 text-sm text-warning">
                  <TriangleAlert aria-hidden className="size-3.5" /> Shared device
                </span>
              </Tooltip>
            )}
          </span>
        );
      },
    }),
    col.accessor("created_at", { header: "Invited", cell: (info) => <span className="text-ink-muted">{formatRelative(info.getValue())}</span> }),
    col.accessor("expires_at", {
      header: "Expires",
      cell: (info) => (isOpenInvitation(info.row.original.status) ? <span className="text-ink-muted">{formatDate(info.getValue())}</span> : <span className="text-ink-muted">No longer applies</span>),
    }),
    col.display({ id: "actions", header: () => <span className="sr-only">Actions</span>, cell: (info) => <RowMenu inv={info.row.original} onAct={onAct} /> }),
  ]);
}

export function InvitationTable({ items }: { items: Invitation[] }) {
  const router = useRouter();
  const [act, setAct] = useState<Act>(null);
  const [busy, setBusy] = useState(false);

  // Memoised: DataTable needs stable columns. setAct is a stable state setter.
  const columns = useMemo(() => buildColumns(setAct), []);

  async function revoke(inv: Invitation) {
    setBusy(true);
    const res = await api(`/api/v1/invitations/${inv.id}/revoke`, { method: "POST", body: {} });
    setBusy(false);
    setAct(null);
    if (!res.ok) return toast({ title: "Couldn't revoke", description: res.error.message, tone: "danger" });
    toast({ title: "Invitation revoked", description: `${inv.candidate_name ?? "The candidate"}'s link no longer works.` });
    router.refresh();
  }

  return (
    <>
      <DataTable label="Invitations" columns={columns} data={items} getRowId={(i) => i.id} onRowClick={(i) => router.push(`/dashboard/candidates/${i.candidate_id}`)} />
      <Dialog open={act !== null} onOpenChange={(o) => !o && setAct(null)}>
        {act?.kind === "revoke" ? (
          <DialogContent
            title={`Revoke ${act.inv.candidate_name ?? "this"} invitation?`}
            description="Their link stops working straight away. You can invite them again later."
            footer={
              <>
                <DialogClose asChild>
                  <Button variant="ghost">Keep it</Button>
                </DialogClose>
                <Button variant="danger" loading={busy} onClick={() => void revoke(act.inv)}>
                  Revoke invitation
                </Button>
              </>
            }
          />
        ) : act?.kind === "resent" && act.link ? (
          <DialogContent title="New link created">
            <ManualLink link={act.link} who={act.inv.candidate_name ?? "the candidate"} />
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  );
}
