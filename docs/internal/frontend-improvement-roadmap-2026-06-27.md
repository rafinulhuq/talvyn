# Talvyn Frontend Improvement Roadmap

Date: 2026-06-27  
Scope: `frontend/` Next.js application  
Audience: future AI agents, frontend engineers, reviewers

This file turns the senior frontend audit into staged work. It is intentionally
operational: each phase includes why it matters, where to look, what to change,
what not to change, and how to verify completion.

## Current Baseline

Commands run during the audit:

```bash
cd frontend
npm run lint
npm run type-check
npm run build
npm audit --omit=dev
npm outdated --depth=0
```

Observed results:

- `npm run build` passes.
- Phase 1 update: `npm run lint` passes with `0 errors` and `0 warnings`.
- Phase 1 update: `npm run type-check` passes.
- Phase 1 update: `npm run build` passes with build-time lint/type checks enabled.
- Phase 2 update: `npm run lint`, `npm run type-check`, and `npm run build`
  pass after accessibility hardening.
- Phase 2 reverify update: initial axe smoke tests found contrast issues in
  primary brand CTAs and login helper text; both were fixed.
- Phase 3 update: Playwright + axe E2E harness added; `npm run test:e2e`
  passes with 11 smoke tests.
- Phase 4 update: dashboard chart code was split out of the critical path;
  `/dashboard` First Load JS moved from about `287 kB` to `181 kB`.
- `npm audit --omit=dev` reports `2 moderate` vulnerabilities through
  `next-auth -> uuid`.
- Original audit baseline had no frontend test harness. Phase 3 now adds
  Playwright E2E smoke coverage; component tests are still future work.
- Largest route from build output: `/dashboard` at about `287 kB First Load JS`.
- Shared JS from build output: about `178 kB`.
- Largest authored frontend files:
  - `frontend/src/app/(admin)/dashboard/results/[attemptId]/page.tsx`
  - `frontend/src/components/admin/SettingsClient.tsx`
  - `frontend/src/app/page.tsx`
  - `frontend/src/app/(admin)/dashboard/leaderboard/page.tsx`

Good existing foundations:

- Strict TypeScript is enabled.
- Next.js App Router is in use.
- Many admin pages are server components.
- Candidate/admin proxies are same-origin and avoid exposing internal secrets.
- Security headers are configured in `frontend/next.config.ts`.
- Candidate proxy routes use allowlists and body-size bounds.

## Target Quality Bar

Use these as verification targets unless product leadership changes them:

- LCP p75:
  - admin desktop: `<= 2500 ms`
  - candidate mobile: `<= 3000 ms`
- INP p75: `<= 200 ms`
- CLS p75: `<= 0.1`
- JS budget:
  - shared first-load JS: reduce toward `<= 150 kB`
  - admin route first-load JS: reduce toward `<= 220 kB`
  - candidate exam first-load JS: reduce toward `<= 200 kB`
- Lighthouse floors:
  - accessibility: `>= 95`
  - performance: `>= 80`

Do not treat these numbers as decorative. If a phase changes UI or bundle
shape, capture before/after measurements.

## Agent Rules

Future AI agents should follow these rules while executing this roadmap:

- Keep phases small. Do not combine unrelated phases in one large patch.
- Always run `npm run type-check` after TypeScript/UI changes.
- Run `npm run lint` after cleanup phases.
- Run `npm run build` after route, dynamic import, or dependency changes.
- Do not run `npm run type-check` in parallel with `npm run build`; both touch
  `.next/types`, which can produce false missing-file errors.
- Do not run `npm audit fix --force`; it currently suggests a breaking
  downgrade for `next-auth`.
- Do not expose or print secrets from `.env` files.
- Preserve unrelated dirty worktree changes.
- Prefer existing UI components and patterns before introducing new libraries.
- Candidate exam flows are high risk. Add tests before large refactors there.

## Phase Overview

| Phase | Status | Name | Risk | Goal |
|---|---|---:|---:|---|
| 0 | Captured | Baseline Capture | Low | Make current state measurable and repeatable |
| 1 | Done, reverified 2026-06-27 | Lint and Type Hygiene | Low-Med | Remove warning backlog and tighten quality gates |
| 2 | Done, axe-reverified 2026-06-27 | Accessibility Hardening | Med | Fix custom controls, dialogs, labels, focus behavior |
| 3 | Done, smoke coverage verified 2026-06-27 | Critical Path Test Harness | High | Add Playwright/component tests for core user journeys |
| 4 | Done, build/e2e verified 2026-06-27 | Bundle and Runtime Performance | Med | Reduce first-load JS and isolate heavy client code |
| 5 | Done, verified 2026-06-27 | Component Decomposition | Med | Split large client files into maintainable units |
| 6 | Done with documented auth exception 2026-06-27 | Dependency and Security Plan | Med-High | Handle audit/outdated packages safely |
| 7 | Done, verified 2026-06-27 | UX Resilience and Observability | Med | Improve loading/error states and frontend web-vitals visibility |

