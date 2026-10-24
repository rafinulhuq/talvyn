import { Star } from "lucide-react";
import type { HomeContent } from "@/lib/cms/content";

export function TestimonialsSection({ content }: { content: HomeContent["testimonials"] }) {
  return (
    <section id="testimonials" className="mt-28">
      <div className="mx-auto max-w-[1160px] px-5 sm:px-8">
        {/* Header */}
        <div className="text-center mb-14">
          <span className="font-mono text-[12px] uppercase tracking-[0.14em] text-[#F2D74E] block">
            {content.eyebrow || "Field Reports & Operator Feedback"}
          </span>
          <h2 className="mt-3.5 text-[clamp(30px,4vw,44px)] font-[650] tracking-[-0.035em] max-w-[20ch] mx-auto text-balance text-white">
            {content.title || "Validated by Engineering Leaders"}
          </h2>
        </div>

        {/* Testimonials Grid */}
        <div className="grid gap-4 md:grid-cols-3">
          {content.quotes.map(({ text, name, role, stars }, idx) => (
            <div
              key={`${name}-${role}`}
              className="rounded-[14px] border border-white/[0.08] bg-[#121317] p-6 flex flex-col justify-between"
            >
              <div>
                <div className="mb-4 flex gap-1">
                  {Array.from({ length: Math.max(0, Math.min(stars, 5)) }).map((_, i) => (
                    <Star
                      key={i}
                      className="h-3.5 w-3.5 fill-[#FACC15] text-[#FACC15]"
                    />
                  ))}
                </div>
                <blockquote className="text-[14px] leading-relaxed text-white">
                  <span className="text-[#F2D74E] font-bold text-base mr-1">“</span>
                  {text}
                  <span className="text-[#F2D74E] font-bold text-base ml-1">”</span>
                </blockquote>
              </div>

              <div className="mt-6 pt-4 border-t border-white/[0.06] flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#181A1F] border border-white/[0.08] text-xs font-mono font-bold text-[#F2D74E]">
                  {name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                </div>
                <div>
                  <p className="text-[14px] font-semibold text-white">{name}</p>
                  <p className="text-[12px] text-[#8A8F98]">{role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
