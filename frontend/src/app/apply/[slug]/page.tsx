/**
 * Public assessment registration page — /apply/[slug]
 *
 * Anyone with this URL can open it (no session, no magic-link token).
 * It only ever shows assessment-level info (JD title, test list) — never
 * a candidate's personal data or attempt. Submitting the form below mints
 * a brand-new private invitation and redirects to /tests/[token].
 */

import type { Metadata } from "next";
import { AlertCircle, ClipboardList, Clock } from "lucide-react";
import { getPublicCmsContent } from "@/lib/cms/publicContent";
import type { PublicLinkResolveResponse } from "@/types/public_link";
import { RegisterForm } from "./RegisterForm";

export const metadata: Metadata = { title: "Assessment Registration" };

interface Props {
  params: Promise<{ slug: string }>;
}

async function resolveLink(slug: string): Promise<PublicLinkResolveResponse> {
  const baseUrl = process.env.FASTAPI_INTERNAL_URL ?? "http://localhost:8000";
  const fallback: PublicLinkResolveResponse = {
    valid: false,
    jd_title: null,
    link_title: null,
    tests: [],
    reason: "not_found",
  };
  try {
    const res = await fetch(`${baseUrl}/api/v1/public-links/resolve/${slug}`, {
      cache: "no-store",
    });
    if (!res.ok) return fallback;
    return res.json();
  } catch {
    return fallback;
  }
}

export default async function ApplyPage({ params }: Props) {
  const { slug } = await params;
  const [resolved, cms] = await Promise.all([resolveLink(slug), getPublicCmsContent()]);
  const applyCopy = cms.candidate_experience.applyLanding;

  if (!resolved.valid) {
    const reason = resolved.reason ?? "not_found";
    const copy =
      cms.candidate_experience.invalidPublicLink[reason] ??
      cms.candidate_experience.invalidPublicLink.not_found;
    return (
      <div className="flex flex-col items-center gap-6 text-center py-16 text-slate-900 font-sans">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 shadow-sm">
          <AlertCircle className="h-8 w-8 stroke-[2.2]" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">{copy.heading}</h1>
          <p className="mt-2 max-w-sm text-sm text-slate-600 font-normal leading-relaxed">{copy.body}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 text-slate-900 font-sans">
      {/* Welcome card */}
      <div className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm ring-1 ring-slate-900/5">
        <div className="border-b border-slate-200 bg-slate-50/60 px-6 py-5">
          <p className="font-mono text-xs font-semibold uppercase tracking-wider text-indigo-600">
            {applyCopy.eyebrow}
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-slate-900">
            {resolved.link_title ?? resolved.jd_title ?? applyCopy.fallbackTitle}
          </h1>
        </div>
        <div className="p-6 flex flex-col gap-5">
          <p className="text-sm font-normal text-slate-600 leading-relaxed">
            {applyCopy.body}
          </p>

          {resolved.tests.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
                {applyCopy.whatYouWillCompleteLabel}
              </p>
              <div className="flex flex-col gap-2.5">
                {resolved.tests.map((t) => (
                  <div
                    key={t.title}
                    className="flex items-center gap-3 rounded-xl border border-slate-300 bg-slate-50/80 px-4 py-3 transition-colors hover:bg-slate-50"
                  >
                    <ClipboardList className="h-4 w-4 shrink-0 text-indigo-600" />
                    <span className="text-sm font-semibold text-slate-900 flex-1">{t.title}</span>
                    <span className="flex items-center gap-1 font-mono text-xs font-medium text-slate-500">
                      <Clock className="h-3 w-3" />
                      {t.duration_minutes} min
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Registration form (client component) */}
      <RegisterForm slug={slug} />
    </div>
  );
}