## Phase 0: Baseline Capture

Purpose:

Create a reproducible measurement baseline before making improvements. This
prevents future agents from claiming progress based only on subjective UI feel.

Primary files/directories:

- `frontend/package.json`
- `frontend/next.config.ts`
- `frontend/.next/` build output
- `docs/frontend-improvement-roadmap-2026-06-27.md`

Tasks:

- Record current lint warning count.
- Record current build route sizes.
- Record current dependency audit state.
- Optional but recommended: add a small script or docs section that explains
  how to collect these numbers.

Commands:

```bash
cd frontend
npm run lint
npm run type-check
npm run build
npm audit --omit=dev
npm outdated --depth=0
```

Acceptance criteria:

- Commands above are captured in a reviewer-readable note or PR description.
- Build output route table is preserved for comparison.
- No code behavior changes in this phase.

Notes:

- This phase is safe to do before all other phases.

## Phase 1: Lint and Type Hygiene

Status: completed on 2026-06-27.

Reverification: passed again on 2026-06-27 before starting Phase 2.

Purpose:

Turn lint from a warning backlog into a useful signal. Current lint output is
now build-blocking again because Phase 1 removed `eslint.ignoreDuringBuilds`
from `frontend/next.config.ts`.

Primary files/directories:

- `frontend/next.config.ts`
- `frontend/eslint.config.mjs`
- Files reported by `npm run lint`, especially:
  - `frontend/src/app/(admin)/dashboard/results/[attemptId]/page.tsx`
  - `frontend/src/app/test/[token]/exam/page.tsx`
  - `frontend/src/app/exam/[token]/section/page.tsx`
  - `frontend/src/components/admin/JdUploadForm.tsx`
  - `frontend/src/contexts/GenerationContext.tsx`

Tasks:

- Remove unused imports and unused local variables.
- Replace repeated `(result as any).error` patterns with typed API helpers.
- Fix stale `react-hooks/exhaustive-deps` warnings in candidate exam flows.
- Escape unescaped quote/apostrophe text warnings.
- Remove unnecessary `eslint-disable` comments where possible.
- Only after warning count is near zero, consider changing lint warnings that
  matter to errors.

Recommended helper shape:

```ts
type ApiErrorShape = {
  statusCode?: number;
  error?: {
    code?: string;
    message?: string;
    details?: Record<string, unknown>;
  };
};

function getApiError(result: unknown): ApiErrorShape {
  return typeof result === "object" && result !== null ? result as ApiErrorShape : {};
}
```

Acceptance criteria:

- `npm run lint` reports `0 errors` and ideally `0 warnings`.
- `npm run type-check` passes.
- Candidate submit/autosave behavior is not changed without tests.
- If `ignoreDuringBuilds` remains true, document why. If removed, `npm run build`
  must still pass.

Verification:

```bash
cd frontend
npm run lint
npm run type-check
npm run build
```

Completion notes:

- Removed the lint warning backlog across admin, candidate, API, hook, and type
  files.
- Removed `eslint.ignoreDuringBuilds: true` from `frontend/next.config.ts`.
- Added a typed API error-detail helper in `frontend/src/lib/api/client.ts`.
- Reworked candidate submit callbacks so `saveNow` is declared before use and
  included in hook dependencies.
- Left existing explicit `eslint-disable-next-line react-hooks/exhaustive-deps`
  comments in long-running generation/public-link resume effects for later
  behavior-focused refactors.

Risk notes:

- Stale hook dependency fixes can change runtime behavior. Treat candidate exam
  flow warnings as medium risk and manually review the closure logic.

## Phase 2: Accessibility Hardening

Status: completed on 2026-06-27 for code hardening and build verification.
Reverified on 2026-06-27 with Playwright + axe smoke tests.

Purpose:

Improve keyboard and screen-reader support. The audit found solid basics, but
custom controls and dialog/dropdown patterns need a stronger accessibility
contract.

Primary files/directories:

- `frontend/src/components/ui/Input.tsx`
- `frontend/src/components/ui/ConfirmDialog.tsx`
- `frontend/src/components/admin/AdminShell.tsx`
- `frontend/src/components/admin/NotificationBell.tsx`
- `frontend/src/components/admin/AdminSearch.tsx`
- `frontend/src/components/admin/JdUploadForm.tsx`
- `frontend/src/components/admin/BulkInviteForm.tsx`
- `frontend/src/components/admin/QuestionEditor.tsx`
- `frontend/src/components/candidate/MCQQuestion.tsx`

Tasks:

- Update `Input` to set:
  - `aria-invalid` when an error exists.
  - `aria-describedby` for error/helper text.
  - `role="alert"` or an equivalent live announcement for errors.
