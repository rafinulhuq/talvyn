import type { HomeContent } from "@/lib/cms/content";

export function TrustedBySection({ content }: { content: HomeContent["trustedBy"] }) {
  return (
    <section className="mt-24 text-center">
      <div className="mx-auto max-w-[1160px] px-5 sm:px-8">
        <p className="text-[13px] text-[#5A5F68]">
          {content.eyebrow || "Trusted by engineering teams at"}
        </p>

        <div className="mt-6 flex items-center justify-center flex-wrap gap-12 max-[600px]:gap-7 text-white/55">
          {content.companies && content.companies.length > 0 ? (
            content.companies.map((company, i) => {
              // Give each company a distinct clean typographic treatment
              const treatments = [
                "text-[20px] font-bold tracking-[-0.03em]",
                "text-[22px] font-light tracking-[0.02em]",
                "text-[14px] font-semibold tracking-[0.32em]",
                "text-[22px] italic font-semibold font-serif",
                "font-mono text-[17px] font-medium",
                "text-[20px] font-extrabold tracking-[-0.05em]",
              ];
              const treatment = treatments[i % treatments.length];
              return (
                <span key={company} className={treatment}>
                  {company}
                </span>
              );
            })
          ) : (
            <>
              <span className="text-[20px] font-bold tracking-[-0.03em]">Northwind</span>
              <span className="text-[22px] font-light tracking-[0.02em]">lumen</span>
              <span className="text-[14px] font-semibold tracking-[0.32em]">ARCADIA</span>
              <span className="text-[22px] italic font-semibold font-serif">Kite</span>
              <span className="font-mono text-[17px] font-medium">parallel</span>
              <span className="text-[20px] font-extrabold tracking-[-0.05em]">Oxide</span>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

export function StatsSection({ items }: { items: HomeContent["stats"] }) {
  return (
    <section className="mt-20">
      <div className="mx-auto max-w-[1160px] px-5 sm:px-8">
        <div className="grid grid-cols-4 max-[800px]:grid-cols-2 max-[500px]:grid-cols-1 gap-4">
          {items.map(({ value, label }, idx) => (
            <div
              key={label}
              className="rounded-[14px] border border-white/[0.08] bg-[#121317] p-6 flex flex-col justify-between"
            >
              <span className="text-[11px] uppercase tracking-[0.08em] text-[#5A5F68] font-mono">
                {`Metric 0${idx + 1}`}
              </span>
              <div className="mt-4">
                <span className="text-3xl sm:text-4xl font-semibold font-mono tracking-tight text-white tabular-nums">
                  {value}
                </span>
                <p className="mt-1 text-[13px] text-[#8A8F98] leading-relaxed">
                  {label}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
