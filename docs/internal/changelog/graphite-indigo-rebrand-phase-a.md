# Graphite + Electric Indigo Rebrand — Phase A

Date: 2026-06-21

A full admin-UI visual rebrand was requested (new color system, dark
sidebar, ~15-item nav, dashboard rebuild, charts, and a pass over 13 pages
plus the candidate-facing UI). Given the scope, it was split into phases;
this is **Phase A only**: design tokens, the sidebar/layout shell, and the
dashboard. Everything else from the original request (badge consistency,
applying the style elsewhere, candidate UI, AI-specific UI states) is
deferred to follow-up batches.

## What Shipped

| Area | Change |
| --- | --- |
| Design tokens | `frontend/tailwind.config.ts` — the `brand` scale now resolves to Electric Indigo (`#6366F1`, hover `#4F46E5`), re-skinning every existing `brand-*` usage app-wide. Added an `ink` scale (`#0A0A0A`/`#171717`/`#262626`) for dark surfaces and an `info` color (`#38BDF8`). `success`/`warning`/`danger` already matched the requested palette and were left untouched. |
| Sidebar | `frontend/src/components/admin/Sidebar.tsx` rebuilt as a dark graphite nav, grouped into Workflow / AI & Insights / System, with indigo active states and a footer showing real system status + the signed-in admin. `frontend/src/app/(admin)/layout.tsx` now fetches `/health/ready` once and passes a `SidebarSystemStatus` down through `AdminShell`. |
| Dashboard | `frontend/src/app/(admin)/dashboard/page.tsx` rebuilt with 5 KPI cards, an Assessment Activity chart, a Candidate Pipeline funnel, a merged Recent Activity feed, a Top Roles card, and a System Status card. |
| New backend endpoints | `GET /api/v1/stats/pipeline` (funnel counts: invited/started/in_progress/submitted/reviewed/recommended/rejected), `GET /api/v1/stats/timeline` (daily invitation/start/submit/evaluation counts for the chart), `GET /api/v1/stats/roles` (top job descriptions by completion rate) — all additive, read-only, no existing contract changes. |
| New dependency | `recharts` — no chart library existed in the project; added for the Assessment Activity chart rather than hand-rolling SVG, per explicit approval. |

## Decisions Made Up Front

Three scope questions were resolved before implementation (asked of the
user, not assumed):

1. **Phasing** — do this in reviewable phases, not one 11-step pass.
2. **Charting** — add `recharts` rather than hand-rolled SVG/CSS.
3. **Nav scope** — restyle only the 7 routes that exist today
   (`/dashboard`, `/jds`, `/candidates`, `/results`, `/leaderboard`,
   `/ai-checker`, `/settings`); do not scaffold the ~8 additional pages
   implied by the original request's 15-item nav (Assessments, Invitations,
   Reports, Analytics, Public Links, Integrations, System Health, Audit
   Logs — several of these already exist as tabs/sections inside other
   pages, e.g. System Health and Audit Logs both live under Settings).

## Deliberately Not Faked

The original request explicitly allowed placeholder/demo data for sections
without a real backend source. Two places where that template would have
applied were instead wired to real data:

- **Recent Activity** — merges `GET /api/v1/stats/completions` (candidate
  submission/evaluation events) with the existing
  `GET /api/v1/admin/audit-log` (admin actions), sorted by time. No
  synthetic rows.
- **Completion Rate KPI card** — computed from the new pipeline endpoint
  (`submitted / invited`), not a placeholder. Trend-arrow indicators
  suggested for the KPI cards were skipped rather than faked: the four
  count cards are lifetime totals, and fabricating a period-over-period
  delta for a cumulative count would have been actively misleading.

## Verification

- Backend: `ruff check app/` passes; app imports cleanly with 84 routes
  (was 81 before the three new endpoints).
- Frontend: `npm run type-check`, `npm run lint` (0 errors, pre-existing
  warning count unchanged), and `npm run build` all pass.
- **Not done**: a real browser visual check. No browser/screenshot tool was
  available in this session, and the local docker dev stack's frontend
  container was already crash-looping on an unrelated Prisma/Postgres seed
  error before this work started. Manual `npm run dev` + browser smoke test
  is recommended before treating this as final, especially for the new
  dark sidebar and the recharts-based chart.

## Still To Do (Follow-up Batches, Not This Pass)

- Badge consistency pass (Step 5 of the original request).
- Apply the new visual language to the remaining pages (JD list/detail,
  candidates, results, settings, etc.) — Phase A only touched the sidebar
  shell and the dashboard.
- Candidate-facing UI pass (kept deliberately calmer/lighter than admin per
  the original request).
- AI-specific UI states (generating/extracting/evaluating indicators,
  "Needs Human Review" labels, etc.).
- Accessibility/responsiveness sweep across the newly touched components.
