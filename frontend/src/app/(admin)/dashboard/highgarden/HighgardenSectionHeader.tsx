import Link from "next/link";
import { Sprout } from "lucide-react";

export function HighgardenSectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <Link href="/dashboard/highgarden" className="text-sm font-medium text-brand-600 dark:text-brand-400">
        Back to Highgarden
      </Link>
      <div className="mt-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
        <Sprout className="h-4 w-4" />
        Highgarden
      </div>
      <h1 className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-50">{title}</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400">{description}</p>
    </div>
  );
}