- Update `ConfirmDialog` to include:
  - `role="dialog"`
  - `aria-modal="true"`
  - labelled title via `aria-labelledby`
  - Escape-to-close
  - initial focus and focus trap
  - focus return to opener where practical
- Replace `div role="button"` upload/dropzone controls with real `<button>`
  wrappers where possible, or fully implement Space/Enter semantics.
- Ensure custom dropdowns close on Escape and expose labels:
  - notification bell
  - admin search
  - mobile drawer
- Add `aria-expanded`/`aria-controls` for expandable rows/panels.
- Ensure icon-only buttons have `aria-label`, not only `title`.
- Verify focus indicators are visible against all backgrounds.

Acceptance criteria:

- Keyboard-only user can:
  - sign in
  - navigate admin sidebar/drawer
  - upload a JD
  - use global search
  - answer and submit a candidate exam
  - confirm/cancel destructive dialogs
- No interactive control relies on hover only.
- `npm run type-check` passes.
- Playwright accessibility smoke tests exist by Phase 3, or manual keyboard
  testing notes are attached to the PR.

Verification:

```bash
cd frontend
npm run type-check
npm run build
```

Completion notes:

- Updated `Input` so helper/error text is connected with `aria-describedby`,
  invalid fields expose `aria-invalid`, and errors announce via `role="alert"`.
- Updated `ConfirmDialog` with dialog semantics, labelled title/description,
  Escape close, initial focus, focus trap, and focus return.
- Added skip links and focus targets to admin/candidate layouts.
- Improved admin mobile drawer focus management and Escape close behavior.
- Improved notification bell and admin search popup labels, state, live status,
  and Escape close behavior.
- Replaced JD upload and bulk invite custom dropzone `div role="button"`
  controls with native buttons.
- Added labels/controls for expandable question rows and candidate MCQ groups.
- Added explicit labels to icon-only copy/action buttons in public links,
  invite links, generation controls, and candidate invite rows.
- Added alert roles to surfaced auth/upload/invite errors where applicable.
- Fixed AA contrast failures found during Phase 3 smoke testing:
  - darkened `brand-500` in `frontend/tailwind.config.ts` so white primary
    actions clear WCAG AA contrast.
  - changed login helper copy from low-contrast slate tones to `text-slate-600`.

Verification performed:

```bash
cd frontend
npm run lint
npm run type-check
npm run build
npm run test:e2e
```

Observed result:

- All verification commands pass.
- Playwright axe smoke tests pass for `/` and `/login` with no critical or
  serious WCAG A/AA violations.
- Targeted scan for `role="button"` and tooltip-only labels in touched admin,
  candidate, and route files has no actionable findings. The remaining match is
  a `Section` component prop named `title`, not an HTML `title` attribute.

Manual checks:

- Tab through `/login`.
- Tab through `/dashboard`.
- Open and close mobile nav with keyboard.
- Open and close confirm dialogs with keyboard.
- Use candidate MCQ choices with keyboard shortcuts and Tab navigation.

Risk notes:

- Focus trap implementations can break nested buttons/forms if rushed. Keep
  the dialog primitive small and test it against every current caller.

## Phase 3: Critical Path Test Harness

Status: completed for deterministic no-secret smoke coverage on 2026-06-27.
Deeper authenticated admin and live candidate journey coverage remains as
follow-up work once stable backend test fixtures or seeded tokens are available.

Purpose:

Add real frontend regression coverage. The current frontend has no app-level
test harness visible in source, so behavior confidence comes mostly from build
and backend tests.

Primary setup files to add:

- `frontend/playwright.config.ts`
- `frontend/tests/e2e/*.spec.ts`
- Optional later:
  - `frontend/vitest.config.ts`
  - `frontend/src/**/*.test.tsx`

Recommended E2E coverage:

- Admin login happy path.
- JD upload validation:
  - reject invalid type
  - reject oversized file
  - happy path with mocked backend or test fixture
- Admin invite flow:
  - single invite validation
  - bulk CSV validation
- Candidate legacy test flow:
  - start
  - answer MCQ/open-ended
  - autosave indicator or resumed answer
  - submit
- Candidate sectioned exam flow:
  - start
  - navigate questions
  - submit section
  - final completion state
- Results report:
  - evaluation loading state
  - AI-likeness card shown when present
  - `Not analyzed` state shown when absent
  - admin decision save
- Settings danger zone:
  - confirmation text required before destructive actions

Recommended component/unit coverage:

- `Input`
- `Button`
- `ConfirmDialog`
- `MCQQuestion`
- `OpenEndedQuestion`
- `CodeQuestion`
- API result/error helper from Phase 1

Acceptance criteria:

- `npm test` or equivalent exists.
- `npm run test:e2e` or equivalent exists.
- E2E tests can run against a local app without using real secrets.
- Critical tests are documented in the PR.

