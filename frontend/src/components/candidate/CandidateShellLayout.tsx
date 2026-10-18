import { PageTransition } from "@/components/PageTransition";
import { BrandWordmark } from "@/components/BrandLogo";

export function CandidateShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 selection:bg-indigo-500 selection:text-white font-sans antialiased dark:bg-slate-950 dark:text-slate-100">
      <a
        href="#candidate-main"
        className="sr-only fixed left-3 top-3 z-50 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-medium text-white shadow-md focus:not-sr-only"
      >
        Skip to main content
      </a>

      <header className="border-b border-slate-200/80 bg-white/90 backdrop-blur-xs sticky top-0 z-30 shadow-xs dark:border-slate-800 dark:bg-slate-900/90">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <BrandWordmark variant="default" className="h-6 w-auto" />
            <span className="hidden sm:inline-block border-l border-slate-200 pl-3 text-xs font-semibold text-slate-500 dark:border-slate-800 dark:text-slate-400">
              Assessment Cockpit
            </span>
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-950/40 dark:text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live Session
          </div>
        </div>
      </header>

      <main id="candidate-main" tabIndex={-1} className="mx-auto max-w-4xl px-4 sm:px-6 py-10">
        <PageTransition>{children}</PageTransition>
      </main>
    </div>
  );
}
