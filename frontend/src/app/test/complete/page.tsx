import type { Metadata } from "next";
import { CheckCircle } from "lucide-react";
import { getPublicCmsContent } from "@/lib/cms/publicContent";

export const metadata: Metadata = { title: "Assessment Complete" };

export default async function CompletePage() {
  const cms = await getPublicCmsContent();
  const copy = cms.candidate_experience.completion;

  return (
    <div className="flex flex-col items-center gap-6 py-16 text-center text-slate-900 font-sans">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 shadow-sm">
        <CheckCircle className="h-8 w-8 stroke-[2.2]" />
      </div>
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
          {copy.heading}
        </h1>
        <p className="mt-2 max-w-sm text-sm text-slate-600 font-normal leading-relaxed">
          {copy.body}
        </p>
      </div>
      <div className="w-full max-w-sm rounded-2xl border border-slate-300 bg-white p-6 text-left shadow-sm ring-1 ring-slate-900/5">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
          {copy.nextTitle}
        </p>
        <ul className="flex flex-col gap-2.5">
          {copy.nextItems.map((item) => (
            <li key={item} className="flex items-start gap-2.5 text-xs text-slate-700 leading-relaxed">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
