import type { HomeContent } from "@/lib/cms/content";
import { cmsIcon } from "@/lib/cms/icons";
import { TiltBlock } from "@/components/ui/TiltBlock";

export function TrustedBySection({ content }: { content: HomeContent["trustedBy"] }) {
  return (
    <section className="border-b border-slate-300 bg-slate-50/50 py-10 font-sans text-slate-900 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-100">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <p className="mb-6 text-center text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {content.eyebrow || "Systems deployed across modern engineering teams"}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6">
          {content.companies.map((company) => (
            <span
              key={company}
              className="cursor-default rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold tracking-wider text-slate-700 shadow-xs hover:border-indigo-300 hover:text-indigo-600 transition-all dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-indigo-800 dark:hover:text-indigo-400"
            >
              {company}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

export function StatsSection({ items }: { items: HomeContent["stats"] }) {
  return (
    <section className="border-b border-slate-300 bg-white py-16 sm:py-20 font-sans text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {items.map(({ value, label, icon }, idx) => {
            const Icon = cmsIcon(icon);
            return (
              <TiltBlock
                key={label}
                tag={`Metric 0${idx + 1}`}
                className="flex flex-col justify-between"
              >
                <div className="flex items-center justify-between mb-4">
                  <span className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight dark:text-white">
                    {value}
                  </span>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
                <p className="text-xs text-slate-600 font-medium dark:text-slate-300">
                  {label}
                </p>
              </TiltBlock>
            );
          })}
        </div>
      </div>
    </section>
  );
}
