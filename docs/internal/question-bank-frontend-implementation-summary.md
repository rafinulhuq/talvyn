# Question Bank / Sectioned Exam — Frontend Implementation Summary

Closes the gap flagged after Master Prompts 2 and 3: the sectioned-exam
backend existed but had no UI and wasn't reachable from any candidate
browser. This pass wires it up end-to-end — candidate exam flow, admin
bank management, and admin report view — reusing the legacy flow's hooks,
components, and conventions wherever the underlying mechanics are
identical (they mostly are, since each section is backed by a real
`TestAttempt` with the same id/token machinery as the legacy single-test flow).

## A correctness gap found and fixed along the way

Before any frontend work, I checked how a candidate would actually reach
the new flow and found a real bug-in-waiting: `invitation_service.py`'s
existing invite/resend logic builds magic links by querying `Test` rows
with `status=APPROVED` — but `question_bank_service.review_bank()` (Master
Prompt 2/3) also sets `status=APPROVED` on bank-section `Test` rows. That
meant inviting a candidate to a bank-mode job would silently generate a
**legacy-format** `/tests/<token>` link, which `attempt_service.start_attempt()`
would happily serve — handing the candidate the **entire bank** (e.g. 40
MCQ + 20 CQ) with no question locking and no audit trail at all, bypassing
the whole redesign.

Fixed with two small, tested backend changes:
- `core/security.py`'s `build_magic_link()` now takes a `path_prefix`
  ("tests" or "exam"); `invitation_service.py` picks "exam" whenever any
  approved test for the JD has `question_bank_id` set.
- `attempt_service.start_attempt()` now refuses (400) if the JD's approved
  tests are bank-mode, telling the candidate to use their actual invitation
  link rather than silently mis-serving them.

Both covered by new tests in `test_question_bank.py` (335/335 backend tests
still pass).

## What's new

### Candidate flow — `/exam/[token]`
- `app/exam/layout.tsx`, `app/exam/error.tsx` — same minimal shell as the legacy `/test` flow.
- `app/exam/[token]/page.tsx` + `StartExamButton.tsx` — landing page (3-section overview, integrity rules, start button).
- `app/exam/[token]/section/page.tsx` — the active exam page. Reuses `useTestTimer`, `useAutoSave`, `useSuspiciousEvents`, `MCQQuestion`, `OpenEndedQuestion`, `CodeQuestion`, `SubmitConfirm`, `TestTerminated` **unchanged** — each section is a real `TestAttempt`, so all the existing timer/autosave/integrity machinery just works. Only section *transitions* are new.
- `components/candidate/SectionProgress.tsx` — 3-step Reasoning/Practical/Technical indicator.
- `components/candidate/SectionedExamComplete.tsx` — post-submission screen that **polls** exam status (CQ evaluation is now async/batched, not synchronous) showing exactly the three states Master Prompt 3 asked for: "Submission received" → "Evaluation in progress" → "Completed". Never shows scores, AI-risk, or model output to the candidate.

### Admin flow
- `app/(admin)/dashboard/jds/[id]/question-bank/page.tsx` + `components/admin/QuestionBankPanel.tsx` — generate/regenerate/review-and-approve, per-section MCQ/CQ counts, below-recommended warning. Linked from the JD detail page (new 3rd action card).
- `app/(admin)/dashboard/jds/[id]/question-bank/candidates/page.tsx` — every candidate's exam attempt for a job, status + score + AI-risk at a glance.
- `app/(admin)/dashboard/exam-results/[examAttemptId]/page.tsx` + `components/admin/ExamReportView.tsx` — section score breakdown (MCQ/CQ split, weights) and the AI-risk card. The AI-risk ring deliberately reuses the *exact* indigo/amber/red color language (not green/red) already established in the legacy AI-likeness ring (`dashboard/results/[attemptId]/page.tsx`) — same reasoning: must never visually read as a verdict. Includes a "Request deep-review explanation" button (calls the optional GLM explanation, admin-gated) and a retry-evaluation button for `FAILED` exams.

### Plumbing
- `app/api/candidate/[...path]/route.ts` — allowlist extended for `/api/v1/candidate-exams/*` (the admin proxy is already a catch-all, so no change was needed there).
- `types/exam.ts`, `lib/api/candidateExams.ts`, `lib/api/questionBank.ts`, `lib/api/examReports.ts` — typed mirrors of `schemas/exam.py` and the 3 new router files, following this codebase's existing per-module API-client convention.

## Verified

- `npx tsc --noEmit` — clean.
- `npx eslint` on every new/changed file — 2 warnings, both pre-existing patterns already present in the legacy code I mirrored (an `any` in a catch block, a `useCallback` exhaustive-deps note), not new issues.
- `npm run build` — succeeds, all 5 new routes compile and register (`/exam/[token]`, `/exam/[token]/section`, `/dashboard/jds/[id]/question-bank`, `/dashboard/jds/[id]/question-bank/candidates`, `/dashboard/exam-results/[examAttemptId]`).
- Backend: 335/335 tests pass after the magic-link/guard changes.

## Known limitations

- **Not manually clicked through in a browser** — verified via type-check + build + route registration, not a live `npm run dev` session. Recommend a manual smoke test (generate a bank, review it, invite a candidate, walk all 3 sections, check the admin report) before relying on this in production.
- **No generation-progress UI** for question-bank generation, unlike legacy test generation's ARQ+Redis progress bar — the backend doesn't expose a progress endpoint for this flow yet, so the admin panel is a plain spinner with a "this can take several minutes" notice. Adding real progress would need a backend change first (mirroring `test_generation_service`'s `_set_progress`/`/tests/progress/{jd_id}` pattern).
- **No frontend tests added** — this codebase doesn't appear to have an existing frontend test suite to extend (no test runner config found for components/pages); flagging rather than introducing a new testing setup unprompted.
- **`apply/[slug]` public self-registration** still points candidates at the legacy flow only — not updated to branch into the sectioned exam, since that page wasn't in scope of this pass.
