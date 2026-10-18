# Remaining Roadmap Items — Status + Plan

> **For agentic workers:** This doc covers the 5 items from the task board (screenshot dated 2026-08-04) that are genuinely unbuilt or unfinished, after auditing the other 4 board items against the actual codebase. Each section below is a standalone mini-plan — read the "Current State" first, since the real code may have moved on since this audit. Use superpowers:writing-plans to expand any section into a full task-by-task plan (schema/code/tests) before implementing, same as `docs/superpowers/plans/2026-07-29-admin-signup-approval-plan.md` or `2026-07-27-highgarden-analytics-plan.md`.

## Board audit summary (2026-08-04)

| Item | Board status | Verified status |
|---|---|---|
| CMS portal | Done | ✅ Done — see `docs/cms-overhaul-plan.md`, Phases 1-3 implemented |
| RAG Pipeline | Done | ✅ Done — see `docs/langchain-rag-implementation-plan-2026-06-28.md`, implemented and wired into `test_generation_service.py` |
| Registration portal for users | Not started | ✅ Done — see `docs/superpowers/plans/2026-07-29-admin-signup-approval-plan.md`, all 8 tasks committed. **Board is stale, update it.** |
| Personal email invitation | Not started | ✅ Done — `backend/app/api/v1/invitations.py`, `backend/app/services/invitation_service.py`, Resend/SMTP email, bulk invite UI. **Board is stale, update it.** |
| Full report generation of a JD | Not started | ✅ Done (2026-08-05) — downloadable DOCX JD-level report added; see below |
| Ngrok Removal | Not started | ✅ Done (2026-08-05) — code removed earlier; doc references cleaned up |
| Theme inversion / dark theme | Not started | 🟡 In progress (2026-08-05) — infra + admin shell v1 shipped; broader surfaces follow |
| TrashCan | Not started | ✅ Done (2026-08-05) — soft-delete + restore for JDs, tests, candidates, blog |
| "How it works" video/gif | Not started | ✅ Done (2026-08-05) — CMS-driven video/gif embed with static fallback |

Action item outside code: update the board — items 4 and 5 should move to Done.

---

## 1. Full report generation of a JD (finish the partial work)

> **✅ Shipped 2026-08-05.** Downloadable DOCX JD-level report:
> `build_jd_report_docx()` in `export_service.py` (aggregate analytics +
> ranked candidate roster), `GET /api/v1/evaluation/system-report/{jd_id}/export`
> (admin-only), and a "Download report" button on the System Report page.
> Format decided as DOCX to match the existing per-candidate export.

**Current state:** `backend/app/services/export_service.py` (`build_docx`) already generates a per-candidate evaluation DOCX, exposed via `GET /api/v1/evaluation/{attempt_id}/export` (`backend/app/api/v1/evaluation.py:475`). `backend/app/api/v1/exam_reports.py` covers per-attempt reports and candidate listings. What's missing is a **JD-level aggregate report** — one export summarizing every candidate who took a given JD's test (scores, ranking, pass/fail counts), not just one candidate at a time. `frontend/src/app/(admin)/dashboard/results/jd/[jdId]/page.tsx` currently only renders a live candidate table with no export action.

**Scope decision needed:** confirm with the user what "full report" means — likely a downloadable PDF/DOCX with: JD summary, candidate roster with scores, ranking, and maybe pass/fail cutoff stats. Decide format (DOCX to match existing exports, or PDF) before starting.

**Proposed approach:**
- Add a new service function (e.g. `build_jd_report_docx(jd_id)`) reusing `export_service.py`'s existing DOCX-building helpers, iterating all attempts for the JD instead of one.
- New endpoint: `GET /api/v1/jds/{jd_id}/report` (or under `exam_reports.py`, matching existing routing conventions) returning the file.
- Add an export button to `frontend/src/app/(admin)/dashboard/results/jd/[jdId]/page.tsx` that hits the new endpoint.
- Follow the existing per-candidate export's auth/role checks exactly (same admin-only gate).

**Task checklist:**
- [ ] Confirm report format/content with stakeholder
- [ ] Backend: aggregate report builder in `export_service.py`
- [ ] Backend: new `GET` endpoint, admin-only
- [ ] Frontend: export button + download flow on the JD results page
- [ ] Playwright test for the endpoint's auth gate (401/403 paths, same real-login pattern as the signup plan)
- [ ] Manual verification: generate a report for a JD with multiple candidates

