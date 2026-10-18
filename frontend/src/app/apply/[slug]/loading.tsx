import { Loader2 } from "lucide-react";

export default function ApplyLinkLoading() {
  return (
    <div className="flex flex-col items-center gap-3 py-20 text-center">
      <Loader2 className="h-8 w-8 animate-spin text-brand-400" />
      <p className="text-sm text-slate-500">Loading assessment details…</p>
    </div>
  );
}
