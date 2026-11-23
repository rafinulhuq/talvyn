import type { Metadata } from "next";
import { cookies } from "next/headers";
import { ExpiryLine } from "@/components/candidate/expiry-line";
import { InvalidLink, LandingLayout } from "@/components/candidate/landing";
import { StartButton } from "@/components/candidate/start-button";
import { ATTEMPT_TOKEN_COOKIE } from "@/lib/candidate-session";
import { fill } from "@/lib/cms/candidate-copy";
import { candidateCopy, validateInvitation } from "@/server/candidate";
import { SECTION_LABEL, SECTION_ORDER } from "@/types/attempt";

export const metadata: Metadata = { title: "Your assessment" };

/** Landing for a sectioned (question bank) exam invitation. */
export default async function ExamLandingPage() {
  const token = (await cookies()).get(ATTEMPT_TOKEN_COOKIE)?.value ?? null;
  const [v, copy] = await Promise.all([validateInvitation(token), candidateCopy()]);
  if (!v.valid) {
    const reason = v.reason ?? "not_found";
    return <InvalidLink reason={reason} copy={copy.invalidInvitation[reason] ?? copy.invalidInvitation.not_found!} />;
  }
  const c = copy.invitationLanding;
  const s = copy.sectionedExamLanding;

  return (
    <LandingLayout
      eyebrow={c.eyebrow}
      title={v.jd_title ?? "Your assessment"}
      intro={<p>{fill(c.greeting, { candidateName: v.candidate_name ?? "there" })}</p>}
      details={
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="text-base font-medium text-ink">{s.sectionOverviewLabel}</h2>
            {/* A real sequence, so the numbers carry meaning. */}
            <ol className="mt-3 overflow-hidden rounded-panel border border-line bg-surface">
              {SECTION_ORDER.map((sec, i) => (
                <li key={sec} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full border border-line-strong text-sm text-ink-muted">{i + 1}</span>
                  <span className="flex-1 text-md text-ink">{SECTION_LABEL[sec]}</span>
                  <span className="text-sm text-ink-muted">{s.sectionMeta}</span>
                </li>
              ))}
            </ol>
          </div>
          {v.expires_at && <ExpiryLine iso={v.expires_at} copy={c} />}
        </div>
      }
      rulesTitle={c.beforeYouBeginTitle}
      rules={s.instructions}
      action={<StartButton kind="exam" />}
    />
  );
}