---

## 2. Ngrok Removal

**Current state:** ngrok is still live in these locations (found by repo-wide grep):
- `deploy-ngrok.sh` — dedicated deploy script, likely the main thing to delete
- `frontend/.env.local.example` — ngrok env var example
- `frontend/src/app/api/candidate/[...path]/route.ts` — proxy route referencing ngrok
- `vercel-proxy/vercel.json` — proxy config
- `docs/deployment.md`, `docs/feature-checklist.md`, `docs/future-improvements.md`, `docs/talvyn-rebrand-checklist.md`, `docs/changelog/production-public-url-fix.md`
- `docs/enterprise/{02-system-architecture,03-codebase-analysis,09-devops-documentation,11-security-audit,12-maintenance-and-onboarding,_facts}.md`

**Scope decision needed:** what replaces ngrok for local/preview access? If there's already a real public URL (Vercel deploy, custom domain) in production and ngrok was only ever a dev-tunnel workaround, this is a straightforward deletion. Confirm nothing in production still depends on the ngrok tunnel before removing `deploy-ngrok.sh` and the proxy route.

**Task checklist:**
- [x] Confirm production no longer needs ngrok — done; the code-level ngrok pieces were removed in commit `7e36811` ("removed the ngrok config").
- [x] Delete `deploy-ngrok.sh` — already gone from the repo.
- [x] Remove ngrok branching from `frontend/src/app/api/candidate/[...path]/route.ts` — no ngrok references remain in any `.ts/.tsx/.py/.sh/.json`.
- [x] Clean `vercel-proxy/vercel.json` — the `vercel-proxy/` directory is no longer present.
- [x] Remove ngrok var from `frontend/.env.local.example` — no ngrok env vars remain.
- [x] Update the docs to drop current-state ngrok mentions (2026-08-05): `feature-checklist.md`, `future-improvements.md`, `enterprise/09-devops-documentation.md`, `talvyn-rebrand-checklist.md`. Dated audit snapshots and `docs/changelog/*` are left as historical record.
- [x] Grep confirmed: remaining `ngrok` hits are only in changelogs, dated audit docs (marked historical), and this plan.

---

## 3. Theme inversion (dark theme)

> **🟡 v1 shipped 2026-08-05 (infra + admin shell).** Added `next-themes`
> (`ThemeProvider`, opt-in — defaultTheme light, system detection off so the
> unconverted public site / candidate exam are never auto-darkened), a
> `ThemeToggle` in the admin header, dark variants on the admin shell chrome
> and shared `.card`/badge utilities, and a **scoped compatibility layer**
> (`.dark .admin-shell-root …` in `globals.css`) that remaps the common
> neutral utilities so the whole admin area darkens coherently without a
> per-component rewrite. **Follow-up:** convert individual admin surfaces to
> real `dark:` classes and retire the compatibility remaps; extend dark mode
> to the public site + candidate exam. The ambiguous "new line creation from
> customised" sub-clause is still unclarified and was not attempted.

**Current state:** `frontend/tailwind.config.ts:4` already sets `darkMode: "class"`, but that's the only dark-mode scaffolding present — zero `dark:` Tailwind classes exist anywhere in `frontend/src`, no `next-themes` dependency, no `ThemeProvider`, no `useTheme` hook, no toggle UI. This is a full feature, not a finish-up.

**Scope decision needed:** "theme inversion... and new line creation from customised" is ambiguous — clarify with the user what "new line creation from customised" means (possibly a separate, unrelated UI request bundled into the same board item — e.g. a rich-text editor line-break behavior). Treat dark theme and that second clause as two separate asks; don't guess at the second one.

**Proposed approach (dark theme only):**
- Add `next-themes` (small, standard, avoids hand-rolling FOUC-safe theme persistence).
- Wrap the root layout in a `ThemeProvider`.
- Add a theme toggle to the admin shell / sidebar and the public site header.
- This touches every styled component eventually, so scope v1 to the highest-traffic surfaces first (dashboard shell, landing page) rather than a single big-bang pass over every component — confirm rollout scope with the user before starting, since a full app-wide dark theme is a large diff.