Suggested scripts:

```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui"
  }
}
```

Verification:

```bash
cd frontend
npm run type-check
npm run build
npm run test:e2e
```

Completion notes:

- Added `@playwright/test` and `@axe-core/playwright`.
- Added `frontend/playwright.config.ts` with a self-starting Next.js dev server
  on port `3100`, `PLAYWRIGHT_BASE_URL` override support, CI retries, trace,
  screenshot, and video settings.
- Added package scripts:
  - `npm test`
  - `npm run test:e2e`
  - `npm run test:e2e:ui`
- Added `frontend/tests/e2e/accessibility.spec.ts` for:
  - login keyboard order
  - validation error announcement and `aria-invalid`
  - axe smoke coverage for `/` and `/login`
- Added `frontend/tests/e2e/auth.spec.ts` for:
  - protected dashboard redirect to `/login` with callback preservation
  - unsafe external callback URL staying inert before credential submission
- Added `frontend/tests/e2e/candidate-terminal.spec.ts` for:
  - `/test/complete` candidate guidance
  - `/test/expired` candidate guidance
  - axe smoke coverage on both candidate terminal pages
- Added `frontend/tests/e2e/landing.spec.ts` for:
  - landing-to-login navigation
  - how-it-works anchor navigation
- Added `frontend/tests/e2e/README.md` for future agents.

Verification performed:

```bash
cd frontend
npm run test:e2e
```

Observed result:

- 11 Playwright tests pass.

Remaining Phase 3 expansion:

- Authenticated admin flows need a seeded test admin or storage state fixture.
- Candidate exam start/answer/submit flows need stable seeded tokens.
- Results report tests should cover AI-likeness present/absent states.
- Settings danger-zone confirmation tests should be added after auth fixtures.

Risk notes:

- Avoid making E2E tests depend on external LLM/Ollama availability. Mock or
  seed stable backend states.

## Phase 4: Bundle and Runtime Performance

Status: completed and reverified on 2026-06-27. Remaining optional work
includes deeper client-island splitting for settings/leaderboard and reviewing
whether browser-side `axios` can be removed.

Purpose:

Reduce initial JS and improve interaction latency. Current first-load numbers
are workable but high for an auth-walled operational tool.

Primary files/directories:

- `frontend/src/app/(admin)/dashboard/page.tsx`
- `frontend/src/components/admin/dashboard/ActivityChart.tsx`
- `frontend/src/app/(admin)/dashboard/results/[attemptId]/page.tsx`
- `frontend/src/components/admin/SettingsClient.tsx`
- `frontend/next.config.ts`
- `frontend/package.json`

Tasks:

- Dynamically import `ActivityChart` so `recharts` is not part of the default
  dashboard critical path unless the chart is visible.
- Consider replacing `recharts` with a lighter SVG chart if dashboard charts
  are simple enough.
- Split heavy client pages into smaller client islands:
  - results report actions/admin controls
  - settings tabs
  - leaderboard filters
- Keep data-heavy display sections as server components where possible.
- Add `experimental.optimizePackageImports` for `lucide-react` after verifying
  build output.
- Review whether `axios` is needed in browser bundles. Native `fetch` may be
  sufficient for client-side API wrappers.
- Capture bundle numbers before/after.

Acceptance criteria:

- `/dashboard` first-load JS moves toward `<= 220 kB`.
- Candidate exam pages stay at or below current bundle size.
- No route regresses by more than `10 kB` without explanation.
- Build output is pasted into PR/review notes.

Verification:

```bash
cd frontend
npm run build
find .next/static/chunks -type f -name '*.js' -printf '%s %p\n' | sort -nr | head -30
```

Completion notes:

- Added `frontend/src/components/admin/dashboard/ActivityChartClient.tsx` as a
  small client wrapper that dynamically imports the Recharts-based
  `ActivityChart`.
- Added a fixed-height chart skeleton to prevent layout shift while the chart
  chunk loads.
- Changed `frontend/src/app/(admin)/dashboard/page.tsx` to import only the
  lightweight wrapper on the dashboard route.
- Enabled `experimental.optimizePackageImports` for `lucide-react` in
  `frontend/next.config.ts`.

Bundle results:

| Route metric | Before | After | Delta |
|---|---:|---:|---:|
| `/dashboard` First Load JS | `287 kB` | `181 kB` | `-106 kB` |
| Shared First Load JS | `178 kB` | `178 kB` | no meaningful change |
| `/exam/[token]/section` First Load JS | `214 kB` | `214 kB` | no regression |
| `/test/[token]/exam` First Load JS | `214 kB` | `214 kB` | no regression |

Verification performed:

```bash
cd frontend
npm run lint
npm run type-check
npm run build
npm run test:e2e
find .next/static/chunks -type f -name '*.js' -printf '%s %p\n' | sort -nr | head -30
```

