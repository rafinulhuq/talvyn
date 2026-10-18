# CMP Writer-First Redesign — Design

Date: 2026-07-07
Status: Phases 1-3 approved, pending implementation plan. Phase 4 not yet designed.
Relates to: `docs/cms-overhaul-plan.md` (the prior CMS→CMP overhaul this extends)

## Purpose

The CMP (Content Management Portal) is a superadmin-only publishing tool. A follow-up spec asked
for it to feel like Medium/Notion/Linear rather than an admin dashboard: no writer/editor roles
(already true), author bylines decoupled from the actual admin account, no standalone media
library, a sequential publish workflow, and a monochrome/spacious visual language across the whole
panel.

Investigation found much of the spec already shipped in the prior overhaul (superadmin-only auth,
autosave, drag/drop/paste inline image upload, tags/SEO/slug fields). The remaining gap is four
largely-independent pieces of work, decomposed into phases so each ships and reviews on its own:

1. **Author profiles** — decouple the byline from the creating account.
2. **Media library removal** — drop the standalone browsing tab; images become per-article.
3. **Publishing workflow + scheduling** — distraction-free canvas, a dedicated publish step,
   schedule-ahead publishing with no new job infra.
4. **Visual redesign** — monochrome, spacious language across the CMP shell, blog editor, and the
   Content tab's form editors.

Phases 1-3 are fully specced below. Phase 4 will get its own design pass later.

Build order: 1 → 2 → 3 (3 depends on 1 for the author picker and is simplified by 2's smaller
image UI); phase 4 is visual-only and doesn't block on the others.

---

## Phase 1 — Author profiles

### Problem

`CmsBlogPost.author_id` is a hard FK to the creating superadmin's user account. Every post is
bylined with whoever's logged in — there's no way to publish the same account's posts under
different names (e.g. a company byline vs. a named team member).

### Data model

New table `cms_author_profiles`, following the existing `CmsMediaAsset` soft-delete pattern:

```
id             GUID, primary key
name           String(255), required
avatar_asset_id GUID, FK -> cms_media_assets, nullable, ON DELETE SET NULL
archived_at    DateTime, nullable   -- soft delete
created_at     DateTime
updated_at     DateTime
```

No `bio` field and no uniqueness constraint on `name` — not requested, and skipping them avoids
validation nobody asked for.

`CmsBlogPost` gains one nullable column: `author_profile_id` (GUID, FK -> cms_author_profiles,
`ON DELETE SET NULL`). The existing `author_id` is untouched — it keeps meaning "the account that
created this post" for audit purposes, separate from the displayed byline.

### Fallback behavior

- `author_profile_id` set → byline shows that profile's name and avatar.
- `author_profile_id` null (every post published before this phase, and any new post where the
  author picker is left blank) → byline falls back to the creating account's name, exactly as
  today.

This means the migration needs no backfill: existing posts render identically the moment this
ships.

### API — `/api/v1/cms/authors` (superadmin only, mirrors existing CMS route conventions)

- `GET /authors` — list active (non-archived) profiles: `{id, name, avatar_url}`
- `POST /authors` — create `{name, avatar_asset_id?}`
- `PATCH /authors/{id}` — update either field
- `DELETE /authors/{id}` — soft delete (sets `archived_at`). Posts already referencing an archived
  profile keep resolving its name/avatar; it just disappears from the picker for new posts.

Blog post create/update requests (`BlogPostCreateRequest` / `BlogPostUpdateRequest`) gain an
optional `author_profile_id` field. `BlogPostResponse` / `BlogPostSummaryResponse` /
`PublicBlogPostSummary` gain `author_profile_id` (admin-facing only) and resolve `author_name` /
add `author_avatar_url` using the fallback above.

Avatar upload reuses the existing generic media upload endpoint (same one cover images use) — no
new upload path.

Audit log entries: `CMS_AUTHOR_CREATED`, `CMS_AUTHOR_UPDATED`, `CMS_AUTHOR_ARCHIVED`, matching the
existing `audit_log_service` calls used elsewhere in `cms_service.py` / `blog_service.py`.

### Frontend

No new top-level CMP tab or nav item — that would reintroduce the complexity phase 4's vision
argues against. Instead, the post editor's sidebar (`BlogManager.tsx`, next to Tags/SEO) gets an
"Author" section:

