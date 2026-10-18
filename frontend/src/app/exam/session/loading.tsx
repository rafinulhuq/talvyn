import { Loader2 } from "lucide-react";

export default function TokenValidationLoading() {
  return (
    <div className="flex flex-col items-center gap-3 py-20 text-center text-black">
      <Loader2 className="h-8 w-8 animate-spin text-black" />
      <p className="font-mono text-xs font-bold uppercase tracking-wider text-neutral-600">
        CHECKING INVITATION TOKEN...
      </p>
    </div>
  );
}
