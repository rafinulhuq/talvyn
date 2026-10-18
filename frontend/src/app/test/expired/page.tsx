import type { Metadata } from "next";
import { TimerOff } from "lucide-react";
import { getPublicCmsContent } from "@/lib/cms/publicContent";

export const metadata: Metadata = { title: "Link Expired" };

export default async function ExpiredPage() {
  const cms = await getPublicCmsContent();
  const copy = cms.candidate_experience.expiredPage;

  return (
    <div className="flex flex-col items-center gap-6 py-16 text-center text-slate-900 font-sans">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 shadow-sm">
        <TimerOff className="h-8 w-8 stroke-[2.2]" />
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
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
          {copy.nextTitle}
        </p>
        <p className="text-xs text-slate-600 leading-relaxed font-normal">
          {copy.nextBody}
        </p>
      </div>
    </div>
  );
}
