import { TiltBlock } from "@/components/ui/TiltBlock";
import type { HomeContent } from "@/lib/cms/content";
import { cmsIcon } from "@/lib/cms/icons";

export function FeaturesSection({ content }: { content: HomeContent["features"] }) {
  return (
    <section id="features" className="border-b border-slate-300 bg-slate-50/50 py-24 font-sans text-slate-900 scroll-mt-20 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-100">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="mb-16 text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
            {content.eyebrow || "Core Capabilities & System Matrix"}
          </p>
          <h2 className="font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl dark:text-white">
            {content.title || "Engineered for Complete Hiring Precision"}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm sm:text-base text-slate-600 font-normal dark:text-slate-300">
            {content.body || "Every layer of the Talvyn platform is optimized for signal fidelity and defensibility."}
          </p>
        </div>

        {/* 3D Bento Block Grid */}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {content.items.map(({ icon, title, body }, idx) => {
            const Icon = cmsIcon(icon);
            return (
              <TiltBlock
                key={title}
                tag={`Capability 0${idx + 1}`}
                className="flex flex-col justify-between h-full"
              >
                <div>
                  <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mb-2 text-base font-bold text-slate-900 tracking-tight dark:text-white">{title}</h3>
                  <p className="text-xs leading-relaxed text-slate-600 font-normal dark:text-slate-300">{body}</p>
                </div>

                <div className="mt-6 pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 font-medium dark:text-slate-400">
                  <span>Module Active</span>
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                </div>
              </TiltBlock>
            );
          })}
        </div>

      </div>
    </section>
  );
}
