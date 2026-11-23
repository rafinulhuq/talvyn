/**
 * Candidate-facing copy. Super Admins can override any of it under
 * Website content (CMP document "candidate_experience"); these are the
 * defaults used for anything not overridden. Keys match the stored document,
 * so existing overrides keep working.
 */
export type CopyPair = { heading: string; body: string };

export type CandidateCopy = {
  invitationLanding: {
    eyebrow: string;
    greeting: string;
    nextUpLabel: string;
    whatYouWillCompleteLabel: string;
    linkExpiryLabel: string;
    expiresInLabel: string;
    validUntilLabel: string;
    beforeYouBeginTitle: string;
    instructions: string[];
  };
  sectionedExamLanding: { sectionOverviewLabel: string; sectionMeta: string; instructions: string[] };
  applyLanding: { eyebrow: string; fallbackTitle: string; body: string; whatYouWillCompleteLabel: string };
  invalidInvitation: Record<string, CopyPair>;
  invalidPublicLink: Record<string, CopyPair>;
  completion: { heading: string; body: string; nextTitle: string; nextItems: string[] };
  expiredPage: { heading: string; body: string; nextTitle: string; nextBody: string };
};

export const DEFAULT_CANDIDATE_COPY: CandidateCopy = {
  invitationLanding: {
    eyebrow: "Assessment invitation",
    greeting: "Hi {candidateName}, you've been invited to complete an online assessment.",
    nextUpLabel: "Next up: test {current} of {total}",
    whatYouWillCompleteLabel: "What you'll complete",
    linkExpiryLabel: "Link expiry",
    expiresInLabel: "Expires in {hours} hours",
    validUntilLabel: "Valid until {expiresAt}",
    beforeYouBeginTitle: "Before you begin",
    instructions: [
      "Find a quiet place with a stable internet connection.",
      "Each test is timed. The timer starts when you press Start and can't be paused.",
      "Your answers save automatically as you work.",
      "Stay on this page. Switching tabs or windows ends the assessment.",
      "This link is personal. Don't share it.",
    ],
  },
  sectionedExamLanding: {
    sectionOverviewLabel: "Three sections, taken in order",
    sectionMeta: "Timed",
    instructions: [
      "Find a quiet place with a stable internet connection.",
      "Each section is timed, and you take them one after another.",
      "Your answers save automatically as you work.",
      "Once you submit a section, you can't go back to it.",
      "Stay on this page. Switching tabs or windows ends the assessment.",
      "This link is personal. Don't share it.",
    ],
  },
  applyLanding: {
    eyebrow: "Assessment registration",
    fallbackTitle: "Apply for this role",
    body: "Enter your details to start the assessment. Your progress is private to you.",
    whatYouWillCompleteLabel: "What you'll complete",
  },
  invalidInvitation: {
    expired: { heading: "This link has expired", body: "Ask the person who invited you to send a new link." },
    already_used: { heading: "You've already finished this assessment", body: "Each link works for one complete sitting. There's nothing more to do." },
    revoked: { heading: "This invitation was withdrawn", body: "This link no longer works. Contact the person who invited you if you think that's a mistake." },
    terminated: {
      heading: "This assessment has ended",
      body: "It ended because the assessment window was left. For fairness, the remaining tests in this invitation are closed.",
    },
    not_found: { heading: "This link doesn't work", body: "Check that you opened the full link from your invitation email." },
  },
  invalidPublicLink: {
    not_found: { heading: "This link doesn't exist", body: "Check the address, or ask the recruiter for the right link." },
    disabled: { heading: "This assessment isn't open right now", body: "The recruiter has paused it. Ask them when it reopens." },
    expired: { heading: "This assessment has closed", body: "Its closing date has passed. Ask the recruiter about other openings." },
    no_tests: { heading: "No assessment is set up yet", body: "This role doesn't have an assessment ready. Check back later." },
    max_reached: { heading: "Registration is full", body: "This assessment has reached its limit of candidates." },
  },
  completion: {
    heading: "Assessment submitted",
    body: "Your answers have been received. The hiring team will be in touch if you move to the next stage.",
    nextTitle: "What happens next",
    nextItems: ["The hiring team reviews your answers.", "You may be invited to a follow-up interview.", "This link can't be used again."],
  },
  expiredPage: {
    heading: "This link has expired",
    body: "Invitation links work for a limited time, and this one is no longer active.",
    nextTitle: "What to do",
    nextBody: "Ask the person who invited you to send a new invitation.",
  },
};

/** Replaces {name} placeholders. */
export const fill = (text: string, vars: Record<string, string | number | null | undefined>) =>
  Object.entries(vars).reduce((acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v ?? "")), text);

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Override wins per key; arrays are replaced whole; wrong types fall back to the default. */
export function mergeCopy<T>(base: T, override: unknown): T {
  if (Array.isArray(base)) {
    if (!Array.isArray(override)) return base;
    // Accept the override when its items have the same shape as the default's
    // (strings, or objects); an empty default accepts strings or objects.
    const kind = (x: unknown) => (typeof x === "string" ? "string" : isRecord(x) ? "object" : "other");
    const want = base.length ? kind(base[0]) : null;
    const ok = override.every((x) => (want ? kind(x) === want : kind(x) !== "other"));
    return (ok ? override : base) as T;
  }
  if (!isRecord(base)) return (typeof override === typeof base && override !== "" ? override : base) as T;
  if (!isRecord(override)) return base;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(override)) out[k] = k in out ? mergeCopy(out[k], v) : isRecord(v) ? v : out[k];
  return out as T;
}
