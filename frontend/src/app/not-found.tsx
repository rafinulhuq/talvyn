/**
 * Global 404 fallback — shown for any URL that doesn't match a route.
 *
 * Renders outside the admin layout (no sidebar/header), so it uses
 * a full-screen centered layout instead.
 *
 * The dashboard-scoped not-found.tsx at (admin)/dashboard/not-found.tsx
 * takes precedence for any notFound() call inside /dashboard/* routes,
 * because Next.js uses the nearest not-found.tsx in the tree.
 */

import Link from "next/link";
import { FileQuestion } from "lucide-react";

export default function GlobalNotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-slate-50 text-center px-4">
      {/* Icon */}
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-card">
        <FileQuestion className="h-7 w-7 text-slate-400" />
      </div>

      {/* Copy */}
      <div className="max-w-sm">
        <p className="text-5xl font-bold text-slate-200">404</p>
        <p className="mt-3 text-lg font-semibold text-slate-900">
          Page not found
        </p>
        <p className="mt-1 text-sm text-slate-500">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
      </div>

      {/* Navigation */}
      <div className="flex items-center gap-4 text-sm">
        <Link
          href="/dashboard"
          className="rounded-lg bg-[#F2D74E] px-4 py-2 font-semibold text-[#1A1600] hover:bg-[#F7E27A] transition-colors"
        >
          Go to dashboard
        </Link>
        <Link
          href="/login"
          className="text-white/70 hover:text-white transition-colors"
        >
          Sign in
        </Link>
      </div>
    </div>
  );
}
