"use client";

import { ClipboardList, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, dataTableColumns } from "@/components/ui/data-table";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/api/client";
import { DIFFICULTY_LABEL, plural, testStatusBadge, testTypeLabel } from "@/lib/domain/test";
import { formatRelative } from "@/lib/format";
import type { TestSummary } from "@/types/test";
import { useInUseGuard } from "./in-use-confirm";

const col = dataTableColumns<TestSummary>();
const columns = col.columns([
  col.accessor("title", {
    header: "Test",
    cell: (info) => (
      <div className="flex min-w-56 flex-col">
        <span className="font-medium text-ink">{info.getValue()}</span>
        <span className="text-sm text-ink-muted">{testTypeLabel(info.row.original.test_type)}</span>
      </div>
    ),
  }),
  col.accessor("status", {
    header: "Status",
    cell: (info) => {
      const b = testStatusBadge(info.getValue());
      return (
        <Badge tone={b.tone} dot>
          {b.label}
        </Badge>
      );
    },
  }),
  col.accessor("question_count", {
    header: "Questions",
    cell: (info) => {
      const t = info.row.original;
      const parts = [t.mcq_count && `${t.mcq_count} multiple choice`, t.open_ended_count && `${t.open_ended_count} written`, t.code_count && `${t.code_count} code`].filter(Boolean);
      return (
        <div className="flex flex-col">
          <span className="text-ink">{info.getValue()}</span>
          <span className="text-sm text-ink-muted">{parts.join(", ")}</span>
        </div>
      );
    },
  }),
  col.accessor("duration_minutes", { header: "Time", cell: (info) => <span className="text-ink">{info.getValue()} min</span> }),
  col.accessor("total_marks", {
    header: "Marks",
    cell: (info) => {
      const pass = info.row.original.passing_marks;
      return (
        <div className="flex flex-col">
          <span className="text-ink">{info.getValue()}</span>
          <span className="text-sm text-ink-muted">{pass != null ? `Pass at ${pass}` : "No pass mark"}</span>
        </div>
      );
    },
  }),
  col.accessor("difficulty", { header: "Difficulty", cell: (info) => <span className="text-ink-muted">{DIFFICULTY_LABEL[info.getValue()]}</span> }),
  col.accessor("updated_at", { header: "Updated", cell: (info) => <span className="text-ink-muted">{formatRelative(info.getValue())}</span> }),
]);

export function TestsTable({ jdId, tests }: { jdId: string; tests: TestSummary[] }) {
  const router = useRouter();
  const { guard, dialog } = useInUseGuard();
  const [confirm, setConfirm] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  const done = (n: number) => {
    toast({ title: n === 1 ? "Test deleted" : `${n} tests deleted` });
    setConfirm(null);
    router.refresh();
  };

  async function remove(ids: string[]) {
    setBusy(true);
    const run = (force: boolean) => api<{ deleted_count: number }>("/api/v1/tests/bulk-delete", { method: "POST", body: { test_ids: ids, force } });
    const res = await guard(run, (r) => (r.ok ? done(r.data.deleted_count) : toast({ title: "Couldn't delete", description: r.error.message, tone: "danger" })));
    setBusy(false);
    if (res === null) return setConfirm(null);
    if (!res.ok) return toast({ title: "Couldn't delete", description: res.error.message, tone: "danger" });
    done(res.data.deleted_count);
  }

  return (
    <>
      <DataTable
        label="Tests"
        columns={columns}
        data={tests}
        getRowId={(t) => t.id}
        selectable
        onRowClick={(t) => router.push(`/dashboard/jds/${jdId}/tests/${t.id}`)}
        bulkActions={(ids) => (
          <Button size="sm" variant="secondary" onClick={() => setConfirm(ids)}>
            <Trash2 aria-hidden className="size-3.5" /> Delete
          </Button>
        )}
        empty={<EmptyState icon={ClipboardList} title="No tests yet" description="Generate them from this role's skills." />}
      />
      <Dialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent
          title={`Delete ${plural(confirm?.length ?? 0, "test")}?`}
          description="Their questions are deleted too. This can't be undone."
          footer={
            <>
              <DialogClose asChild>
                <Button variant="ghost">Keep them</Button>
              </DialogClose>
              <Button variant="danger" loading={busy} onClick={() => confirm && void remove(confirm)}>
                Delete
              </Button>
            </>
          }
        />
      </Dialog>
      {dialog}
    </>
  );
}
