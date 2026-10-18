# Graphite + Electric Indigo Rebrand — Phase C (Remaining Pages)

Date: 2026-06-21

Phase C of the admin rebrand (see Phase A
[graphite-indigo-rebrand-phase-a.md](graphite-indigo-rebrand-phase-a.md) and
Phase B [graphite-indigo-rebrand-phase-b.md](graphite-indigo-rebrand-phase-b.md)).
Scope: Step 6 of the original rebrand request — apply the shared
design-system primitives (`PageHeader`, `Breadcrumbs`, `EmptyState`) to the
admin pages the earlier Phase 1/2 design-system pass didn't reach.

## What Was Found

Most pages already inherited the indigo rebrand for free in Phase A, since
the `brand` color token is used app-wide. What Phase C actually needed to
fix was structural/navigational consistency: 12 of the ~20 admin pages still
had a hand-rolled `<Link><ChevronLeft />...</Link>` back button and a plain
`<h1>` instead of the shared `Breadcrumbs`/`PageHeader` components — and
several still had a hand-rolled empty-state block instead of `EmptyState`.

`(admin)/dashboard/settings/page.tsx` was flagged in the initial scan as
missing `PageHeader`, but that's a false positive — `SettingsClient.tsx`
(the actual content) already uses it; no change needed there.

## What Changed

| File | Change |
| --- | --- |
| `jds/upload/page.tsx` | Back-link + `<h1>` → `PageHeader` + `Breadcrumbs`. |
| `jds/[id]/invite/page.tsx` | Same. |
| `jds/[id]/candidates/page.tsx` | Same, plus actions slot for the "Invite Candidate" button. |
| `jds/[id]/tests/[testId]/page.tsx` | Back-link → `Breadcrumbs` (no page-level title here; `TestEditorPanel` owns it). |
| `jds/[id]/tests/[testId]/preview/page.tsx` | Back-link + `<h1>` → `PageHeader` + `Breadcrumbs`. |
| `candidates/[id]/page.tsx` | Back-link → `Breadcrumbs`; the custom avatar+name header was left as-is (richer than `PageHeader` supports, intentionally). |
| `results/[attemptId]/page.tsx` | All 4 of this page's back-links (terminated/not-found/no-evaluation/success states) → `Breadcrumbs`; the main success-state header → `PageHeader` with the print/export/re-evaluate buttons as its `actions` slot. |
| `results/jd/[jdId]/page.tsx` | Back-link + header + actions → `PageHeader`; hand-rolled empty state → `EmptyState`. |
| `results/leaderboard/[jdId]/page.tsx` | Back-link → `Breadcrumbs`; hand-rolled empty state → `EmptyState`. Custom trophy-icon header kept as-is. |
| `results/report/[jdId]/page.tsx` | Same pattern as the per-JD leaderboard page. |
| `leaderboard/page.tsx` (global) | Hand-rolled empty state → `EmptyState` (top-level nav page, no back-link needed). |
| `components/admin/SettingsClient.tsx` | `statusTone`/`statusIcon` (System Health rows) switched from literal Tailwind `emerald`/`amber`/`red` to the app's `success`/`warning`/`danger` tokens — same visual result, consistent naming. |

No backend changes. No new dependencies. `candidates/[id]/page.tsx` and the
leaderboard pages' custom headers (avatar+name+badge, trophy icon) were
deliberately left as custom markup rather than forced into `PageHeader` —
that component doesn't have a slot for a leading icon/avatar, and flattening
these would have been a downgrade.

## Verification

- `npm run type-check`, `npm run lint` (0 errors, 63 warnings — same count
  as the Phase A/B baseline; confirmed each warning that touched an edited
  file predates this change except one `Link` import left unused after
  removing the last back-link in `results/[attemptId]/page.tsx`, which was
  fixed), and `npm run build` all pass.
- Not visually verified in a browser this session — same constraint as
  Phase A/B (no browser tool available; local docker frontend container
  was already crash-looping on an unrelated issue before this work started).

## Still Deferred

Candidate-facing UI and AI-specific UI states remain separate follow-up
batches, per the original phasing plan.
