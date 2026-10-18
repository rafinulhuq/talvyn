"use client";

import { useState } from "react";
import { Check, Link2 } from "lucide-react";

function XLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function LinkedInLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455zM5.337 7.433a2.062 2.062 0 1 1 0-4.125 2.062 2.062 0 0 1 0 4.125M7.119 20.452H3.555V9h3.564zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0" />
    </svg>
  );
}

const buttonClasses =
  "flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200/80 bg-white text-slate-700 shadow-xs hover:border-slate-300 hover:text-indigo-600 hover:bg-slate-50 active:scale-95 transition-all dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:text-indigo-400 dark:hover:bg-slate-800";

function pageUrl(): string {
  return typeof window === "undefined" ? "" : window.location.href;
}

function openShare(url: string) {
  window.open(url, "_blank", "noopener,noreferrer,width=600,height=500");
}

export function ShareButtons({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(pageUrl());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (http, permissions) — nothing actionable.
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label="Share on X"
        className={buttonClasses}
        onClick={() =>
          openShare(
            `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(pageUrl())}`
          )
        }
      >
        <XLogo className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label="Share on LinkedIn"
        className={buttonClasses}
        onClick={() =>
          openShare(
            `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(pageUrl())}`
          )
        }
      >
        <LinkedInLogo className="h-4 w-4" />
      </button>
      <button type="button" aria-label="Copy link" className={buttonClasses} onClick={copyLink}>
        {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Link2 className="h-4 w-4" />}
      </button>
    </div>
  );
}
