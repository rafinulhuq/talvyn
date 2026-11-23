import { ClipboardCheck } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { InboxFilters } from "@/components/results/inbox-filters";
import { InboxTable } from "@/components/results/inbox-table";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { jdTitle } from "@/lib/domain/jd";
import { plural } from "@/lib/domain/test";
import { loadErrorMessage, serverGet } from "@/server/api";
import type { InboxItem } from "@/types/evaluation";
import type { JobDescriptionListItem, Paginated } from "@/types/jd";

export const metadata: Metadata = { title: "Results" };
const PAGE_SIZE = 25;
type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export default async function ResultsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const page = pageParam(sp.page);
  const f = {
    search: one(sp.q)?.slice(0, 255),
    jd_id: one(sp.jd),
    status: ["SUBMITTED", "EVALUATED", "TERMINATED"].includes(one(sp.status) ?? "") ? one(sp.status) : undefined,
    recommendation: ["STRONG_HIRE", "HIRE", "MAYBE", "NO_HIRE"].includes(one(sp.rec) ?? "") ? one(sp.rec) : undefined,
    integrity: ["clean", "violation"].includes(one(sp.integrity) ?? "") ? one(sp.integrity) : undefined,
    date_from: /^\d{4}-\d{2}-\d{2}$/.test(one(sp.from) ?? "") ? one(sp.from) : undefined,
    date_to: /^\d{4}-\d{2}-\d{2}$/.test(one(sp.to) ?? "") ? one(sp.to) : undefined,
  };
  const qs = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
  for (const [k, v] of Object.entries(f)) if (v) qs.set(k, v);
  const filtered = Object.values(f).some(Boolean);

  const [res, jds] = await Promise.all([
    serverGet<Paginated<InboxItem>>(`/api/v1/evaluation/inbox?${qs}`),
    serverGet<Paginated<JobDescriptionListItem>>("/api/v1/jd/?page=1&page_size=100"),
  ]);
  const roles = jds.ok ? jds.data.items.map((j) => ({ id: j.id, title: jdTitle(j) })) : [];
  const keep = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" && k !== "page" ? [[k, v]] : [])));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Results"
        description={res.ok && !filtered ? `${plural(res.data.total, "finished test")} across every role. Open one to see the full report.` : "Finished tests across every role."}
        className="pb-1"
      />
      <Suspense>
        <InboxFilters roles={roles} />
      </Suspense>
      {!res.ok ? (
        <ErrorState message={loadErrorMessage(res.status)} />
      ) : (
        <>
          <InboxTable
            items={res.data.items}
            empty={
              <EmptyState
                icon={ClipboardCheck}
                title={filtered ? "Nothing matches these filters" : "No finished tests yet"}
                description={filtered ? "Clear a filter or widen the dates." : "Results appear here as soon as a candidate submits a test or a test ends."}
              />
            }
          />
          <Pagination
            page={res.data.page}
            pageSize={res.data.page_size}
            total={res.data.total}
            totalPages={res.data.total_pages}
            href={(p) => `/dashboard/results?${new URLSearchParams([...keep, ["page", String(p)]])}`}
          />
        </>
      )}
    </div>
  );
}