- A dropdown of active profiles, defaulting to blank (= creator's account name).
- "+ New author" opens an inline mini-form (name + optional avatar upload) and immediately selects
  the new profile once saved — no separate management screen to navigate to.
- No delete/edit UI in this phase's scope for existing profiles from the picker itself; archiving
  a profile is an API capability but doesn't need a dedicated UI surface yet since profiles are
  expected to be few and rarely renamed. *(Flagged as a possible phase-4-or-later addition if it
  turns out to matter in practice.)*

### Testing

One backend test module (`test_cms_authors.py` or additions to `test_cms.py`) covering:
create/update/archive a profile; a post published with a profile displays that profile's name;
a post with no profile falls back to the creator's account name; an archived profile still
resolves correctly on posts that reference it but is excluded from `GET /authors`.

---

## Phase 2 — Media library removal

### Problem

The CMP has a standalone "Media Library" tab (browse/upload/copy-URL/archive, independent of any
post) that the spec explicitly asks to remove — each article should manage its own images.

### Frontend

`CmsClient.tsx`: drop the `"media"` tab entirely — the `CmsTab` type entry, its nav item, the whole
`activeTab === "media"` render block, and the `media` / `mediaTitle` / `mediaAlt` state plus
`uploadMedia` / `copyMediaUrl` / `archiveMedia` handlers. `loadCms()` stops calling
`cmpApi.listMedia()`; `BlogManager` stops receiving a `media` prop.

`BlogManager.tsx` / `RichBlogEditor.tsx`: `imageAssets` becomes just the current session's
`sessionMedia` (already tracked per-editor-instance) instead of merging in the global asset list.
Cover image swaps its dropdown-of-everything `<select>` for a direct upload control (reusing the
existing `uploadEditorImage` → `cmpApi.uploadMedia` call already used for inline images).
`RichBlogEditor`'s "Insert image from media library" grid-picker button is removed; drag-drop,
paste, and "Upload image" (which already upload-and-insert in one step) are unchanged.

`ponytail:` re-inserting an image already uploaded earlier in the same session now means
re-uploading a duplicate rather than picking it from a grid — not worth keeping picker UI just to
dedupe within one article; revisit only if that turns out to bother people.

### Backend

Delete (nothing will call them once the frontend above ships): `GET /media` (list),
`PATCH /media/{id}` (update), `POST /media/{id}/archive`, and the corresponding
`cms_service.list_media_assets` / `update_media_asset` / `archive_media_asset` functions, plus the
matching `cmpApi` client methods (`listMedia` / `updateMedia` / `archiveMedia` — confirmed unused
elsewhere). **Kept**: `POST /media` (upload) and `GET /media/{id}/content` (byte-serving) — both
still load-bearing for cover/inline images.

### Accepted tradeoff

Today, "archive" is the only way an uploaded image ever stops being served. Removing it means
uploaded images (including replaced cover images) persist in storage indefinitely with no cleanup
path — this already existed partially, since swapping a cover image never archived the old one.
`ponytail:` no garbage collection for orphaned assets — revisit if storage cost becomes a real
problem, not before.

### Testing

Trim `test_cms.py::TestCmsMedia::test_media_upload_serves_archive_and_backup` to just upload +
content-serve (+ the existing backup-snapshot assertion), dropping the list/archive/hidden-content
assertions for the endpoints being removed.

---

## Phase 3 — Publishing workflow + scheduling

### Problem

Cover image, tags, SEO, and slug are all permanently visible in a sidebar next to the writing
canvas — not the "write first, configure at the end" flow the spec describes. There's also no way
to schedule a post for future publication; `publish_post` always sets `published_at` to now.

### Scope decision

Tags only — no separate Categories field (see clarifying question; a second taxonomy alongside
Tags isn't worth it for a single-author blog).

### Writing canvas vs. publish details

The always-visible sidebar (`BlogManager.tsx`, cover/tags/SEO/slug/delete) is replaced with a
publish panel that opens when the user clicks **Publish** in the header (already the primary CTA).
The writing canvas keeps only what's about the words: Title, Excerpt (subtitle-style, shown under
the title), and the rich-text Content editor. Slug moves into the publish panel alongside Cover
image, Author (from phase 1), Tags, SEO title, SEO description, and the schedule control. "Save
draft" stays available directly from the header without ever opening the panel — drafting needs
none of those fields. The existing Preview toggle is unchanged.

The publish panel's confirm action is either **Publish now** or **Schedule for…** (date/time
picker). If already published or scheduled, reopening the panel shows the current state and lets
the user change the schedule or unpublish.

### Scheduling — reuses `published_at`, no new infra

No new `status` value and no cron/job. `publish_post` gains an optional target datetime parameter:

- **Publish now** (default): unchanged — `published_at = now()` if unset.
- **Schedule for `<future datetime>`**: `status` still becomes `"published"`, but `published_at` is
  set to that future timestamp. The post is "scheduled" purely by virtue of `published_at` being in
  the future — no separate state to keep in sync.

Public-facing queries (`list_published_posts`, `get_published_post`) gain
`CmsBlogPost.published_at <= now()` alongside the existing `status == "published"` filter. This is
backward compatible — every post published today already has a past `published_at`, so existing
posts are unaffected; only future-dated ones stay hidden until their time arrives, checked lazily
on each request.

### Admin display

A post is shown as **Scheduled** (not "Published") whenever `status == "published" and
published_at > now` — computed client-side from the same two fields, both in the post list and the
editor header's status pill. No new filter tab is added to the Draft/All/Published list filter;
"Published" continues to include scheduled-but-not-yet-live posts (their underlying `status` is
still `"published"`), just visually distinguished per-row.

### Testing

Extend `blog_service` tests: publishing with a future datetime keeps the post out of
`list_published_posts` / `get_published_post` until that time passes; publishing with no datetime
(or a past one) behaves exactly as today; the public query filter doesn't regress
already-published posts.

---

## Phase 4

Not yet designed — visual redesign (monochrome, spacious language) across the CMP shell, blog
editor, and Content tab form editors. Will get its own design pass via the same brainstorming
process before implementation.
