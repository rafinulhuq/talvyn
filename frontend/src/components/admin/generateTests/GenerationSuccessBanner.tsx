import { CheckCircle } from "lucide-react";

export function GenerationSuccessBanner({ testCount }: { testCount: number }) {
  return (
    <div className="flex w-full items-center gap-3 rounded-xl border border-success/20 bg-success-light px-4 py-3">
      <CheckCircle className="h-4 w-4 shrink-0 text-success" />
      <p className="text-sm font-medium text-success-dark">
        {testCount} tests generated! Refreshing…
      </p>
    </div>
  );
}
