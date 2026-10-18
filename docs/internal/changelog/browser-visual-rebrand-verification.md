# Browser Visual Rebrand Verification

Date: 2026-06-21

Claude's Light Indigo sidebar retint and brand-icon work had only been checked
with `npm run type-check`, `npm run lint`, and `npm run build`. This pass ran
the app in Docker, captured real browser screenshots, and verified the visual
surface that was called out in `docs/codex-handoff-light-indigo-rebrand.md`.

## What Was Verified

- Marketing home page hero, sticky nav, CTA band, and footer.
- Login page and favicon/logo rendering at small sizes.
- Admin dashboard with expanded and collapsed sidebar.
- Mobile admin dashboard header/search layout.
- AI Checker empty state.
- Settings Overview/System Health including the Ollama/local-model row and AI
  evaluation section.
- JD detail page, including the `AI extracted` tag.
- Evaluation detail page, including the `Preliminary AI Assessment` tag and
  AI-likeness panel.
- Public assessment registration page (`/apply/<slug>`).
- Candidate magic-link invitation page (`/tests/<token>`).
- Candidate exam page.

To cover fixture-dependent pages in the local empty database, a temporary local
Postgres fixture was inserted with IDs under the `11111111-1111-4111-8111-*`
range and a known local-only candidate token, then removed after screenshot
verification. No repo fixture file was added.

## What Was Found

The first authenticated screenshot showed a Next.js module error for
`recharts`. The repo already had `recharts` in `frontend/package.json` and
`package-lock.json`; the running Docker frontend was using a stale anonymous
`/app/node_modules` volume. Rebuilding the frontend image and recreating the
container with renewed anonymous volumes fixed the runtime mismatch.

The browser pass found one real rebrand miss: the evaluation report's
AI-likeness ring still used a hardcoded purple fallback stroke (`#7c3aed`),
and high-confidence AI-detection badges still routed through purple styling.

## What Changed

| File | Change |
| --- | --- |
| `src/app/(admin)/dashboard/results/[attemptId]/page.tsx` | AI-likeness ring low-concern stroke now uses the Light Indigo `brand-400` value (`#818cf8`) instead of the old purple fallback. |
| `src/types/evaluation.ts` | `HIGH` AI-detection confidence badge colors moved from `purple-*` to `brand-*`. |
| `src/components/admin/AiCheckerClient.tsx` | Standalone AI Checker high-confidence badge now uses the brand-backed `blue` badge variant instead of the shared generic purple variant. |
| `src/components/TalvynIcon.tsx` + logo call sites | Added decorative rendering for SVG logos that already sit beside visible brand text, avoiding duplicate "Talvyn" announcements for screen readers. |

Generic non-AI purple uses were left untouched, matching the scope decision in
`light-indigo-sidebar-retint.md` (Open-ended badges, manual-score badges,
Tools & Technologies tags, candidate quick-link chips, and similar category
colors).

## Verification

- Rebuilt the Docker frontend image and recreated the frontend/nginx services
  with renewed anonymous volumes.
- Captured browser screenshots for the public, admin, candidate, and fixture
  detail/report flows listed above.
- `npm run type-check` passes.
- `npm run lint` passes with the existing 62-warning baseline.
- `npm run build` passes.
