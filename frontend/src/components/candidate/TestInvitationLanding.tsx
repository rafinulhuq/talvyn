/**
 * TestInvitationLanding — the candidate invitation page for the legacy
 * single-test flow, rendered at the tokenless /tests/session route.
 *
 * Server component. The magic-link token comes from the httpOnly session
 * cookie (redeemed by middleware from the emailed URL — see
 * lib/candidateSession.ts); it is validated against FastAPI here and
 * never reaches client JS.
 */

import { CheckCircle, ClipboardList } from "lucide-react";
import { getPublicCmsContent } from "@/lib/cms/publicContent";
import { template } from "@/lib/cms/content";
import { validateInvitationToken, computeExpiry } from "@/lib/api/invitationToken";
import { StartTestButton } from "@/components/candidate/StartTestButton";
import { InvalidInvitationNotice, ExpiryNotice } from "@/components/candidate/InvitationLandingParts";

export async function TestInvitationLanding({ token }: { token: string | null }) {
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
  const nextTestIndex = validation.next_test_index ?? 0;
  const totalTests = validation.total_tests || validation.test_titles.length;
  const invitation = candidateCopy.invitationLanding;

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

          {totalTests > 1 && (
            <div className="rounded-lg border border-indigo-300 bg-indigo-50/60 px-4 py-2.5 dark:border-indigo-900/50 dark:bg-indigo-950/30">
              <p className="text-xs font-semibold tracking-wide text-indigo-900 dark:text-indigo-300">
                {template(invitation.nextUpLabel, {
                  current: nextTestIndex + 1,
                  total: totalTests,
                })}
              </p>
            </div>
          )}

          {validation.test_titles.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3 dark:text-slate-400">
                {invitation.whatYouWillCompleteLabel}
              </p>
              <div className="flex flex-col gap-2.5">
                {validation.test_titles.map((title) => (
                  <div key={title} className="flex items-center gap-3 rounded-lg border border-slate-300 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-800/40">
                    <ClipboardList className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
                    <span className="text-sm font-medium text-slate-900 dark:text-white">{title}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {expiresAt && <ExpiryNotice expiresAt={expiresAt} hoursLeft={hoursLeft} invitation={invitation} />}
        </div>
      </div>

      {/* Instructions */}
      <div className="rounded-xl border border-slate-300 bg-white p-6 shadow-sm ring-1 ring-slate-900/5 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-sm font-semibold tracking-wide text-slate-900 mb-3 dark:text-white">
          {invitation.beforeYouBeginTitle}
        </p>
        <ul className="flex flex-col gap-2.5">
          {invitation.instructions.map((item) => (
            <li key={item} className="flex items-start gap-2.5 text-sm text-slate-600 dark:text-slate-300">
              <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Start button (client component) */}
      <StartTestButton testIndex={nextTestIndex} totalTests={totalTests} />
    </div>
  );
}