Observed result:

- `npm run lint` passes.
- `npm run type-check` passes when run sequentially.
- `npm run build` passes.
- `npm run test:e2e` passes with 11 tests.
- Largest route-specific authored chunk after this pass is still the results
  report page chunk at about `43.9 kB`; this points naturally into Phase 5.

Risk notes:

- Dynamic imports can introduce layout shifts if loading fallbacks do not have
  stable dimensions. Use fixed-height skeletons for chart areas.

## Phase 5: Component Decomposition

Status: completed and verified on 2026-06-27.

Purpose:

Make large UI files easier for humans and AI agents to modify safely. This is
especially important for results reports and settings, where many workflows
currently live in one file.

Primary files:

- `frontend/src/app/(admin)/dashboard/results/[attemptId]/page.tsx`
- `frontend/src/components/admin/SettingsClient.tsx`
- `frontend/src/app/(admin)/dashboard/leaderboard/page.tsx`
- `frontend/src/app/page.tsx`

Suggested extraction for results report:

- `components/admin/results/ScoreOverview.tsx`
- `components/admin/results/AILikenessCard.tsx`
- `components/admin/results/QuestionFeedbackCard.tsx`
- `components/admin/results/AdminDecisionPanel.tsx`
- `components/admin/results/ReportActions.tsx`
- `hooks/useEvaluationReport.ts`

Suggested extraction for settings:

- `components/admin/settings/SystemHealthSection.tsx`
- `components/admin/settings/AIEvaluationSection.tsx`
- `components/admin/settings/BackupRestoreSection.tsx`
- `components/admin/settings/ResetDataSection.tsx`
- `components/admin/settings/AuditLogSection.tsx`
- `components/admin/settings/SettingsPrimitives.tsx`

Acceptance criteria:

- No extracted component exceeds about `250-300` lines unless it has a clear
  reason.
- Behavior remains unchanged.
- `npm run type-check` and `npm run build` pass.
- Prefer moving code over rewriting logic in this phase.

Verification:

```bash
cd frontend
npm run lint
npm run type-check
npm run build
npm run test:e2e
wc -l src/app/'(admin)'/dashboard/results/'[attemptId]'/page.tsx src/components/admin/results/*.tsx src/components/admin/SettingsClient.tsx src/components/admin/settings/*.tsx
```

Completion notes for results report pass:

- Split `frontend/src/app/(admin)/dashboard/results/[attemptId]/page.tsx`
  from `1135` lines to `363` lines.
- Added focused result-report components:
  - `frontend/src/components/admin/results/ReportActions.tsx`
  - `frontend/src/components/admin/results/ScoreOverview.tsx`
  - `frontend/src/components/admin/results/RecommendationSummary.tsx`
  - `frontend/src/components/admin/results/AILikenessCard.tsx`
  - `frontend/src/components/admin/results/SkillBreakdown.tsx`
  - `frontend/src/components/admin/results/AdminDecisionPanel.tsx`
  - `frontend/src/components/admin/results/QuestionFeedbackCard.tsx`
- Preserved behavior by moving existing rendering and admin-scoring logic rather
  than redesigning it.
- `QuestionFeedbackCard.tsx` is `330` lines, slightly over the soft target. It
  is isolated now and can be split later into answer display, AI-likeness
  details, and admin score override subcomponents if needed.
- Verification on 2026-06-27:
  - `npm run lint` passes.
  - `npm run type-check` passes.
  - `npm run build` passes.
  - `npm run test:e2e` passes with 11 tests.

Completion notes for settings pass:

- Split `frontend/src/components/admin/SettingsClient.tsx` from `932` lines to
  `151` lines.
- Added focused settings components:
  - `frontend/src/components/admin/settings/SettingsPrimitives.tsx`
  - `frontend/src/components/admin/settings/SystemHealthSection.tsx`
  - `frontend/src/components/admin/settings/AIEvaluationSection.tsx`
  - `frontend/src/components/admin/settings/BackupRestoreSection.tsx`
  - `frontend/src/components/admin/settings/ResetDataSection.tsx`
  - `frontend/src/components/admin/settings/AuditLogSection.tsx`
- Kept tab state and tab composition in `SettingsClient`; moved service checks,
  model labels, backup/restore, reset, and audit pagination into feature files.
- All extracted settings components are below the soft `250-300` line target.
- Verification on 2026-06-27:
  - `npm run lint` passes.
  - `npm run type-check` passes.
  - `npm run build` passes.
  - `npm run test:e2e` passes with 11 tests.

Completion notes for leaderboard pass:

- Split `frontend/src/app/(admin)/dashboard/leaderboard/page.tsx` from `620`
  lines to `156` lines.
