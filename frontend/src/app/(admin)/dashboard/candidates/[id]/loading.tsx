import { PageSkeleton } from "@/components/ui/PageSkeleton";

export default function CandidateDetailLoading() {
  return <PageSkeleton cards={4} rows={4} />;
}
