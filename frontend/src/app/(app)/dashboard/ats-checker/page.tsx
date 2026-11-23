import type { Metadata } from "next";
import { AtsChecker } from "@/components/tools/ats-checker";
import { PageHeader } from "@/components/ui/page-header";
import { jdTitle } from "@/lib/domain/jd";
import { serverGet } from "@/server/api";
import type { JobDescriptionListItem, Paginated } from "@/types/jd";

export const metadata: Metadata = { title: "Résumé ATS check" };

export default async function AtsCheckerPage() {
  const jds = await serverGet<Paginated<JobDescriptionListItem>>("/api/v1/jd/?page=1&page_size=100");
  // Only analysed roles have skills to match against.
  const roles = jds.ok ? jds.data.items.filter((j) => j.job_title).map((j) => ({ id: j.id, title: jdTitle(j) })) : [];
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Résumé ATS check" description="See how an applicant tracking system is likely to read a résumé, and what would help it get through." className="pb-0" />
      <AtsChecker roles={roles} />
    </div>
  );
}
