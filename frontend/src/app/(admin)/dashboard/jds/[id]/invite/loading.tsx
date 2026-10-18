/**
 * Skeleton for /dashboard/jds/[id]/invite — mirrors invite/page.tsx.
 * Server component fetches the JD + approved tests before rendering the form.
 */
export default function InviteLoading() {
  return (
    <div className="w-full animate-pulse">
      {/* Back link */}
      <div className="mb-6 h-4 w-24 rounded bg-slate-100" />

      {/* Header */}
      <div className="mb-6 space-y-2">
        <div className="h-7 w-40 rounded-lg bg-slate-200" />
        <div className="h-4 w-72 rounded bg-slate-100" />
      </div>

      {/* Invite form card */}
      <div className="space-y-5 rounded-2xl bg-slate-100 p-6 dark:bg-slate-800/60">
        {/* Name field */}
        <div className="space-y-1.5">
          <div className="h-4 w-28 rounded bg-slate-200" />
          <div className="h-10 w-full rounded-lg bg-white dark:bg-slate-900" />
        </div>

        {/* Email field */}
        <div className="space-y-1.5">
          <div className="h-4 w-24 rounded bg-slate-200" />
          <div className="h-10 w-full rounded-lg bg-white dark:bg-slate-900" />
        </div>

        {/* Test selector */}
        <div className="space-y-1.5">
          <div className="h-4 w-20 rounded bg-slate-200" />
          <div className="h-10 w-full rounded-lg bg-white dark:bg-slate-900" />
        </div>

        {/* Send button */}
        <div className="h-10 w-full rounded-lg bg-slate-200" />
      </div>
    </div>
  );
}
