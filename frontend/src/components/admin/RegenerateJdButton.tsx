/**
 * Regenerate a generated JD's text from its stored brief. Only shown for
 * source === "GENERATED" JDs. Kicks off POST /jd/{id}/regenerate, polls
 * /status until DRAFTING clears, then refreshes the page to show the new text.
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, AlertCircle } from "lucide-react";
import { clsx } from "clsx";
import { jdApi } from "@/lib/api/jd";

export function RegenerateJdButton({ jdId }: { jdId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  }, []);
  useEffect(() => stop, [stop]);

  async function handleClick() {
    if (busy) return;
    setBusy(true);
    setError(null);

    let res: Awaited<ReturnType<typeof jdApi.regenerate>>;
    try {
      res = await jdApi.regenerate(jdId);
    } catch {
      setBusy(false);
      setError("Could not start regeneration.");
      return;
    }
    if (!res.success) {
      setBusy(false);
      setError(res.error?.message ?? "Could not start regeneration.");
      return;
    }

    stop();
    pollRef.current = setInterval(async () => {
      const status = await jdApi.getStatus(jdId);
      if (!status.success) return;
      const g = status.data.generation_status;
      if (g === "IDLE") {
        stop();
        setBusy(false);
        router.refresh();
      } else if (g === "FAILED") {
        stop();
        setBusy(false);
        setError("Regeneration failed. Try again or edit the text manually.");
      }
    }, 2000);
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className={clsx(
          "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors",
          busy
            ? "cursor-not-allowed border-slate-200 text-slate-400"
            : "border-brand-200 text-brand-700 hover:bg-brand-50"
        )}
      >
        <RefreshCw className={clsx("h-4 w-4", busy && "animate-spin")} />
        {busy ? "Regenerating…" : "Regenerate from brief"}
      </button>
      {error && (
        <span className="flex items-center gap-1.5 text-xs text-red-600">
          <AlertCircle className="h-3.5 w-3.5" />
          {error}
        </span>
      )}
    </div>
  );
}
