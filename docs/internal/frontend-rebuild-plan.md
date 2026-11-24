# Talvyn frontend: ground-up rebuild

## Status (2026-11-24)

| Phase | State | Commit |
|---|---|---|
| 0–7 | Done | up to `0ac60f9` |
| 8 Highgarden | Done | `29aeedb` |
| 9 Hardening | Mostly done: e2e suite + axe sweep (9a), first-load JS and Docs link (9b), CSP (9c) | `e7e7826`, `26d6037`, `dcb66bf` |
| Gate 2 | Skipped: merged to `main` at the owner's request before review | `main` = `dcb66bf` |

**Not deployed yet.** The repo has no self-hosted runner registered, so CI and `deploy.yml` are queued. Production serves the old UI until the runner on the production box is back.

Phase 9 still open (details at the end of `frontend-contract.md`): the 2GB prod image (standalone output), the candidate flow in the automated suite, a local `docker-compose.prod.yml` run (its project name clashes with the dev stack).

## Context
The current `frontend/` (Next 16.3.4, ~50k LOC: 53 pages, 32 API routes) has to be deleted and rebuilt from scratch. That covers every surface: admin app, candidate exam, auth, marketing, blog/CMS and Highgarden analytics. The goal is a premium SaaS for international clients that can be shown to prospects, with no AI-slop look. Decisions already made with the user:
- Rebuild **everything**.
- Rewrite the **server layer** (NextAuth, the `/api/proxy` layer, upload routes, host-split middleware) cleanly, keeping **the same behavior and contracts**.
- Work on a **branch**: delete the old frontend there, rebuild in phases, and merge to `main` only at parity. `deploy.yml` auto-deploys `main`, so prod keeps the old UI until the merge.
- The new design shares nothing with the current one (yellow `#F2D74E`; Inter, Plus Jakarta Sans and Geist Mono).

The FastAPI backend is **not changed**. The new frontend uses only endpoints that already exist.

