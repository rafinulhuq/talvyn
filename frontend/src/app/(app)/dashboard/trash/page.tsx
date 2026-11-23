import { Trash2 } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TrashTable, type TrashItem } from "@/components/templates/trash-table";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { roleAtLeast } from "@/lib/roles";
import { loadErrorMessage, serverGet } from "@/server/api";
import { requireAppUser } from "@/server/session";

export const metadata: Metadata = { title: "Trash" };

export default async function TrashPage() {
  const me = await requireAppUser();
  if (!roleAtLeast(me.role, "SUPER_ADMIN")) redirect("/dashboard");
  const res = await serverGet<{ items: TrashItem[]; total: number }>("/api/v1/trash");
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Trash" description="Deleted job descriptions, tests, candidates and blog posts. Restore them, or delete them for good." className="pb-0" />
      {!res.ok ? (
        <ErrorState message={loadErrorMessage(res.status)} />
      ) : (
        <div className="overflow-hidden rounded-panel border border-line bg-surface">
          {res.data.items.length === 0 ? <EmptyState icon={Trash2} title="Trash is empty" description="Anything you delete from a list lands here first." /> : <TrashTable items={res.data.items} />}
        </div>
      )}
    </div>
  );
}
