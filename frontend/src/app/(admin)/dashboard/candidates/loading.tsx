import { ListSkeleton } from "@/components/ui/Skeleton";

/**
 * Skeleton for /dashboard/candidates — mirrors candidates/page.tsx's
 * tinted-card/white-row-chip candidate list.
 */
export default function CandidatesLoading() {
  return (
    <div className="w-full animate-pulse">
      {/* Header */}
      <div className="mb-6 space-y-2">
        <div className="h-7 w-36 rounded-lg bg-slate-200" />
        <div className="h-4 w-64 rounded bg-slate-100" />
      </div>

      <ListSkeleton rows={6} />
    </div>
  );
}
