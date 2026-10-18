/**
 * Shared render pieces between SectionedExamInvitationLanding and
 * TestInvitationLanding — both invitation-landing flows show the same
 * invalid-token notice and the same expiry countdown, driven by the same
 * CMS copy shape.
 */

import { CheckCircle, Clock, AlertCircle, TimerOff, ShieldX } from "lucide-react";
import { template } from "@/lib/cms/content";
import type { CandidateExperienceContent } from "@/lib/cms/content";

export function InvalidInvitationNotice({
  reason,
  copy,
}: {
  reason: string;
  copy: { heading: string; body: string };
}) {
  const Icon =
    reason === "expired"
      ? TimerOff
      : reason === "already_used"
        ? CheckCircle
        : reason === "revoked" || reason === "terminated"
          ? ShieldX
          : AlertCircle;

  return (
    <div className="flex flex-col items-center gap-6 text-center py-12">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-300 bg-slate-50 text-slate-600 shadow-sm ring-1 ring-slate-900/5 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300">
        <Icon className="h-8 w-8 text-indigo-600 dark:text-indigo-400" />
      </div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{copy.heading}</h1>
        <p className="mt-2 max-w-sm text-sm text-slate-600 leading-relaxed font-normal dark:text-slate-400">{copy.body}</p>
      </div>
    </div>
  );
}

export function ExpiryNotice({
  expiresAt,
  hoursLeft,
  invitation,
}: {
  expiresAt: string;
  hoursLeft: number | null;
  invitation: Pick<
    CandidateExperienceContent["invitationLanding"],
    "expiresInLabel" | "linkExpiryLabel" | "validUntilLabel"
  >;
}) {
  const urgency = hoursLeft !== null && hoursLeft < 12;

  return (
    <div
      className={`flex items-start gap-3 rounded-lg border px-4 py-3 shadow-xs ${
        urgency
          ? "border-amber-200 bg-amber-50/70 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300"
          : "border-slate-300 bg-slate-50/80 text-slate-700 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-300"
      }`}
    >
      <Clock className={`mt-0.5 h-4 w-4 shrink-0 ${urgency ? "text-amber-600 dark:text-amber-400" : "text-slate-500 dark:text-slate-400"}`} />
      <div>
        <p className="text-xs font-semibold tracking-wide">
          {urgency
            ? template(invitation.expiresInLabel, { hours: hoursLeft })
            : invitation.linkExpiryLabel}
        </p>
        <p className="text-xs text-slate-500 mt-0.5 dark:text-slate-400">
          {template(invitation.validUntilLabel, { expiresAt })}
        </p>
      </div>
    </div>
  );
}
