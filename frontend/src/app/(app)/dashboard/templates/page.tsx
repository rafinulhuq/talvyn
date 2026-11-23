import type { Metadata } from "next";
import { Templates, type Template } from "@/components/templates/templates";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { roleAtLeast } from "@/lib/roles";
import { loadErrorMessage, serverGet } from "@/server/api";
import { requireAppUser } from "@/server/session";

export const metadata: Metadata = { title: "Exam templates" };

export default async function TemplatesPage() {
  const [me, res] = await Promise.all([requireAppUser(), serverGet<{ items: Template[] }>("/api/v1/templates/?include_archived=true")]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Exam templates" className="pb-0" />
      {res.ok ? <Templates items={res.data.items} canEdit={roleAtLeast(me.role, "ADMIN")} /> : <ErrorState message={loadErrorMessage(res.status)} />}
    </div>
  );
}
