import { ClipboardList } from "lucide-react";
import type { Metadata } from "next";
import { InvalidLink, LandingLayout } from "@/components/candidate/landing";
import { RegisterForm } from "@/components/candidate/register-form";
import { candidateCopy, resolvePublicLink } from "@/server/candidate";

export const metadata: Metadata = { title: "Apply" };

/** Public link: anyone with the URL can register; registering mints their own private invitation. */
export default async function ApplyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [link, copy] = await Promise.all([resolvePublicLink(slug), candidateCopy()]);
  if (!link.valid) {
    const reason = link.reason ?? "not_found";
    return <InvalidLink reason={reason} copy={copy.invalidPublicLink[reason] ?? copy.invalidPublicLink.not_found!} />;
  }
  const c = copy.applyLanding;
  return (
    <LandingLayout
      eyebrow={c.eyebrow}
      title={link.link_title ?? link.jd_title ?? c.fallbackTitle}
      intro={<p>{c.body}</p>}
      details={
        link.tests.length > 0 && (
          <div>
            <h2 className="text-base font-medium text-ink">{c.whatYouWillCompleteLabel}</h2>
            <ol className="mt-3 overflow-hidden rounded-panel border border-line bg-surface">
              {link.tests.map((t, i) => (
                <li key={`${t.title}-${i}`} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0">
                  <ClipboardList aria-hidden className="size-4 shrink-0 text-ink-muted" />
                  <span className="flex-1 text-md text-ink">{t.title}</span>
                  <span className="text-sm text-ink-muted">{t.duration_minutes} min</span>
                </li>
              ))}
            </ol>
          </div>
        )
      }
      rulesTitle="Your details"
      rules={["Use the email address you want the hiring team to contact you on.", "You can take this assessment once."]}
      action={<RegisterForm slug={slug} />}
    />
  );
}
