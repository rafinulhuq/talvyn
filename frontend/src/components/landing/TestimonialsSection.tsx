import { Star } from "lucide-react";
import { TiltBlock } from "@/components/ui/TiltBlock";
import type { HomeContent } from "@/lib/cms/content";

export function TestimonialsSection({ content }: { content: HomeContent["testimonials"] }) {
  return (
    <section id="testimonials" className="border-b border-slate-300 bg-white py-24 font-sans text-slate-900 scroll-mt-20 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="mb-16 text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
            {content.eyebrow || "Field Reports & Operator Feedback"}
          </p>
          <h2 className="font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl dark:text-white">
            {content.title || "Validated by Engineering Leaders"}
          </h2>
        </div>

        {/* Testimonials Block Grid */}
        <div className="grid gap-6 md:grid-cols-3">
          {content.quotes.map(({ text, name, role, stars }, idx) => (
            <TiltBlock
              key={`${name}-${role}`}
              tag={`Feedback 0${idx + 1}`}
              className="flex flex-col justify-between h-full"
            >
              <div>
                <div className="mb-4 flex gap-1">
                  {Array.from({ length: Math.max(0, Math.min(stars, 5)) }).map((_, i) => (
                    <Star
                      key={i}
                      className="h-4 w-4 fill-amber-400 text-amber-400"
                    />
                  ))}
                </div>
                <p className="text-xs sm:text-sm leading-relaxed text-slate-700 italic font-normal dark:text-slate-300">
                  &ldquo;{text}&rdquo;
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-50 border border-indigo-200 text-xs font-bold text-indigo-600 dark:bg-indigo-950/60 dark:border-indigo-800 dark:text-indigo-400">
                  {name.charAt(0)}
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900 dark:text-white">{name}</p>
                  <p className="text-[11px] text-slate-500 font-normal dark:text-slate-400">{role}</p>
                </div>
              </div>
            </TiltBlock>
          ))}
        </div>

      </div>
    </section>
  );
}
