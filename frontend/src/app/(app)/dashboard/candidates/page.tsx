import { Users } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { CandidateTable } from "@/components/candidates/candidate-table";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { SearchParamInput } from "@/components/ui/search-param-input";
import { plural } from "@/lib/domain/test";
import { loadErrorMessage, serverGet } from "@/server/api";
import type { CandidateListItem } from "@/types/invitation";
import type { Paginated } from "@/types/jd";

export const metadata: Metadata = { title: "Candidates" };
const PAGE_SIZE = 25;

export default async function CandidatesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const page = pageParam(sp.page);
  const q = typeof sp.q === "string" ? sp.q.slice(0, 255) : "";
  const qs = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE), ...(q ? { search: q } : {}) });
  const res = await serverGet<Paginated<CandidateListItem>>(`/api/v1/candidates/?${qs}`);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Candidates"
        description={res.ok && !q ? `${plural(res.data.total, "person", "people")} across every role.` : "Everyone you've invited, across every role."}
      />
      <Suspense>
        <SearchParamInput label="Search candidates" placeholder="Search by name or email" />
      </Suspense>
      {!res.ok ? (
        <ErrorState message={loadErrorMessage(res.status)} />
      ) : (
        <>
          <CandidateTable
            items={res.data.items}
            empty={
              <EmptyState
                icon={Users}
                title={q ? "No one matches that search" : "No candidates yet"}
                description={q ? "Check the spelling, or search by email instead." : "Candidates appear here once you invite them to a role."}
              />
            }
          />
          <Pagination
            page={res.data.page}
            pageSize={res.data.page_size}
            total={res.data.total}
            totalPages={res.data.total_pages}
            href={(p) => `/dashboard/candidates?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) })}`}
          />
        </>
      )}
    </div>
  );
}
