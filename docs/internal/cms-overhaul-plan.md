# CMS Overhaul Plan

Status: **Phases 1–3 implemented on this branch** (Phase 4 remains optional
follow-up work). See the commit history for the per-phase changes.

This plan addresses three reported problems and upgrades the CMS toward a
WordPress-style experience:

1. Publishing in the CMS panel does not change the homepage.
2. Version history is unbounded — every publish grows the page and the list.
3. There is no blog section at all.

---

## Diagnosis

### 1. Homepage never reflects CMS updates (root cause found)

- `frontend/src/app/page.tsx` renders the landing page from
  `getPublicCmsContent()` (`frontend/src/lib/cms/publicContent.ts`), which
  fetches `GET /api/v1/cms/public/content` with `cache: "no-store"`.
- The project runs **Next.js 16.2.10**. Since Next 15, a `no-store` fetch by
  itself no longer opts a route into dynamic rendering — a page without a
  Dynamic API is **statically prerendered at build time**.
- Every admin dashboard page declares `export const revalidate = 0` (or
  `force-dynamic`), but the homepage declares nothing.
- During `next build` inside `frontend/Dockerfile.prod`, the backend is not
  reachable and `NODE_ENV=production` makes `requireServerEnv` throw; the
  `try/catch` in `getPublicCmsContent()` silently returns
  `defaultPublicCmsContent`.
- **Result:** the homepage is baked as static HTML with hard-coded default
  content. Publishing in the CMS updates the database, but the page is never
  re-rendered. `generateMetadata` on the same page is affected identically.

Secondary issue: the silent `catch` hides misconfiguration — when the CMS
fetch fails at runtime there is no log line at all.

### 2. Version history UX / payload growth

- `GET /api/v1/cms/documents/{key}/versions` returns **all** versions,
  each including the full `content_json` (the entire page document, tens of
  KB each). No pagination, no metadata-only mode.
- `CmsClient.tsx` renders the entire list in the sidebar — after 30 publishes
  that is 30 rows and a multi-MB API payload.
- `publish_document` creates a new version on every publish, even when the
  draft is byte-identical to the currently published content.

### 3. No blog

- No blog models, endpoints, or pages exist in backend or frontend.
- The CMS is a fixed-document system (`site`, `home`, `candidate_experience`,
  `invitation_email`) and cannot hold a growing collection of posts.

---

## Phase 1 — Make published content actually go live (small, high priority)

**Backend:** no changes.

**Frontend:**

- `src/app/page.tsx`: add `export const dynamic = "force-dynamic"` so the
  homepage is rendered per request from the live database, matching the
  pattern already used across the dashboard. The CMS fetch is an in-network
  call to FastAPI, so per-request rendering is cheap; nginx already has
  `proxy_cache off`.
- `src/lib/cms/publicContent.ts`: log a warning (once per failure) when the
  CMS fetch fails and defaults are served, instead of a silent catch.
- Audit the other CMS-consuming public routes (`/apply/[slug]`,
  `/test/[token]`, `/exam/[token]`) — these have dynamic segments and are
  already request-rendered, but verify with `next build` output.

**Acceptance:** publish a change in the CMS panel → refresh homepage →
change is visible with no rebuild/redeploy.

---

## Phase 2 — Version history: bounded, readable, WordPress-style

**Backend (`app/api/v1/cms.py`, `app/services/cms_service.py`, schemas):**

- Version list becomes **paginated and lightweight**:
  `GET /documents/{key}/versions?limit=10&offset=0` returns
  `{items, total}` where items contain metadata only (version number,
  created_at, created_by + resolved user name, is_current flag) — **no
  `content_json`**.
- New endpoint `GET /documents/{key}/versions/{version}` returns one full
  version (used for preview/restore).
- `publish_document` becomes a **no-op version-wise when nothing changed**:
  if `draft_json == published_json` and a version already exists, republish
  without creating a duplicate version row.

**Frontend (`CmsClient.tsx` — version panel):**

- Collapsible "Version history" card showing the **latest 5** versions with
  relative timestamps ("2 hours ago"), publisher name, and a "Live" badge on
  the current version.
