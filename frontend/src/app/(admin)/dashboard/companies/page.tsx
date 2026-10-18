import type { Metadata } from "next";
import { Building2 } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata: Metadata = { title: "Companies" };

export default function CompaniesPage() {
  return (
    <div className="w-full">
      <PageHeader
        title="Companies"
        subtitle="Multi-company / multi-tenant workspaces."
        className="mb-8"
      />
      <EmptyState
        icon={<Building2 className="h-6 w-6" />}
        title="Coming soon"
        description="Talvyn is currently single-tenant — one workspace, shared by every admin. Multi-company support is on the roadmap but not built yet; this page is a placeholder."
      />
    </div>
  );
}
