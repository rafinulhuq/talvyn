/**
 * Dashboard-scoped 404 page.
 *
 * Shown when any page component inside /dashboard/* calls `notFound()` —
 * for example when a JD ID or Test ID in the URL doesn't exist in the DB.
 *
 * This is a Server Component (no hooks needed) and renders inside the
 * admin layout, so the sidebar and header remain visible.
 */

import Link from "next/link";
import { FileQuestion, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function DashboardNotFound() {
  return (
    <div className="flex flex-col items-center gap-5 py-24 text-center">
      {/* Icon */}
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
        <FileQuestion className="h-6 w-6 text-slate-400" />
      </div>

      {/* Copy */}
      <div className="max-w-sm">
        <p className="text-4xl font-bold text-slate-200">404</p>
        <p className="mt-2 text-base font-semibold text-slate-900">
          Page not found
        </p>
        <p className="mt-1 text-sm text-slate-500">
          This resource doesn&apos;t exist or may have been deleted.
        </p>
      </div>

      {/* Back button */}
      <Link href="/dashboard">
        <Button
          variant="secondary"
          leftIcon={<ArrowLeft className="h-3.5 w-3.5" />}
        >
          Back to dashboard
        </Button>
      </Link>
    </div>
  );
}
