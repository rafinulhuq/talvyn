"use client";

import { AssessmentErrorBoundary } from "@/components/candidate/AssessmentErrorBoundary";

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function CandidateExamError({ error, reset }: Props) {
  return (
    <AssessmentErrorBoundary
      error={error}
      reset={reset}
      logLabel="candidate exam error boundary"
    />
  );
}
