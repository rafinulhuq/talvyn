"use client";

import { Briefcase, FileUp, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, dataTableColumns } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { displaySeniority, jdStatus, jdTitle } from "@/lib/domain/jd";
import { formatRelative } from "@/lib/format";
import type { JobDescriptionListItem } from "@/types/jd";

const col = dataTableColumns<JobDescriptionListItem>();
const columns = col.columns([
  col.accessor((jd) => jdTitle(jd), {
    id: "title",
    header: "Role",
    cell: (info) => (
      <div className="flex flex-col">
        <span className="font-medium text-ink">{info.getValue()}</span>
        <span className="text-sm text-ink-muted">{displaySeniority(info.row.original.seniority_level) ?? "Seniority not set"}</span>
      </div>
    ),
  }),
  col.accessor((jd) => jdStatus(jd.parse_status, jd.generation_status, !!jd.job_title).label, {
    id: "status",
    header: "Status",
    cell: (info) => {
      const s = jdStatus(info.row.original.parse_status, info.row.original.generation_status, !!info.row.original.job_title);
      return (
        <Badge tone={s.tone} dot>
          {s.label}
        </Badge>
      );
    },
  }),
  col.accessor("source", {
    header: "Source",
    cell: (info) =>
      info.getValue() === "GENERATED" ? (
        <span className="inline-flex items-center gap-1.5 text-ink-muted">
          <Sparkles aria-hidden className="size-3.5" /> Written from brief
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 text-ink-muted">
          <FileUp aria-hidden className="size-3.5" /> {info.row.original.file_type ?? "File"} upload
        </span>
      ),
  }),
  col.accessor("created_at", {
    header: "Added",
    cell: (info) => <span className="text-ink-muted">{formatRelative(info.getValue())}</span>,
  }),
]);

export function JdTable({ items, total }: { items: JobDescriptionListItem[]; total: number }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? items.filter((jd) => `${jdTitle(jd)} ${jd.seniority_level ?? ""}`.toLowerCase().includes(needle)) : items;
  }, [items, q]);

  if (items.length === 0) {
    return (
      <div className="rounded-panel border border-line bg-surface">
        <EmptyState
          icon={Briefcase}
          title="No job descriptions yet"
          description="Add one to generate its assessment. Upload a PDF or Word file, or write it from a short brief."
          action={
            <Button variant="primary" size="sm" asChild>
              <Link href="/dashboard/jds/upload">New job description</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter by role or seniority"
          aria-label="Filter job descriptions"
          className="max-w-xs"
        />
        <p className="text-sm text-ink-muted">
          {filtered.length === total ? `${total} ${total === 1 ? "role" : "roles"}` : `${filtered.length} of ${total} roles`}
          {items.length < total && ` (showing the latest ${items.length})`}
        </p>
      </div>
      <DataTable
        label="Job descriptions"
        columns={columns}
        data={filtered}
        getRowId={(jd) => jd.id}
        onRowClick={(jd) => router.push(`/dashboard/jds/${jd.id}`)}
        empty={<EmptyState title={`No roles match "${q}"`} description="Try a different title or seniority." />}
      />
    </div>
  );
}
