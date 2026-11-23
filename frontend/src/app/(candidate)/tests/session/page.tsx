import { ClipboardList } from "lucide-react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { ExpiryLine } from "@/components/candidate/expiry-line";
import { InvalidLink, LandingLayout } from "@/components/candidate/landing";
import { StartButton } from "@/components/candidate/start-button";
import { ATTEMPT_TOKEN_COOKIE } from "@/lib/candidate-session";
import { fill } from "@/lib/cms/candidate-copy";
import { candidateCopy, validateInvitation } from "@/server/candidate";

export const metadata: Metadata = { title: "Your assessment" };

/** Landing for a single-test invitation. The token is in an httpOnly cookie, never in the URL. */
export default async function TestLandingPage() {
  const token = (await cookies()).get(ATTEMPT_TOKEN_COOKIE)?.value ?? null;
  const [v, copy] = await Promise.all([validateInvitation(token), candidateCopy()]);
  if (!v.valid) {
    const reason = v.reason ?? "not_found";
    return <InvalidLink reason={reason} copy={copy.invalidInvitation[reason] ?? copy.invalidInvitation.not_found!} />;
  }
  const c = copy.invitationLanding;
  const next = v.next_test_index ?? 0;
  const total = v.total_tests || v.test_titles.length;

  return (
    <LandingLayout
      eyebrow={c.eyebrow}
      title={v.jd_title ?? "Your assessment"}
      intro={<p>{fill(c.greeting, { candidateName: v.candidate_name ?? "there" })}</p>}
      details={
        <div className="flex flex-col gap-4">
          {v.test_titles.length > 0 && (
            <div>
              <h2 className="text-base font-medium text-ink">{c.whatYouWillCompleteLabel}</h2>
              <ol className="mt-3 overflow-hidden rounded-panel border border-line bg-surface">
                {v.test_titles.map((t, i) => (
                  <li key={`${t}-${i}`} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0">
                    <ClipboardList aria-hidden className="size-4 shrink-0 text-ink-muted" />
                    <span className="flex-1 text-md text-ink">{t}</span>
                    {total > 1 && <span className="text-sm text-ink-muted">{i < next ? "Done" : i === next ? "Next" : `Test ${i + 1}`}</span>}
                  </li>
                ))}
              </ol>
            </div>
          )}
          {total > 1 && <p className="text-base text-ink">{fill(c.nextUpLabel, { current: next + 1, total })}</p>}
          {v.expires_at && <ExpiryLine iso={v.expires_at} copy={c} />}
        </div>
      }
      rulesTitle={c.beforeYouBeginTitle}
      rules={c.instructions}
      action={<StartButton kind="test" testIndex={next} totalTests={total} />}
    />
  );
}
