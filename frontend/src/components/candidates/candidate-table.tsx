"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { DataTable, dataTableColumns } from "@/components/ui/data-table";
import { formatRelative } from "@/lib/format";
import type { CandidateListItem } from "@/types/invitation";

const col = dataTableColumns<CandidateListItem>();
const columns = col.columns([
  col.accessor("name", {
    header: "Candidate",
    cell: (info) => (
      <div className="flex min-w-48 flex-col">
        <span className="font-medium text-ink">{info.getValue()}</span>
        <span className="text-sm text-ink-muted">{info.row.original.email}</span>
      </div>
    ),
  }),
  col.accessor("candidate_number", { header: "ID", cell: (info) => <span className="text-ink-muted">#{info.getValue()}</span> }),
  col.accessor("completed_attempts", {
    header: "Tests",
    cell: (info) => {
      const c = info.row.original;
      return (
        <span className="text-ink">
          {c.completed_attempts} of {c.total_attempts} finished
        </span>
      );
    },
  }),
  col.accessor((c) => c.last_activity_at ?? c.created_at, {
    id: "activity",
    header: "Last activity",
    cell: (info) => <span className="text-ink-muted">{info.row.original.last_activity_at ? formatRelative(info.getValue()) : `Added ${formatRelative(info.getValue())}`}</span>,
  }),
]);

/** Sorting here only reorders the current page; the server orders across pages. */
export function CandidateTable({ items, empty }: { items: CandidateListItem[]; empty: ReactNode }) {
  const router = useRouter();
  return <DataTable label="Candidates" columns={columns} data={items} getRowId={(c) => c.id} onRowClick={(c) => router.push(`/dashboard/candidates/${c.id}`)} empty={empty} />;
}
