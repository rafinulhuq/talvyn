# Exam Integrity Enforcement

Date: 2026-06-20

This update turns Talvyn's previously passive suspicious-event logging into
hard, server-enforced exam integrity: leaving the exam window terminates the
attempt, copy/paste/drag-drop/print/save are blocked, and admins can see when
and why an attempt was terminated.

## What Shipped

| Area | Change |
| --- | --- |
| Hard tab-switch termination | The first tab switch, window blur, or visibility loss during an active attempt immediately and permanently ends that attempt **and** its parent invitation — every other test in the same invitation is blocked too, not just the current one. |
| Server-side enforcement | `AttemptStatus.TERMINATED` / `InvitationStatus.TERMINATED` are real, durable states (not just a frontend flag), checked at `start_attempt`, `submit_attempt`, and `validate_token`. A terminated token cannot resume, submit, or reopen any test in the invitation. |
| Copy/paste/keyboard blocking | Copy, cut, paste, drag/drop, and the right-click context menu are blocked everywhere in the exam UI (including code answers, removing a prior allowance there). Ctrl/Cmd+C/V/X/S/P are blocked; Ctrl/Cmd+A is blocked outside an answer field but still works inside one for normal editing. Each block shows a brief toast and is logged. |
| Pre-exam rules acknowledgment | Candidates must check "I understand and agree" to an integrity-rules notice before the Start button is enabled, on the page before the timer starts (not after). |
| Termination screen | A dedicated "Assessment ended" screen replaces the exam UI immediately on violation, and is also shown on reload or reopening the link afterward. |
| Admin visibility | A `TERMINATED` status badge (red) appears everywhere existing invitation/attempt status badges render. The evaluation report page shows a distinct "Terminated — not evaluated" banner instead of a generic 404/"Run Evaluation" prompt, since a terminated attempt was never submitted and will never have an evaluation. |

## Design Notes

- **This is a deterrent, not unbypassable protection.** A candidate with
  OS-level tools (a second physical device, screen recording, virtual
  machines, etc.) can still circumvent browser-level enforcement. Admin-facing
  copy and this document describe it as an integrity deterrent on purpose —
  never claim it as foolproof.
- `InvitationStatus.TERMINATED` is a distinct value from `REVOKED` —
  `REVOKED` is an explicit admin action, `TERMINATED` is system-driven from a
  candidate-side violation — so admins can tell the two apart at a glance.
- One new Alembic migration adds both enum values (`ALTER TYPE ... ADD VALUE`,
  safe inside a transaction on PG12+ since the new value is never used in the
  same transaction it's added in) plus `integrity_violation_reason` /
  `terminated_at` columns on both `test_attempts` and `invitations` (the
  invitation columns are denormalized from the terminating attempt so admin
  list views don't need to join).
- The candidate-side proxy (`/api/candidate/[...path]/route.ts`) has an
  explicit endpoint allowlist — the new `/terminate` route had to be added to
  it, or every termination call would have silently 404'd.
- `terminate_attempt()` is idempotent: a retried request (the frontend retries
  once on network failure) returns the existing terminal state instead of
  erroring or double-writing a `SuspiciousEvent` row.
- New `webhook_service` event `attempt.terminated` was added alongside the
  three existing lifecycle events, for consistency with the outbound-webhooks
  feature shipped earlier.

## Explicitly Deferred

- **Fullscreen-exit detection** — no fullscreen mode exists anywhere in the
  app yet, so there is nothing to detect exiting from.
- **AI-likeness / AI-use detection** for open-ended answers, and the larger
  multi-user auth/workspace/RBAC and UI/UX-audit items from the same request —
  each is sized as its own follow-up pass.

## Next Steps

AI-likeness estimate for open-ended answers (explicitly probabilistic — never
a definitive verdict), then multi-user auth/workspaces/RBAC as a separate,
carefully-scoped migration project, then the remaining `docs/ui-ux-audit.md`
items (Settings tabs, system health card, JD stepper, Results filters).
