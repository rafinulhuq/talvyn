/**
 * SectionedExamInvitationLanding — the candidate invitation page for the
 * sectioned (question-bank) exam flow, rendered at the tokenless
 * /exam/session route.
 *
 * Server component. Same httpOnly-cookie token mechanics as
 * TestInvitationLanding — bank-mode and legacy invitations share the exact
 * same FastAPI validation/expiry/status logic, only the candidate-facing
 * route differs.
 */

import { CheckCircle, ListChecks } from "lucide-react";
import { getPublicCmsContent } from "@/lib/cms/publicContent";
import { template } from "@/lib/cms/content";
import { validateInvitationToken, computeExpiry } from "@/lib/api/invitationToken";
import { SECTION_LABELS, SECTION_ORDER } from "@/types/exam";
import { StartExamButton } from "@/components/candidate/StartExamButton";
import { InvalidInvitationNotice, ExpiryNotice } from "@/components/candidate/InvitationLandingParts";

export async function SectionedExamInvitationLanding({ token }: { token: string | null }) {
  const [validation, cms] = await Promise.all([
    validateInvitationToken(token),
    getPublicCmsContent(),
  ]);
  const candidateCopy = cms.candidate_experience;

  if (!validation.valid) {
    const reason = validation.reason ?? "not_found";
    const copy =
      candidateCopy.invalidInvitation[reason] ?? candidateCopy.invalidInvitation.not_found;
    return <InvalidInvitationNotice reason={reason} copy={copy} />;
  }

  const { expiresAt, hoursLeft } = computeExpiry(validation.expires_at);
  const invitation = candidateCopy.invitationLanding;
  const sectioned = candidateCopy.sectionedExamLanding;

  return (
    <div className="flex flex-col gap-6 font-sans">
      {/* Welcome card */}
      <div className="rounded-2xl border border-slate-300 bg-white shadow-sm ring-1 ring-slate-900/5 overflow-hidden dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-200 bg-slate-50/70 px-6 py-5 dark:border-slate-800 dark:bg-slate-800/40">
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
            {invitation.eyebrow}
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            {validation.jd_title ?? "Your Assessment"}
          </h1>
        </div>
        <div className="p-6 flex flex-col gap-5">
          <p className="text-sm font-normal text-slate-600 leading-relaxed dark:text-slate-300">
            {template(invitation.greeting, {
              candidateName: validation.candidate_name ?? "there",
            })}
          </p>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3 dark:text-slate-400">
              {sectioned.sectionOverviewLabel}
            </p>
            <div className="flex flex-col gap-2.5">
              {SECTION_ORDER.map((section, i) => (
                <div key={section} className="flex items-center gap-3 rounded-lg border border-slate-300 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-800/40">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-indigo-50 text-[11px] font-semibold text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400">
                    {i + 1}
                  </span>
                  <ListChecks className="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400" />
                  <span className="text-sm font-medium text-slate-900 dark:text-white">{SECTION_LABELS[section]}</span>
                  <span className="ml-auto text-xs text-slate-500 font-medium dark:text-slate-400">
                    {sectioned.sectionMeta}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {expiresAt && <ExpiryNotice expiresAt={expiresAt} hoursLeft={hoursLeft} invitation={invitation} />}
        </div>
      </div>

      {/* Instructions */}
      <div className="rounded-xl border border-slate-300 bg-white p-6 shadow-sm ring-1 ring-slate-900/5 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-sm font-semibold tracking-wide text-slate-900 mb-3 dark:text-white">
          {invitation.beforeYouBeginTitle}
        </p>
        <ul className="flex flex-col gap-2.5">
          {sectioned.instructions.map((item) => (
            <li key={item} className="flex items-start gap-2.5 text-sm text-slate-600 dark:text-slate-300">
              <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      <StartExamButton />
    </div>
  );
}