- "Show more" loads the next page (server-side pagination) instead of
  rendering everything.
- Restore gets a confirmation step that explains the flow ("Restores this
  version to your draft — click Publish to make it live").

**Acceptance:** panel payload stays small regardless of publish count; list
shows 5 rows by default; restoring is confirm-guarded; publishing identical
content doesn't mint a new version.

---

## Phase 3 — Blog system (the WordPress-style addition)

### Backend

- **New table** `cms_blog_posts` (Alembic migration):
  `id, slug (unique), title, excerpt, content_md (markdown), cover_image_asset_id
  (FK → cms_media_assets, nullable), tags (JSON list), status
  (draft|published|archived), author_id (FK → users), seo_title,
  seo_description, created_at, updated_at, published_at`.
- **Admin endpoints** (superadmin, `/api/v1/cms/blog`):
  - `GET /blog` — list with search, status filter, pagination
  - `POST /blog` — create (auto-slug from title, uniqueness enforced)
  - `GET /blog/{id}` / `PATCH /blog/{id}` — read/update
  - `POST /blog/{id}/publish` / `POST /blog/{id}/unpublish`
  - `DELETE /blog/{id}` — archive (soft delete)
- **Public endpoints** (no auth):
  - `GET /cms/public/blog?page=&tag=` — published posts, newest first
  - `GET /cms/public/blog/{slug}` — single published post
- Content is stored as **markdown** and rendered on the frontend with a
  sanitizing renderer (no raw HTML), consistent with the existing
  `<script` guard in `validate_content_json`.
- Audit-log entries for create/update/publish/archive, matching existing
  CMS actions.
- Backend tests for the service + endpoints, following existing test style.

### Frontend — admin panel restructure

- The CMS page gains top-level **tabs**: **Content** (existing 4 documents),
  **Blog** (new), **Media** (existing media library moves here). This also
  declutters the current single mega-page.
- **Blog manager**: posts table (title, status chip, author, updated date)
  with search + status filter; "New post" button.
- **Post editor**: title (auto-generates editable slug), excerpt, cover-image
  picker sourced from the media library, tag input, **markdown editor with
  live preview**, SEO title/description fields, Save Draft / Publish /
  Unpublish actions with the same draft-badge pattern used today.

### Frontend — public pages

- `/blog` — post list (cover image, title, excerpt, tags, date), paginated,
  `force-dynamic`.
- `/blog/[slug]` — article page with sanitized markdown rendering, proper
  `generateMetadata` (title/description/OpenGraph image from cover), 404 for
  unpublished/unknown slugs.
- Add a "Blog" link to the default nav/footer content (editable through the
  existing Site document like every other link).

**Acceptance:** create a draft post → not visible publicly; publish → appears
on `/blog` and `/blog/{slug}` immediately; unpublish → 404s again; cover
images come from the media library.

---

## Phase 4 — Optional polish (proposed, can defer)

- **Draft preview**: "Preview draft" button in the CMS panel that opens the
  homepage rendered from `draft_json` for superadmins only.
- **Autosave** of drafts (debounced) so work isn't lost before "Save Draft".
- Media library search + "used in" indicators.

---

## Delivery order & touchpoints

| Phase | Size | Main files |
| --- | --- | --- |
| 1. Homepage fix | XS | `frontend/src/app/page.tsx`, `frontend/src/lib/cms/publicContent.ts` |
| 2. Version history | S | `backend/app/services/cms_service.py`, `backend/app/api/v1/cms.py`, `backend/app/schemas/cms.py`, `frontend/src/components/admin/CmsClient.tsx`, `frontend/src/lib/api/cms.ts`, `frontend/src/types/cms.ts` |
| 3. Blog | L | new Alembic migration, `backend/app/db/models/cms.py`, new `blog` service/router/schemas, CMS panel tabs + blog editor components, `frontend/src/app/blog/**`, nav defaults |
| 4. Polish | M | CMS panel + homepage preview route |

Each phase is independently shippable and will be delivered as separate
commits on this branch, with backend tests + `next build` verification per
phase.
