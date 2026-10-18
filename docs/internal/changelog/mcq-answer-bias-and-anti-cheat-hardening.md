# MCQ Answer-Position Bias, Evaluation Display Bug, and Anti-Cheat Hardening

Date: 2026-06-26/27

User-reported, in one session: (1) generated MCQ tests always put the
correct answer in option B, (2) the admin evaluation breakdown sometimes
looked like a wrong answer was scored correct, (3) a candidate terminated
for an integrity violation could just revisit the public registration link
and start over.

## Bug 1: Generated MCQs always put the correct answer at "B"

Root cause: the LLM prompt templates' example JSON
(`backend/app/prompts/gemma.py:164`, `qwen.py`) showed the correct answer
hardcoded at position B. LLMs pattern-match examples, so generated
questions skewed heavily toward B regardless of model.

There are **two separate MCQ-generation schemas** in this codebase — a
prior session's fix only touched one of them:

- `backend/app/schemas/test.py` — `MCQQuestionAI`, used by the legacy
  single-test generation path.
- `backend/app/schemas/ai_orchestration.py` — `GlmMcqQuestionAI`, used by
  the question-bank generation path (`QUESTION_BANK_MODE=true`). This one
  had no anti-bias fix at all, which is why the bug was still fully
  reproducible — the production deployment uses question-bank mode.

**Fixed in both schemas' `model_validator`:** after the model's response is
parsed and any `is_correct`/`correct_answer` mismatches are healed, the
options list is shuffled and relabeled A–D, then `correct_answer` is
re-derived from whichever option object still carries `is_correct=True`.
This makes storage position-unbiased regardless of whether the LLM ever
follows the instruction not to be — the fix doesn't depend on LLM
compliance at all.

Tests: `backend/tests/test_test_generation.py::TestMCQQuestionAI` and the
new `backend/tests/test_ai_orchestration_schemas.py::TestGlmMcqQuestionAI`
both assert the correct-answer position varies across 200 generations
(negligible false-failure probability, ~(1/4)^199).

## Bug 2: Admin evaluation breakdown showed the wrong option as "what the candidate picked"

This looked like a scoring bug but wasn't — `_score_mcqs`/
`_resolve_original_label` in `evaluation_service.py` were already correct
(verified by reading the shuffle-seed math and reproducing it in tests).

Root cause was in `_enrich_evaluation_response`
(`backend/app/api/v1/evaluation.py`): it returned `question_options` and
`correct_answer` in the question's **original stored label order**, but
`candidate_answer` (`CandidateAnswer.selected_option`) is recorded in the
candidate's **per-attempt shuffled order** (`attempt_service._safe_question`
reshuffles MCQ options per attempt for fairness, seeded by
`attempt_id + question_id`). The frontend trusted both as the same
coordinate system (`opt.label === fb.candidate_answer` in
`results/[attemptId]/page.tsx`) and highlighted the wrong option.

**Fixed:** `candidate_answer` is now translated back to the original
label via the same `_resolve_original_label` helper scoring already uses,
before being returned — so it's expressed in the same coordinate system as
`question_options`/`correct_answer`. No frontend change needed.

Verified by reverting the fix and confirming a new regression test fails
(`test_mcq_feedback_wrong_answer_points_at_wrong_option`), then re-applying
and confirming it passes — see `backend/tests/test_evaluation.py`.

## Bug 3: Terminated candidates could resubmit the registration form and start over

`public_link_service._find_active_invitation` (reused from
`invitation_service.py`) only matches `PENDING`/`OPENED` invitations —
deliberately, so a terminated candidate doesn't block a brand-new
admin-issued invite forever. But `register_via_public_link` had no
separate check for a prior `TERMINATED` invitation before falling through
to "create a brand-new invitation" — so resubmitting the same email on the
public link instantly bypassed termination, no devtools or IP tricks
needed.

**Fixed:** added an explicit `TERMINATED`-invitation check before the
fresh-registration path, returning `status="terminated"` (mirrors the
existing `status="already_completed"` pattern) with no token issued.
Frontend (`RegisterForm.tsx`) shows a blocked-access message for this
status. Test: `test_terminated_candidate_cannot_re_register_with_same_email`.

## Feature: soft-signal device tracking for the new-email evasion case

The email-based fix above doesn't stop a banned candidate who registers
with a *different* email. Validated the approach with the user before
building (constraints: Bangladesh's prevalent shared/NAT IPs make any
IP-based auto-block unacceptable; no client-side signal is unbeatable
against a determined user on a different device/browser):

- **Device fingerprint** — `RegisterForm.tsx`'s `computeDeviceFingerprint()`,
  built entirely from native browser APIs (canvas + WebGL renderer string +
  navigator/screen/timezone, hashed with `SubtleCrypto`). No new dependency.
- **Device cookie** — a long-lived (2yr), HttpOnly, signed-nothing-just-random
  cookie (`rp_device_id`) set by `public_links.py`'s register endpoint,
  survives a `localStorage`/`sessionStorage` clear since it's never exposed
  to JS.
- **Matching** — `public_link_service._check_duplicate_device` compares
  both signals against `TERMINATED` invitations on the same JD.
- **Enforcement: soft signal only, by design.** A match never blocks
  registration — it sets `Invitation.flagged_duplicate_device` +
  `flagged_duplicate_reason` for admin review (shown as a warning icon on
  `InvitationStatusBadge`). IP (`registration_ip`) is logged for admin
  context only, never compared/enforced — explicitly to avoid false
  positives on shared IPs.

New columns on `Invitation`: `device_fingerprint`, `device_cookie_id`,
`registration_ip`, `flagged_duplicate_device`, `flagged_duplicate_reason`
— migration `4b645fbb2927_add_device_tracking_to_invitations.py`.

**Found and fixed along the way:** `frontend/src/app/api/public/[...path]/route.ts`
(the unauthenticated public-link proxy) forwarded neither the browser's
`Cookie` header upstream nor FastAPI's `Set-Cookie` back down — would have
silently broken the device-cookie mechanism entirely. Fixed in both
directions.

Tests: `backend/tests/test_public_links.py` —
`test_matching_fingerprint_flags_but_still_issues_token` (flagged but never
blocked), `test_non_matching_fingerprint_is_not_flagged`,
`test_registration_sets_device_cookie`.

## What this doesn't fix

A determined candidate using a different device, a different browser, or
incognito + VPN defeats the fingerprint/cookie layer entirely — this was
explicitly discussed and accepted as the design's known ceiling, not an
oversight. The hard gate remains the email/invitation-history check; the
device layer only raises the bar for casual retries.

`InvitationStatusBadge`'s new flag props are only wired up in the two list
views that already pass a full `Invitation` object
(`results/jd/[jdId]/page.tsx`, `jds/[id]/candidates/page.tsx`) — the
candidate-detail page's attempt-summary view (`candidates/[id]/page.tsx`)
uses a narrower `attempt.invitation_status` string field that doesn't carry
the flag; wiring that up would need a data-shape change out of scope here.
