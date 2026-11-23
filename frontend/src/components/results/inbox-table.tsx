"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { DataTable, dataTableColumns } from "@/components/ui/data-table";
import { RECOMMENDATION } from "@/lib/domain/invitation";
import { pct } from "@/lib/domain/evaluation";
import { formatRelative } from "@/lib/format";
import type { InboxItem } from "@/types/evaluation";

const STATUS: Record<string, { label: string; tone: "warning" | "success" | "danger" }> = {
  SUBMITTED: { label: "Waiting for scoring", tone: "warning" },
  EVALUATED: { label: "Scored", tone: "success" },
  TERMINATED: { label: "Ended for integrity", tone: "danger" },
};

const col = dataTableColumns<InboxItem>();
const columns = col.columns([
  col.accessor("candidate_name", {
    header: "Candidate",
    cell: (i) => (
      <div className="flex min-w-48 flex-col">
        <span className="font-medium text-ink">{i.getValue()}</span>
        <span className="text-sm text-ink-muted">{i.row.original.candidate_email}</span>
      </div>
    ),
  }),
  col.accessor("jd_title", {
    header: "Role and test",
    cell: (i) => (
      <div className="flex min-w-48 flex-col">
        <span className="text-ink">{i.getValue()}</span>
        <span className="text-sm text-ink-muted">{i.row.original.test_title}</span>
      </div>
    ),
  }),
  col.accessor("attempt_status", {
    header: "Status",
    cell: (i) => {
      const s = STATUS[i.getValue()] ?? { label: i.getValue(), tone: "warning" as const };
      return (
        <Badge tone={s.tone} dot>
          {s.label}
        </Badge>
      );
    },
  }),
  col.accessor((r) => r.percentage ?? -1, {
    id: "score",
    header: "Score",
    cell: (i) => <span className="tabular-nums text-ink">{pct(i.row.original.percentage)}</span>,
  }),
  col.accessor((r) => r.recommendation ?? "", {
    id: "rec",
    header: "Recommendation",
    cell: (i) => {
      const r = i.row.original.recommendation;
      return r ? <Badge tone={RECOMMENDATION[r].tone}>{RECOMMENDATION[r].label}</Badge> : <span className="text-ink-muted">None yet</span>;
    },
  }),
  col.accessor((r) => r.submitted_at ?? r.terminated_at ?? "", {
    id: "when",
    header: "Finished",
    cell: (i) => <span className="text-ink-muted">{i.getValue() ? formatRelative(i.getValue()) : "Not finished"}</span>,
  }),
]);

export function InboxTable({ items, empty }: { items: InboxItem[]; empty: ReactNode }) {
  const router = useRouter();
  return (
    <DataTable
      label="Results"
      columns={columns}
      data={items}
      getRowId={(r) => r.attempt_id}
      onRowClick={(r) => router.push(`/dashboard/results/${r.attempt_id}?c=${r.candidate_id}`)}
      empty={empty}
    />
  );
}
