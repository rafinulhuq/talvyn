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
    <div className="mb-4 rounded-xl border border-[#FACC15]/30 bg-[#FACC15]/10 p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-white">
          Token refreshed — email failed. Share this link with {email} directly:
        </p>
        <button
          type="button"
          onClick={onDismiss}
          className="ml-2 shrink-0 text-white/70 hover:text-white transition-colors"
          aria-label="Dismiss magic link notice"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-[#181A1F] px-3 py-2">
        <span className="flex-1 truncate font-mono text-[11px] text-white select-all">
          {link}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="shrink-0 rounded p-1 text-white/70 hover:bg-white/10 hover:text-white transition-colors"
          aria-label={copied ? "Magic link copied" : "Copy magic link"}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-[#4ADE80]" />
          ) : (
            <Copy className="h-3.5 w-3.5 text-white" />
          )}
        </button>
      </div>
    </div>
  );
}
