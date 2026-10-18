/**
 * Skeleton for /dashboard/results/by-jd — mirrors by-jd/page.tsx's JD list.
 */

import { Skeleton, ListSkeleton } from "@/components/ui/Skeleton";

export default function ResultsByJdLoading() {
  return (
    <div className="w-full">
      <div className="mb-6 space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-72" />
      </div>
      <ListSkeleton rows={4} />
    </div>
  );
}
