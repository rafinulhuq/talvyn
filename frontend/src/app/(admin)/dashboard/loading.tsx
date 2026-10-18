import { PageSkeleton } from "@/components/ui/PageSkeleton";

export default function DashboardLoading() {
  return <PageSkeleton cards={5} rows={4} />;
}
