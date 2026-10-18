# Graphite + Electric Indigo Rebrand — Phase D (Candidate UI Audit)

Date: 2026-06-21

Phase D of the admin/candidate rebrand (see Phases
[A](graphite-indigo-rebrand-phase-a.md), [B](graphite-indigo-rebrand-phase-b.md),
[C](graphite-indigo-rebrand-phase-c.md)). Scope: Step 7 of the original
rebrand request — candidate-facing UI (magic link landing, rules
acknowledgement, exam page, timer, question navigation, autosave indicator,
submission confirmation, blocked/expired/terminated states).

## Finding: No rebrand work was actually needed here

Every candidate-facing surface was audited file-by-file:
`test/layout.tsx`, `test/[token]/page.tsx` (magic-link landing + rules
acknowledgement, combined into one page — there's no separate "rules" route),
`test/[token]/StartTestButton.tsx`, `test/[token]/exam/page.tsx`,
`test/complete/page.tsx`, `test/expired/page.tsx`, `test/error.tsx`,
`apply/[slug]/page.tsx` + `RegisterForm.tsx` (public self-registration), and
every component under `components/candidate/` (`TestTimer`, `ProgressBar`,
`MCQQuestion`, `CodeQuestion`, `OpenEndedQuestion`, `SubmitConfirm`,
`TestComplete`, `TestTerminated`).

All of it was already calm, light (no dark sidebar — candidate pages
intentionally never had one), and built entirely on the same design tokens
(`brand`, `success`, `warning`, `danger`) as the admin app — meaning it
already inherited the Electric Indigo identity for free from the Phase A
token change, with zero hardcoded colors found (unlike the AI Checker gauge
bug Phase B caught). This is a side effect of an earlier session's dedicated
pass on candidate-facing error copy and exam-flow UX (see the `S5`/`S6`
history) — that work already left this surface in better shape than most of
the admin app started in.

The one deliberate exception — `CodeQuestion`'s dark code-editor panel
(`bg-slate-950`) — was left as-is: a dark background for a code-input
block is a near-universal editor convention candidates will recognize, not
"admin chrome" leaking into candidate UI, and lightening it would reduce
familiarity for no benefit.

## What Changed

| File | Change |
| --- | --- |
| `app/test/[token]/loading.tsx` (new) | The magic-link landing page is an async server component that validates the token via a backend fetch before rendering anything; with no loading state, a slow connection showed a blank page. Added a calm centered spinner matching the one already used by the exam page's own loading state. |
| `app/apply/[slug]/loading.tsx` (new) | Same gap, same fix, for the public self-registration page (resolves the link slug via a backend fetch first). |
| `app/tests/[token]/loading.tsx` (new) | One-line re-export, mirroring how `tests/[token]/page.tsx` already re-exports `test/[token]/page.tsx` for the plural-route alias. |

No changes to candidate-facing copy, logic, or any exam-flow behavior —
that code was already correct and is sensitive (see the earlier `S5`/`S6`
session that fixed reload-after-submit and stale-token error handling
there). This pass was visual-consistency-only, and found nothing to fix
beyond the missing loading states.

## Verification

- `npm run type-check`, `npm run lint` (0 errors), `npm run build` all pass.
- Not visually verified in a browser — same constraint as Phases A–C.

## Still Deferred

AI-specific UI states (Phase E) and the final accessibility/loading-state
sweep (Phase F) remain.
