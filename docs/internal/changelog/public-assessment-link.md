# Public Assessment Link — Feature + Infra Bug Fixes

**Date:** 2026-06-19
**Branch:** main
**Status:** ✅ Done

---

## Feature

Admins can now create one shareable public link per JD instead of inviting
every candidate individually. Anyone with the link can self-register; each
registration mints its own private, single-use invitation — the public link
never doubles as a candidate's token.

```
backend/app/db/models/public_link.py            — PublicAssessmentLink model
backend/app/db/models/enums.py                   — PublicLinkStatus (ACTIVE/DISABLED/EXPIRED)
backend/app/schemas/public_link.py               — request/response schemas
backend/app/services/public_link_service.py      — create/list/update/resolve/register
backend/app/api/v1/public_links.py               — router, mounted at /api/v1/public-links
backend/app/core/security.py                     — build_public_link(slug) helper
backend/alembic/versions/b4c6f0a1d8e2_...py       — new table + invitations.public_link_id
                                                     + candidates.linkedin_url/resume_url
frontend/src/app/apply/[slug]/page.tsx           — public registration page (server)
frontend/src/app/apply/[slug]/RegisterForm.tsx   — registration form (client)
frontend/src/app/api/public/[...path]/route.ts   — narrow public proxy (resolve/register only)
frontend/src/components/admin/PublicLinkSection.tsx — admin create/copy/disable UI
```

**Design rule:** the public `/apply/<slug>` link identifies the assessment
only. It is stored as plaintext (`public_slug`), unlike `Invitation.token_hash`,
because it isn't a secret — it's meant to be posted publicly. Each candidate
who registers gets a brand-new `Invitation` with its own HMAC-hashed token,
created via the exact same `_upsert_candidate()` / `generate_token()` /
`hash_token()` helpers the manual invite flow already used, and is redirected
to `/tests/<unique-token>` — the same private flow every other invitation
uses.

**Duplicate-registration handling**, in `register_via_public_link()`:

- Already completed every approved test for the JD → `status: "already_completed"`, no token issued.
- Still-usable (`PENDING`/`OPENED`) invitation already exists for that email → token is *rotated* (same mechanism as `resend_invitation`) and reused — the original raw token can't be recovered since only its hash is stored, so a fresh one is minted instead of trying to resurface the old link.
- Only `EXPIRED`/`REVOKED` invitations (or none at all) → a brand-new invitation is created, and the link's `registration_count` is incremented atomically (`UPDATE ... WHERE max_registrations IS NULL OR registration_count < max_registrations`, checked via `rowcount`) so a burst of concurrent submissions can't all squeeze past a registration cap.

18 new backend tests cover all of the above plus disabled/expired/no-approved-tests blocking — see `backend/tests/test_public_links.py`. All 231 backend tests pass.

---

## Bug 1 — Alembic's async migration runner never committed on a fresh database

While verifying the feature against a real (not SQLite-test) Postgres, `alembic upgrade head` logged every revision and exited 0, but a genuinely fresh database was left with **zero tables** and no `alembic_version` row — as if nothing had run. Every endpoint that touched the database, including the pre-existing "list invitations" call, failed with `UndefinedTableError`.

Confirmed by direct comparison inside the running container: a raw `asyncpg` call with an explicit `await conn.commit()` persisted instantly and was visible from a separate `psql` session; going through `alembic/env.py`'s existing `run_async_migrations()` → `do_run_migrations()` path did not, even though it printed a clean "Running upgrade ... → Migrations complete" log for every revision.

**Root cause** (`backend/alembic/env.py`):

```python
async def run_async_migrations() -> None:
    engine = create_async_engine(_get_url(), poolclass=pool.NullPool)
    async with engine.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await engine.dispose()
```

`do_run_migrations()` commits through the sync-proxy `Connection` that Alembic's own `context.begin_transaction()` opens internally — but that commit doesn't propagate to the DBAPI transaction the *outer* `AsyncConnection` is tracking. `async with engine.connect()` exiting without an explicit `await connection.commit()` issues an implicit `ROLLBACK`, silently discarding every DDL statement just applied.

**Fix:**

```python
async with engine.connect() as connection:
    await connection.run_sync(do_run_migrations)
    await connection.commit()
await engine.dispose()
```

