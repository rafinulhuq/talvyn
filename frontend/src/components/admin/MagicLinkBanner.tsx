"use client";

import { useState } from "react";
import { Copy, Check, X } from "lucide-react";

export function MagicLinkBanner({
  link,
  email,
  onDismiss,
}: {
  link: string;
  email: string;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  return (
    <div className="mb-4 rounded-xl border border-warning/30 bg-warning-light p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-warning-dark">
          Token refreshed — email failed. Share this link with {email} directly:
        </p>
        <button
          type="button"
          onClick={onDismiss}
          className="ml-2 shrink-0 text-warning-dark/50 hover:text-warning-dark transition-colors"
          aria-label="Dismiss magic link notice"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-warning/20 bg-white px-3 py-2">
        <span className="flex-1 truncate font-mono text-[11px] text-slate-600 select-all">
          {link}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          aria-label={copied ? "Magic link copied" : "Copy magic link"}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-success" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    </div>
  );
}