- Added focused leaderboard components:
  - `frontend/src/components/admin/leaderboard/LeaderboardCandidateRow.tsx`
  - `frontend/src/components/admin/leaderboard/LeaderboardFilters.tsx`
  - `frontend/src/components/admin/leaderboard/LeaderboardStats.tsx`
  - `frontend/src/components/admin/leaderboard/LeaderboardTable.tsx`
- Kept data loading, filtering, sorting, and display-rank orchestration in the
  route; moved expandable row rendering, filter controls, summary stats, and
  table chrome into feature components.

Completion notes for landing pass:

- Split `frontend/src/app/page.tsx` from `775` lines to `31` lines.
- Added focused landing components:
  - `frontend/src/components/landing/GradientText.tsx`
  - `frontend/src/components/landing/DashboardMockup.tsx`
  - `frontend/src/components/landing/HeroSection.tsx`
  - `frontend/src/components/landing/SocialProofSections.tsx`
  - `frontend/src/components/landing/HowItWorksSection.tsx`
  - `frontend/src/components/landing/AssessmentTypesSection.tsx`
  - `frontend/src/components/landing/FeaturesSection.tsx`
  - `frontend/src/components/landing/ComparisonSection.tsx`
  - `frontend/src/components/landing/TestimonialsSection.tsx`
  - `frontend/src/components/landing/FinalCtaSection.tsx`
  - `frontend/src/components/landing/LandingFooter.tsx`
- Preserved the existing section order and `AnimatedSection` wrappers.

Final Phase 5 verification on 2026-06-27:

- `npm run lint` passes.
- `npm run type-check` passes.
- `npm run build` passes.
- `npm run test:e2e` passes with 11 tests.
- All newly extracted leaderboard, landing, results, and settings components
  are below `250` lines except `QuestionFeedbackCard.tsx` at `330` lines,
  which is isolated and documented as the remaining deliberately dense card.

Future optional cleanup:

- Consider extracting `useEvaluationReport` only if future changes add more
  report-side data orchestration; the current page logic is now small enough to
  keep local.

Risk notes:

- Do not combine this with visual redesign. This phase is structure-only.

## Phase 6: Dependency and Security Plan

Status: completed on 2026-06-27 for safe patch/minor upgrades and dependency
triage. One moderate auth-chain advisory remains as a documented exception
because the only automated npm fix is a breaking `next-auth` downgrade.

Purpose:

Handle dependency risk without breaking auth or Prisma/Next compatibility.

Current audit item:

- `npm audit --omit=dev` reports `uuid < 11.1.1` via `next-auth`.
- `npm audit fix --force` suggests installing `next-auth@3.29.10`, which is a
  breaking downgrade. Do not do this.
- Verified on 2026-06-27: installed chain is `next-auth@4.24.14 -> uuid@8.3.2`.
  The published `next-auth` v4 line has no newer safe patch at this time.
- Verified on 2026-06-27: app source has no direct `uuid` imports in
  `frontend/src` or `frontend/prisma`.

Primary files:

- `frontend/package.json`
- `frontend/package-lock.json`
- `frontend/src/lib/auth.ts`
- `frontend/src/app/api/auth/[...nextauth]/route.ts`
- `frontend/middleware.ts`

Tasks:

- Track whether a safe `next-auth@4.x` patch becomes available.
- If not, plan migration to Auth.js/NextAuth v5 as a dedicated project.
- Upgrade patch/minor dependencies first:
  - `@sentry/nextjs`
  - `@typescript-eslint/*`
  - `axios`
  - `recharts`
- Treat major upgrades separately:
  - Next 16
  - React 19.2
  - Prisma 7
  - Tailwind 4
  - Zod 4
- After any auth dependency change, run middleware/proxy/auth smoke tests.

Acceptance criteria:

- `npm audit --omit=dev` has no untriaged moderate-or-higher advisories, or a
  documented exception with rationale.
- Auth login, logout, middleware, and admin proxy still work.
- Prisma seed flow still works in Docker.

Verification:

```bash
cd frontend
npm install
npm run lint
npm run type-check
npm run build
npm run test:e2e
npm run db:generate
npm audit --omit=dev
npm outdated --depth=0
```

Completion notes:

- Upgraded safe patch/minor dependencies:
  - `@sentry/nextjs` to `^10.62.0`
  - `@typescript-eslint/eslint-plugin` to `^8.62.0`
  - `@typescript-eslint/parser` to `^8.62.0`
  - `axios` to `^1.18.1`
  - `recharts` to `^3.9.0`
  - `autoprefixer` to `^10.5.2`
- Left major-version upgrades for dedicated migration work:
  - Next 16 / eslint-config-next 16
  - React 19.2 / React DOM 19.2
  - Prisma 7
  - Tailwind 4
  - Zod 4
  - TypeScript 6
  - lucide-react 1.x
  - bcryptjs 3