**Why this had gone unnoticed:** `app/main.py` removed its `create_all`/`ALTER TABLE` startup fallback a while back (see `future-improvements.md` § P4-4) in favor of trusting Alembic exclusively. Every *existing* deployment's database already had schema from before that change, so subsequent migrations were only ever adding columns/indexes with `IF NOT EXISTS` guards — if those silently rolled back, nothing observable broke, because the columns "already existed" from the original `create_all` run. This bug only bites a database that has genuinely never been migrated: a new environment, a fresh volume, or CI's "Backend migrations (alembic upgrade head, fresh Postgres)" job — which had likely been passing without ever actually proving anything.

**Files changed:** `backend/alembic/env.py`

---

## Bug 2 — Public registration form posted to the wrong proxy path

The candidate-facing `/apply/<slug>` page resolved correctly (showed the right JD title and test list), but submitting the registration form always failed with "This assessment link doesn't exist" — even seconds after the same slug had just resolved successfully.

**Root cause** (`frontend/src/app/apply/[slug]/RegisterForm.tsx`): the form fetched

```
/api/public/v1/public-links/<slug>/register
```

but `frontend/src/app/api/public/[...path]/route.ts`'s `[...path]` catch-all forwards everything after `/api/public/` *verbatim* as the upstream FastAPI path — it has to include the literal `api/v1` segment, the same way the existing candidate proxy is called as `/api/candidate/api/v1/attempts/start` in `lib/api/attempts.ts`, not `/api/candidate/v1/attempts/start`. Without it, `isAllowedPublicLinkPath()` never matched, and the proxy returned its own generic `{"code":"NOT_FOUND","message":"Not found."}` — before the request ever reached the backend. The frontend's error handling mapped that 404 straight to "this link doesn't exist," masking that the bug was in the proxy call, not the link.

**Fix:** the form now fetches `/api/public/api/v1/public-links/<slug>/register`, with a comment at the call site warning that the doubled `api/api` is intentional, not a typo.

**Verified directly against a running stack** — before the fix, the broken path returned the proxy's own generic body; after, it returned the real backend response (`"PublicAssessmentLink with id '...' not found"` for a nonexistent slug).

**Files changed:** `frontend/src/app/apply/[slug]/RegisterForm.tsx`

---

## Minor — ruff E741 in the new router

`ruff check app/` failed CI on `app/api/v1/public_links.py` for using the single-letter loop variable `l` (ambiguous with `1`/`I`) in the links-list comprehension. Renamed to `link`.

---

## Files Changed Summary

```
backend/app/db/models/enums.py                          — PublicLinkStatus
backend/app/db/models/public_link.py                     — PublicAssessmentLink (new)
backend/app/db/models/candidate.py                       — Invitation.public_link_id,
                                                             Candidate.linkedin_url/resume_url
backend/app/db/models/__init__.py                        — register new model/enum
backend/app/core/security.py                             — build_public_link()
backend/app/schemas/public_link.py                       — new
backend/app/services/public_link_service.py              — new
backend/app/services/invitation_service.py                — _upsert_candidate() accepts
                                                             optional phone/linkedin/resume
backend/app/api/v1/public_links.py                       — new router
backend/app/api/v1/router.py                             — mount public_links.router
backend/alembic/versions/b4c6f0a1d8e2_...py               — new migration
backend/alembic/env.py                                    — commit fix (Bug 1)
backend/tests/test_public_links.py                       — 18 new tests

frontend/src/types/public_link.ts                        — new
frontend/src/lib/api/publicLinks.ts                       — admin API client
frontend/src/app/api/public/[...path]/route.ts            — new public proxy
frontend/src/middleware.ts                                — allow /apply, /api/public
frontend/src/app/apply/layout.tsx                         — re-export candidate layout
frontend/src/app/apply/[slug]/page.tsx                    — registration page (server)
frontend/src/app/apply/[slug]/RegisterForm.tsx             — registration form + path fix (Bug 2)
frontend/src/components/admin/PublicLinkSection.tsx       — admin UI
frontend/src/app/(admin)/dashboard/jds/[id]/candidates/page.tsx — embeds PublicLinkSection
```
