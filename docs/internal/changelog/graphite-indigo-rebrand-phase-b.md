# Graphite + Electric Indigo Rebrand — Phase B (Badge Consistency)

Date: 2026-06-21

Phase B of the admin rebrand (see
[graphite-indigo-rebrand-phase-a.md](graphite-indigo-rebrand-phase-a.md) for
Phase A). Scope: Step 5 of the original rebrand request — badge consistency
— plus a hardcoded-color audit to confirm the Phase A token rebrand actually
reached every screen rather than just the pages it directly touched.

## What Was Found

A full inventory of every status-badge-like UI element in the admin app (24
locations) turned up:

- **One real leftover-color bug**: the AI Checker's circular percentage
  gauge (`frontend/src/components/admin/AiCheckerClient.tsx`) had the old
  sky-blue brand color hardcoded as a literal `rgb(14 165 233)` in an inline
  `style` attribute — a CSS custom property, not a Tailwind class, so the
  Phase A token change never reached it. It was still rendering in the old
  blue after the rebrand.
- Several "status pill" badges implemented as one-off inline `<span>`s
  instead of the shared `Badge` component (`frontend/src/components/ui/Badge.tsx`),
  with inconsistent color choices (e.g. Tailwind's literal `emerald-*`/`red-*`
  vs the app's `success`/`danger` tokens for what is semantically the same
  pass/fail state).
- Several richer displays — the evaluation recommendation banner, the
  evaluation-level card, the AI-detection confidence/recommendation chips on
  the attempt detail page, the JD report's skill/level distributions, and
  the Settings system-health rows — already use icon-or-emoji + text + the
  existing color tokens correctly. These were left untouched: they're
  intentionally more prominent than a plain pill badge, and converting them
  to flat badges would have been a visual downgrade, not a consistency fix.

## What Changed

| File | Change |
| --- | --- |
| `frontend/src/components/ui/Badge.tsx` | Added an optional `icon` prop (renders before the label, replacing `dot` when both are given) so badges can pair an icon with text consistently instead of color alone. |
| `frontend/src/components/admin/AiCheckerClient.tsx` | Fixed the hardcoded sky-blue gauge color to the secondary accent purple (`#C084FC`) — the design system reserves purple specifically for AI-specific UI, which this gauge is. Also converted the confidence chip to the shared `Badge`. |
| `frontend/src/components/admin/TestCard.tsx` | Test status footer (Draft/Approved/Archived) converted from a plain colored text string to a `Badge` with an icon, removing a redundant duplicate checkmark that was rendered separately next to the type badge. |
| `frontend/src/app/(admin)/dashboard/results/page.tsx` | Results Inbox table's recommendation cell converted from plain colored text to a `Badge`. |
| `frontend/src/app/(admin)/dashboard/results/leaderboard/[jdId]/page.tsx` | `PassBadge` converted to the shared `Badge` (was a hand-rolled pill using Tailwind's `emerald`/`red` instead of the app's `success`/`danger` tokens). |
| `frontend/src/app/(admin)/dashboard/leaderboard/page.tsx` | Same `PassBadge` fix, plus the test-type chip (Technical/Behavioral/Problem Solving) converted to `Badge` with an icon instead of a hand-rolled bordered span. |

No backend changes. No new dependencies.

## Verification

- `npm run type-check`, `npm run lint` (0 errors; pre-existing warning count
  unchanged — confirmed the two warnings touching edited files,
  `Minus`/`getScoreBgColor` unused, predate this change), and `npm run build`
  all pass.
- Not visually verified in a browser this session — same constraint as
  Phase A (no browser tool available; local docker frontend container was
  already crash-looping on an unrelated issue). Recommend a manual check,
  particularly the AI Checker gauge color and the leaderboard badges.

## Still Deferred

Badge consistency for the candidate-facing UI, and the remaining rebrand
steps (applying the visual language to pages not yet touched, candidate UI,
AI-specific UI states) are still queued as separate follow-up batches — not
done in this pass.