- `npm audit --omit=dev` still reports the known two moderate entries:
  `next-auth` and transitive `uuid`.
- Exception rationale: `npm audit fix --force` would install
  `next-auth@3.29.10`, a breaking downgrade from v4. The safer path is to keep
  v4 pinned for now, monitor for a v4 patch, and plan Auth.js/NextAuth v5 as a
  separate auth migration with login/logout/session/middleware/proxy coverage.
- The dependency-auditor offline scan was run, but it pattern-matched stale
  transitive/dev package names that npm does not report as installed advisories.
  `npm audit` is the release-gating source for this phase.

Verification performed on 2026-06-27:

- `npm run lint` passes.
- `npm run type-check` passes.
- `npm run build` passes.
- `npm run test:e2e` passes with 11 tests.
- `npm run db:generate` passes with Prisma Client `v6.19.3`; Prisma warns that
  `package.json#prisma` should migrate to a Prisma config before Prisma 7.
- `npm outdated --depth=0` now shows only major-version families or intentionally
  pinned core stack packages after the safe patch/minor upgrades.
- Docker seed flow was not rerun in this pass because Prisma was not upgraded;
  run it before any Prisma 7 migration or deployment database change.

Risk notes:

- Next/Auth/Prisma upgrades can cascade into Docker and DB behavior. Do not
  batch them with visual/component refactors.

## Phase 7: UX Resilience and Observability

Status: completed and verified on 2026-06-27 for code-level resilience,
route-level fallbacks, and automated smoke coverage. Staging drills with real
candidate tokens are still recommended before a production release.

Purpose:

Make the app easier to operate in production and easier to debug when
candidate/admin flows fail.

Primary files/directories:

- `frontend/src/instrumentation-client.ts`
- `frontend/src/components/WebVitalsReporter.tsx`
- `frontend/src/app/api/observability/web-vitals/route.ts`
- `frontend/src/components/admin/GenerationBanner.tsx`
- `frontend/src/contexts/GenerationContext.tsx`
- `frontend/src/hooks/useAutoSave.ts`
- `frontend/src/hooks/useSuspiciousEvents.ts`
- `frontend/src/app/test/[token]/exam/page.tsx`
- `frontend/src/app/exam/[token]/section/page.tsx`
- `frontend/src/components/ui/ErrorState.tsx`
- `frontend/src/components/ui/StatusBanner.tsx`
- `frontend/src/app/global-error.tsx`
- `frontend/src/app/(admin)/dashboard/settings/loading.tsx`
- `frontend/src/app/(admin)/dashboard/leaderboard/loading.tsx`
- `frontend/src/app/(admin)/dashboard/results/[attemptId]/loading.tsx`

Tasks:

- Add `useReportWebVitals` reporting to GlitchTip/Sentry or a lightweight
  backend endpoint.
- Add explicit offline/retry status for candidate autosave, instead of silent
  null returns only.
- Ensure submit failures always preserve a retry path and do not show false
  completion.
- Improve long-running generation states:
  - progress text
  - retry action
  - clear recovery guidance
- Add route-level error boundaries where missing.
- Standardize loading skeletons for heavy admin pages.

Acceptance criteria:

- Web vitals are visible in one monitoring destination or logged in development.
- Candidate autosave failures are visible but not panic-inducing.
- All long-running admin AI actions show a recoverable state.
- `npm run type-check` and `npm run build` pass.

Verification:

```bash
cd frontend
npm run lint
npm run type-check
npm run build
npm run test:e2e
npm audit --omit=dev
npm outdated --depth=0
npm run db:generate
```

Completion notes:

- Added `WebVitalsReporter` and a lightweight
  `/api/observability/web-vitals` endpoint.
  - Reporting is gated by `NEXT_PUBLIC_WEB_VITALS_ENABLED=true`.
  - The client uses `navigator.sendBeacon` with `fetch(..., keepalive: true)`
    fallback.
  - The endpoint validates metric name/value and returns `204` for valid
    metrics; it logs only when `OBSERVABILITY_DEBUG=1`.
- Added Playwright coverage for the web-vitals endpoint:
  `frontend/tests/e2e/observability.spec.ts`.
- Extended candidate autosave with explicit online/offline state.
  - Dirty answers stay queued while offline.
  - `/test/[token]/exam` and `/exam/[token]/section` now show
    `Offline - answers will retry` instead of only a generic save failure.
- Preserved candidate submit retry paths already added in earlier phases:
  submit failures do not show a false completion screen and keep a retry action.
- Extended long-running generation recovery:
  - `GenerationContext` persists `startedAt`.
  - `GenerationBanner` shows elapsed time, clear background-progress guidance,
    and a `Check now` action that refreshes backend generation status.
- Added `frontend/src/app/global-error.tsx` for root-level unexpected failures.
- Added loading skeletons for:
  - `/dashboard/settings`
  - `/dashboard/leaderboard`
  - `/dashboard/results/[attemptId]`

