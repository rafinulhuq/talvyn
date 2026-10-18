# Urgent Roadmap

Last reviewed: 2026-07-11. A living, prioritized list of what actually needs
doing — kept deliberately short. Detailed history lives in
`docs/future-improvements.md` and the audit reports; this file is the
"what's next" view. Update statuses here when items land.

## Tier 1 — Security & correctness (code)

| Item | Status | Notes |
| --- | --- | --- |
| A8-1 Stale test caches after admin edits | ✅ Done (pre-existing) | `invalidate_test_cache()` already called from every test mutation path in `test_service.py`. Backlog doc was stale. |
| A8-3 Default admin credentials | ✅ Done (pre-existing) | `prisma/seed.ts` generates a random per-deploy password unless `SEED_ADMIN_PASSWORD` is set; printed once, never stored. Optional extra hardening: require `SEED_ADMIN_EMAIL` in production so the default email isn't guessable. |
| A8-5 RBAC on maintenance endpoints | ✅ Done (2026-07-09) | `/admin/backup`, `/reset-data`, `/restore-data`, `/audit-log` now require SUPER_ADMIN (resolved from `X-Actor-Id` against the users table). Settings maintenance/audit tabs hidden for plain admins. Negative tests added. |
| A8-4 Exam token in URL path | ✅ Done (2026-07-11) | Full fix shipped: middleware redeems the emailed `/test(s)/<token>` / `/exam/<token>` URL into an httpOnly `ov_attempt_token` cookie and redirects to tokenless `/tests/session` / `/exam/session` routes; the `/api/candidate` proxy injects the token upstream (header + `/start` body), so client JS never sees it. Backend unchanged. Earlier mitigations (nginx access-log off, no-referrer/noindex/no-store on token paths) stay as defense in depth for the initial link hit. |

## Tier 2 — Owner actions (no code needed)

- [ ] **Run the JD corpus ingestion** — runbook in
  `docs/superpowers/specs/2026-07-05-bulk-jd-corpus-rag-ingestion-design.md`.
  Afterwards: spot-check `ocr_files.csv` quality and try
  `scripts/query_knowledge.py`.
- [ ] **Enable search indexing** — CMS → Site Content → SEO Metadata →
  turn on "Allow indexing" + "Allow following links" → Publish. Until then
  the blog is invisible to search engines. (Candidate exam pages stay
  noindexed regardless — that's enforced separately.)
- [ ] Change/confirm the super admin password if this deployment ever ran
  with a pre-hardening seed.

## Tier 3 — Next code batches (rough priority order)

1. ~~**A8-4 full fix**~~ — ✅ Done 2026-07-11 (see Tier 1 row).
2. ~~**Blog SEO plumbing**~~ — ✅ Done 2026-07-11: `sitemap.xml`, `robots.txt`
   (both driven by the CMS "Allow indexing" toggle), `/blog/feed.xml` RSS,
   and the blog pages now emit their own robots meta instead of inheriting
   the root layout's global noindex. Still gated on the Tier 2 owner action
   (flip "Allow indexing" on).
3. ~~**A8-2 Prisma/Alembic schema authority**~~ — ✅ Done 2026-08-05:
   decided **Alembic owns, Prisma is a read model** (documented in
   `docs/schema-authority.md`; policy header added to `schema.prisma`). Removed
   the vestigial, drifted `prisma/migrations/` dir and the `db:push`/`db:migrate`
   npm scripts. Added a non-blocking `schema-drift` CI job that builds the DB
   from Alembic and reports how the Prisma datamodel differs (`prisma migrate
   diff`). Reconciled the `deleted_at` drift my Trash work introduced; the
   remaining historical drift is what the new job now surfaces. **Ratchet:**
   flip `schema-drift` to blocking once the datamodel fully matches.
4. ~~**A8-6 Dependency/CVE gates**~~ — ✅ Done 2026-08-05: added a
   non-blocking `security-audit` CI job running `pip-audit` (backend
   requirements) and `npm audit --omit=dev --audit-level=high` (frontend).
   **Ratchet:** remove `continue-on-error` once the current findings are
   triaged.
5. **RAG Phase 5** — wire corpus retrieval into question generation
   (grounded generation with citations), behind a feature flag; blocked on
   the Tier 2 ingestion + quality spot-check.
6. **A8-11 Browser E2E** — one Playwright happy path: upload JD → generate →
   approve → invite → take exam → evaluate.
7. **A8-7 Frontend lint debt** — ~20 warnings, mostly `set-state-in-effect`;
   pay down opportunistically.
8. **A8-8/A8-9 hygiene** — docs/runtime port drift; decide whether generated
   `site/` output stays tracked in git.
9. **A8-10 WASM parser tests** — real Rust tests for `wasm-parser`.
10. **Deliberate dependency majors** — typescript 7, Prisma 7, eslint 10,
    redis-py 8, each as planned work with migration testing (Dependabot
    majors are now ignored by config after they broke CI on 2026-07-10).

## Standing invariants (check on every change)

- `alembic upgrade head` must stay single-headed — CI's fresh-Postgres
  migration job guards this; never merge two branches that each add a
  migration off the same parent without a merge revision.
- New public content surfaces must respect the CMS array-replace merge
  semantics (published arrays fully replace defaults — backfill via
  migration when adding default links/sections, as done for the blog).
