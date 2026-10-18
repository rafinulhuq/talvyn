import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { ShieldAlert } from "lucide-react";

import { CmpClient } from "@/components/admin/CmsClient";
import { ErrorState } from "@/components/ui/ErrorState";
import { PageHeader } from "@/components/ui/PageHeader";
import { authOptions } from "@/lib/auth";

export const metadata: Metadata = { title: "CMP" };
export const revalidate = 0;

export default async function CmpPage() {
  const session = await getServerSession(authOptions);

  if (session?.user?.role !== "SUPER_ADMIN") {
    return (
      <div className="w-full">
        <PageHeader title="CMP" className="mb-8" />
        <ErrorState
          icon={<ShieldAlert className="h-6 w-6" />}
          title="Super Admin access required"
          description="Only a Super Admin can manage public CMP content."
        />
      </div>
    );
  }

  return <CmpClient />;
}