**Task checklist:**
- [ ] Clarify "new line creation from customised" with the user — separate task or same?
- [ ] Add `next-themes`, wrap root layout
- [ ] Add toggle UI (sidebar + public header)
- [ ] Pick and scope the first surfaces to convert (don't boil the ocean)
- [ ] Convert scoped surfaces with `dark:` classes, verify contrast/accessibility
- [ ] Manual verification in both themes, including the theme toggle persisting across reload

---

## 4. TrashCan

> **✅ Shipped 2026-08-05 (all four entities).** `deleted_at` added to
> `job_descriptions`, `tests`, `candidates` (migration `d5a8c3f2e7b9`); blog
> reuses its existing `archived_at`. Deletes are now soft; primary
> list/detail queries filter trashed rows; per-entity restore/purge live in
> each service. Unified `GET/POST/DELETE /api/v1/trash` (SUPER_ADMIN-gated),
> a Dashboard → Trash UI with restore + permanent-delete, and a "Move to
> Trash" action on the candidate profile. Covered by `tests/test_trash.py`
> (full suite: 404 passed). Retention is manual purge (no scheduler), matching
> repo conventions. **Note:** historical evaluation/leaderboard analytics
> still reference a trashed parent's past results by design (results are
> retained); only the primary browse/detail surfaces hide trashed rows.

**Current state:** no soft-delete pattern exists anywhere — no `deletedAt`/`isDeleted` column on any Prisma or SQLAlchemy model. The `Trash2` icon already used in `frontend/src/components/admin/JdListRow.tsx` and `TestsGridWithBulkActions.tsx` is just a delete-button icon for hard deletes, not a recycle bin.

**Scope decision needed:** which entities need trash/restore — JDs, tests, candidates, all of them? Confirm retention window (how long before permanent purge) and whether purge is manual (matches this repo's existing "no scheduler infrastructure" constraint, per the HighGarden plan) or automatic.

**Proposed approach:**
- Add `deletedAt DateTime?` to the target model(s) instead of hard-deleting.
- Existing list queries need a `where: { deletedAt: null }` filter added.
- New "Trash" view listing soft-deleted rows with a Restore action.
- Manual purge action (admin-triggered), not a cron job — matches existing repo conventions (no scheduler infra).

**Task checklist:**
- [ ] Confirm scope: which entities get trash/restore
- [ ] Schema: add `deletedAt` to target model(s), migrate
- [ ] Update existing delete actions to soft-delete instead of hard-delete
- [ ] Update existing list queries to exclude soft-deleted rows
- [ ] New Trash UI: list + restore action
- [ ] Manual purge action (admin-only), permanently deletes rows past retention window
- [ ] Playwright test for restore flow
- [ ] Manual verification: delete → appears in trash → restore → reappears in normal list

---

## 5. "How it works" video/gif

> **✅ Shipped 2026-08-05 (embed + fallback).** The `howItWorks` CMS content
> shape gained an optional `media` field (video | image, src, poster,
> caption); `HowItWorksSection.tsx` renders a responsive video/gif above the
> step grid, and the CMS admin editor exposes the fields. Backwards-compatible
> — when no media URL is set, the existing 4-step grid renders alone.
> **Content task (outside code):** produce and upload the actual walkthrough
> asset, then set its URL in CMS → Homepage → How It Works.

**Current state:** `frontend/src/components/landing/HowItWorksSection.tsx` renders a static 4-card grid (icon + title + text per step), content sourced from CMS (`content.steps`). No video or gif embed exists.

**Scope decision needed:** does the narrated video/gif need to be produced (requires screen recording + narration/editing — outside code scope, a content task) before it can be embedded? Confirm whether this task is "build the embed" (code) or "produce + embed" (content + code). If the asset doesn't exist yet, this is blocked on content production, not implementation.

**Proposed approach (once the asset exists):**
- Host the video/gif as a static asset (or CMS media asset, reusing `CmsMediaAsset` from the CMS portal work) rather than a new upload mechanism.
- Add a video/gif embed to `HowItWorksSection.tsx`, likely replacing or supplementing the 4-card grid.
- If sourced from CMS, extend the CMS content model for the landing page to reference a media asset field.

**Task checklist:**
- [ ] Confirm: is the video/gif asset already produced, or does this block on content creation first?
- [ ] Decide hosting: static asset vs. CMS media asset
- [ ] Extend `HowItWorksSection.tsx` (or CMS content shape) to support a video/gif embed
- [ ] Manual verification: renders correctly, doesn't break existing static fallback if no asset is set
