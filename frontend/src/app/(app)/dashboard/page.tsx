import { LayoutDashboard } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireAppUser } from "@/server/session";

export const metadata: Metadata = { title: "Overview" };

// Phase 3 placeholder: the real overview (pipeline, recent results, activity) lands in Phase 4.
export default async function OverviewPage() {
  const user = await requireAppUser();
  const first = user.name.split(/\s+/)[0] ?? user.name;
  return (
    <>
      <PageHeader title={`Good to see you, ${first}`} description="Your hiring pipeline at a glance." />
      <div className="rounded-panel border border-line bg-surface">
        <EmptyState
          icon={LayoutDashboard}
          title="The overview is being rebuilt"
          description="Pipeline stats, recent results and activity arrive in the next phase. Use search or the sidebar to get around in the meantime."
        />
      </div>
    </>
  );
}