Verification performed on 2026-06-27:

- `npm run lint` passes.
- `npm run type-check` passes.
- `npm run build` passes.
- `npm run test:e2e` passes with 12 tests.
- `npm run db:generate` passes with the existing Prisma 7 config deprecation
  warning.
- `npm audit --omit=dev` still reports only the documented
  `next-auth@4.24.14 -> uuid@8.3.2` moderate advisory chain.
- `npm outdated --depth=0` still shows only deferred major-version migrations
  or intentionally pinned core stack packages.
- Build-size note: adding web-vitals reporting increases shared first-load JS
  from about `178 kB` to `182 kB`; `/dashboard` remains within the Phase 4
  budget at about `186 kB First Load JS`.

Manual checks:

- Simulate offline during candidate exam autosave.
- Simulate backend timeout during generation/evaluation.
- Confirm UI gives a retry path.

Manual verification note:

- These staging drills still need to be run with real or seeded candidate
  tokens and controllable backend failure fixtures. The code paths are present
  and automated smoke coverage passes, but this local pass did not perform live
  offline/backend-timeout drills.

## Full Roadmap Verification

Status: all roadmap phases are complete as of 2026-06-27, with one documented
dependency exception and one staging-manual-check note.

Commands verified in the final pass:

```bash
cd frontend
npm run lint
npm run type-check
npm run build
npm run test:e2e
npm audit --omit=dev
npm outdated --depth=0
npm run db:generate
git diff --check
```

Final observed results:

- Phase 1 quality gate: `npm run lint` passes.
- Phase 1 type gate: `npm run type-check` passes.
- Phase 3 smoke gate: `npm run test:e2e` passes with 12 tests.
- Phase 4 bundle gate: `/dashboard` is about `186 kB First Load JS`, still
  below the `<= 220 kB` roadmap target; candidate exam pages are about
  `219 kB First Load JS`.
- Phase 5 maintainability gate: large results/settings/leaderboard/landing
  files have been split into focused components. The only component above the
  soft line target is the documented `QuestionFeedbackCard.tsx` at `330` lines.
- Phase 6 dependency gate: `npm audit --omit=dev` has one documented exception:
  the `next-auth@4.24.14 -> uuid@8.3.2` moderate advisory chain. Do not run
  `npm audit fix --force`; it attempts a breaking downgrade to
  `next-auth@3.29.10`.
- Phase 7 resilience gate: web-vitals ingestion endpoint, global error boundary,
  candidate offline autosave status, generation status recheck, and loading
  skeletons are implemented.
- Prisma sanity: `npm run db:generate` passes; Prisma warns that
  `package.json#prisma` should move to a Prisma config before Prisma 7.

Remaining release checklist:

- Run staging/manual candidate-token drills for offline autosave and backend
  timeout/retry behavior.
- Plan Auth.js/NextAuth v5 migration separately if no safe NextAuth v4 patch is
  released for the `uuid` advisory.
- Plan Prisma 7 migration separately, including the `prisma.config.ts` move.

## Suggested Execution Order

Recommended order:

1. Phase 0
2. Phase 1
3. Phase 2
4. Phase 3
5. Phase 4
6. Phase 5
7. Phase 6
8. Phase 7

Possible parallelization:

- Phase 6 patch/minor dependency review can run parallel with Phase 1.
- Phase 2 accessibility and Phase 3 test harness can run together if one agent
  owns a11y fixes and another owns Playwright setup.
- Phase 4 should wait until Phase 0 is captured.
- Phase 5 should wait until Phase 3 has at least basic coverage for affected
  workflows.

## Definition of Done for the Roadmap

The roadmap is complete when:

- `npm run lint` has no warnings or only documented exceptions.
- `npm run type-check` passes.
- `npm run build` passes.
- Critical Playwright tests pass.
- Accessibility smoke tests/manual checks pass.
- First-load JS is within agreed budget or has a documented exception.
- `npm audit --omit=dev` has no untriaged moderate-or-higher issues, or has a
  documented exception with rationale and owner.
- Large files are split enough that future changes can be made locally without
  reading a thousand-line page.

## Quick Reference for Future Agents

Start every frontend improvement session with:

```bash
cd frontend
npm run type-check
npm run lint
```

Before finalizing frontend work, run:

```bash
cd frontend
npm run type-check
npm run build
```

If the work touches candidate exams, also manually verify:

- `/test/[token]`
- `/test/[token]/exam`
- `/exam/[token]`
- `/exam/[token]/section`

If the work touches admin auth/proxy, manually verify:

- `/login`
- `/dashboard`
- one client-side `/api/proxy/*` request
- one server-side `serverFetch` page

If the work touches upload/proxy routes, verify size/type rejection as well as
happy paths.
