"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";

/**
 * Signs out of Highgarden. Deliberately does the navigation itself
 * (window.location.href, a relative path) instead of letting the server
 * respond with a redirect — that way the browser resolves the target
 * against whatever origin the current page is already loaded from, which
 * is known-reachable, rather than an address the server reconstructs from
 * the request. See app/api/highgarden/lock/route.ts for the other half.
 */
export function SignOutButton() {
  const [pending, setPending] = useState(false);

  return (
    <button
      type="button"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        try {
          await fetch("/api/highgarden/lock", { method: "POST" });
        } finally {
          window.location.href = "/dashboard/highgarden/unlock";
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-700 transition-colors duration-150 hover:bg-brand-100 disabled:opacity-60 dark:bg-brand-950/40 dark:text-brand-300 dark:hover:bg-brand-950/70"
    >
      <LogOut className="h-3.5 w-3.5" />
      {pending ? "Signing out…" : "Sign out of Highgarden"}
    </button>
  );
}
