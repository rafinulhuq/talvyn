import { PageSkeleton } from "@/components/ui/PageSkeleton";

export default function UsersLoading() {
  return <PageSkeleton cards={0} rows={7} action />;
}