## What survives the deletion (not UI, kept on purpose)
- `frontend/wasm-parser/` (the Rust PDF/DOCX→text crate) and its built output `public/wasm/talvyn_parser_bg.wasm`, plus the `src/lib/wasm/*` bindings.
- `frontend/prisma/schema.prisma`. It mirrors the DB schema that Alembic owns, so it is not frontend design. Re-check it with `prisma db pull` against a migrated DB.
- **Env-var contract** stays identical, so `docker-compose.prod.yml` build args and the CI env keep working: `FASTAPI_INTERNAL_URL`, `INTERNAL_API_SECRET`, `NEXTAUTH_*`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_CANDIDATE_API_URL`, `HIGHGARDEN_*`, `NEXT_PUBLIC_GLITCHTIP_DSN`, `NEXT_PUBLIC_WEB_VITALS_ENABLED`.
- The backend type contracts in `src/types/*.ts` and `src/lib/api/*.ts` are read as the **reference** for the request/response shapes. They get rewritten, not copied blindly.

Everything else under `frontend/` is deleted in the first commit on the branch.

## Design direction: proposed, approved at Gate 1
**"Quiet precision".** Light-first with a full dark theme. Calm, document-grade and trustworthy for international buyers: it reads like infrastructure, not like a template.

- **Palette** (tuned on the style tile):
  - Paper `#FBFBFA`, surface `#FFFFFF`, ink `#0E0F12`.
  - Neutrals: a cool 11-step grey ramp.
  - **One accent**: deep cobalt (about `#2C46F0`), used only for primary actions, focus rings and selection.
  - Semantic colours (success, warning, danger) are muted and never decorative.
  - Dark theme: graphite `#0C0D10` with raised surfaces separated by 1px hairlines, not shadows.
- **Type:**
  - UI: **IBM Plex Sans**, with tabular numerals for every score, timer and table.
  - Code and IDs: **IBM Plex Mono**.
  - Marketing headlines only: **Instrument Serif**.
  - All three are loaded via `next/font/google`. The family names get verified at the first build.
- **Rules that prevent "AI slop"** (written into `DESIGN.md` and enforced in review):
  - No glassmorphism, gradient blobs, glow shadows or emoji icons.
  - No default "3 centered feature cards" layouts.
  - No placeholder marketing copy ("Supercharge…").
  - 4px spacing grid, 8px max radius, 1px borders.
  - Motion stays at 150–220ms ease-out, with a `prefers-reduced-motion` fallback.
  - Every screen has designed empty, loading, error and permission-denied states.
  - WCAG AA contrast in both themes.
  - Realistic seed copy and data on every screen.

## Premium SaaS features (frontend-only, on existing endpoints)
- **⌘K command palette**: navigation, actions, and global search via the existing `/search` API.
- **Keyboard shortcuts** with a `?` cheat-sheet.
- **Data tables**: sortable and filterable, with saved views (localStorage), column visibility, bulk select and actions, and density toggle.
- **Side-sheet detail views** (candidate, attempt, test), so lists never lose context.
- **Live generation progress** over the existing SSE stream, with a global activity tray.
- **Candidate compare** (2–4 side by side), built client-side from the existing results/evaluation data.
- **Print-grade report layout**: `@media print` styling, plus the existing DOCX export.
- Notification centre, a workspace switcher-style header, and a polished onboarding checklist on the empty dashboard.
- Marketing site: product-led landing, pricing/contact section, blog with good reading typography, a trust/security page.

Anything that would need new backend endpoints is out of scope and gets flagged, not built.

## New dependencies (each needs your OK)
- `@radix-ui/react-*` (dialog, dropdown-menu, popover, tooltip, tabs, select, checkbox, switch, toast): accessible unstyled primitives. Writing these by hand is the main source of a11y bugs.
- `cmdk`: the command palette.
- `@tanstack/react-table`: headless table state for saved views, sorting and bulk select.
- **Kept**: `next-auth` v4, `@prisma/client`, `axios` (for the proxy's long-timeout reason), `zod`, `recharts`, `@tiptap/*`, `react-markdown` + `remark-gfm`, `lucide-react`, `next-themes`, `@sentry/nextjs`, `bcryptjs`, `libphonenumber-js`, `clsx`. Tailwind v4 stays.

## Phases (one focused change per phase, each ends green: type-check + lint + build)
0. **Branch and clean slate.** Create `frontend-rebuild`. Write `docs/internal/frontend-contract.md`, which inventories every route, every API route's behavior, and each backend endpoint used. Then delete the old frontend (keeping the survivors above) and scaffold a fresh Next 16 app. Read `node_modules/next/dist/docs/` first, as `frontend/AGENTS.md` requires.
1. **Design system.**
   - Tokens (CSS variables + Tailwind v4 `@theme`), fonts, and primitives: button, input, select, table, sheet, dialog, toast, badge, tabs, skeleton, empty state.
   - A dev-only `/_design` style-tile page.
   - **Gate 1: you approve the look before any screens are built.**
2. **Server layer rewrite.**
   - `/api/proxy`, with path normalization and a dot-segment reject that fixes review issue #1.
   - `/api/candidate`, `/api/public`, uploads (JD, ATS, AI-checker, CMS/CMP media, avatars), signup, password reset, admin user routes, NextAuth credentials plus `sessionState`, the www/app host-split `middleware.ts`, Highgarden track/lock/unlock/OTP, web-vitals.
   - Port the existing API e2e specs (`signup-api`, `signup-status-api`, `auth`) first, as contract tests.
3. **App shell + auth.** Sidebar/topbar, ⌘K, theming, role-aware nav (keeping `DEV` docs-only), login, signup, forgot/reset password.
4. **Core hiring workflow.** JD list/upload/generate, JD detail, test generation + SSE, test editor/preview, question bank, invite (single, bulk CSV, public link), candidates, results/by-JD/report/leaderboard, exam results.
5. **Candidate experience** (the highest-risk phase).
   - Invitation landing, `/apply/[slug]`, timed test and sectioned exam, completion/expired/terminated states.
   - Rebuilt with the same mechanics: web-worker timer, IndexedDB + bulk autosave, heartbeat, suspicious-event telemetry, progressive integrity.
   - Behavior is kept exactly. Only the presentation changes.
6. **Admin operations.** Users, settings + webhooks, exam templates, trash, AI checker, ATS checker, profile, companies, the `/dashboard/docs` proxy route.
7. **Marketing, blog, CMS/CMP.** New landing, blog index/post, CMS and CMP editors (TipTap), robots/sitemap.
8. **Highgarden analytics.** Overview, sessions, funnels, heatmaps, feedback, alerts, unlock flow.
9. **Hardening.**
   - Full Playwright e2e (auth, candidate terminal flow, a11y with axe, landing).
   - Lighthouse pass, prod `Dockerfile.prod` build, and a full stack run via `docker-compose.prod.yml` locally.
   - **Gate 2: you review before the merge to `main`.**

Commits on the branch are under `rafinulhuq` only, with no AI attribution lines (per your vault feedback). Nothing gets pushed without asking.

## Critical files
- Reference only (read, then deleted): `frontend/src/app/api/proxy/[...path]/route.ts`, `src/middleware.ts`, `src/lib/hosts.ts`, `src/lib/auth.ts`, `src/lib/auth/*`, `src/hooks/useTestTimer.ts`, `useWebWorkerTimer.ts`, `useAutoSave.ts`, `useSuspiciousEvents.ts`, `useProgressiveIntegrity.ts`, `src/lib/storage/candidateIndexedDb.ts`, `next.config.ts` (security headers).
- Must keep working, not edited: `docker-compose.prod.yml` frontend build args, `.github/workflows/ci.yml` `frontend-checks` (`lint`, `type-check`, `build`).

## Verification
- Every phase: `npm run type-check && npm run lint && npm run build` in `frontend/`.
- Phase 2: the ported API contract specs pass against a local stack (`./start.sh`).
- Phase 5: a candidate takes a full timed test end to end on the local stack. Checks: autosave survives a reload, the timer is enforced server-side, integrity events reach the backend, evaluation runs.
- Phase 9: full Playwright suite, axe with no violations above minor, prod Docker build boots, and both themes are checked on desktop and at 375px.
- I'll report anything untested as untested.

## Honest sizing
This is a multi-session rebuild, not one sitting. The old UI is around 35k LOC of components and pages. I'll stop at each gate and after each phase with a short status, so you can redirect early.
