# Plan: ATS Checker + signup approval email

> **Status:** Implemented (2026-08-29). Both items shipped on
> `claude/ats-checker-approval-email-mdwwv3`.

Two requests were bundled here:

1. Add an ATS checker for resumes/CVs.
2. Email a signup requester when their account is approved.

Investigation showed these were at very different starting points, so the
work split unevenly.

## Item 2 — approval email: already built

The full chain existed before this branch and is unchanged in shape:

| Step | Location |
|---|---|
| Super Admin approves/rejects | `frontend/src/app/api/admin/users/[id]/signup-status/route.ts` |
| Best-effort notification helper | `frontend/src/lib/signupNotifications.ts` `notifySignupDecision()` |
| Renders + sends the email | `backend/app/api/v1/internal_emails.py` `POST /api/v1/internal/emails/signup-decision` |
| Transport (SMTP or Resend) | `backend/app/services/email_service.py` `send_html_email()` |

Shipped in `8b3f802 feat(email): signup/access-request notifications`. The
APPROVED branch renders a "Sign in" CTA pointing at
`{MAGIC_LINK_BASE_URL}/login`; the REJECTED branch deliberately omits it.

Three gaps were found and closed rather than rebuilding anything:

- **Duplicate sends.** The PATCH route wrote the status and notified
  unconditionally, so re-approving an already-approved user (double-click,
  stale tab, retry) sent a second "you're approved" email for a decision that
  had already been announced. Now guarded on a real status transition.
- **No test coverage.** Neither internal-emails endpoint had a single test.
  `backend/tests/test_internal_emails.py` adds 12, covering both decision
  branches, delivery-failure reporting, validation, the internal-token guard,
  and HTML-escaping of the attacker-controlled `to_name` / `company_name`
  fields (both come from the public signup form).
- **Undocumented configuration.** `.env.example` named neither
  `RESEND_API_KEY` nor `SMTP_HOST`/`EMAIL_FROM`, so on a fresh clone every
  transactional email — the approval notice included — was skipped with only a
  backend log warning. Both delivery paths are now documented there, along
  with `MAGIC_LINK_BASE_URL`, which is what makes the email's sign-in link
  resolve.

## Item 1 — ATS Checker: new

### Why deterministic, not an LLM call

An applicant tracking system is a parser, not a judge. It either finds an
email address in the header or it doesn't; it either recognises "Work
Experience" as a heading or it doesn't. Scoring that with a model would make
the result drift between runs on identical input, add an Ollama dependency to
a check that should work offline, and make the rules effectively untestable.

`ats_service.check_resume()` is therefore a pure function — no I/O, no
randomness, no DB. There is a test asserting exactly that.

This also means no ARQ job, no Redis job store, and no polling endpoint,
unlike the AI Checker it otherwise mirrors. The report returns on the request
that asked for it.

### No migration

A run is analyzed in memory and discarded, exactly like the AI Checker. That
keeps Alembic and the Prisma read-model (see `docs/internal/schema-authority.md`)
untouched. Persisting reports against a candidate is a natural follow-up, and
would need a real migration at that point.

### Scoring model

Six weighted categories summing to 100:

| Category | Weight | What it measures |
|---|---:|---|
| Parseability | 25 | OCR-only text, word count, symbol noise, multi-column fragmentation, replacement characters |
| Contact details | 15 | Email (6), phone (4), location (2), professional profile link (3) |
| Section structure | 20 | Experience / Education / Skills as real headings (15), plus Summary / Projects / Certifications (5) |
| Content quality | 20 | Quantified bullets (7), action-verb openers (6), parseable date ranges (5), bullet length (2) |
| Formatting | 10 | Tables and column layout, symbol-font bullets, all-caps, legacy file formats, repeated page furniture |
| Keyword match | 10 | Coverage of the JD's extracted skills |

Parseability carries the most weight because a resume the parser can't read
scores zero on every other axis in the real system, however good its content.

Two design points worth keeping:

- **Normalisation.** Without a JD the keyword category reports `max_score: 0`
  and the overall score is normalised over the categories that applied — a
  resume is never punished for a comparison the caller didn't ask for, and can
  still reach 100.
- **Heading vs. inline.** A section counts as *detected* only when its name
  appears as a standalone short line, mirroring how parsers segment a resume.
  A name that appears only inline scores half credit and gets a distinct
  finding ("you mention Skills but never as a heading") rather than being
  reported as missing.

### JD keyword matching

Reuses the existing `JdExtractedData` rather than introducing a second notion
of "the skills for this role": `must_have_skills` at 70% of the category
weight, `nice_to_have_skills` + `tools_technologies` at 30%. A resume that
covers every nice-to-have but no hard requirement should not look like a
match.

The JD lookup is owner-scoped through `CurrentActor` + `owner_scope_for()`
like every other JD route, so a USER passing another operator's `jd_id` gets a
404 rather than a keyword report — otherwise this endpoint would leak the
existence and extracted skills of every JD in the workspace. There is a test
for that specifically.

Keyword matching is literal and word-boundary-aware, with the boundaries
applied only where the edge character is a word character — `C++`, `Node.js`
and `.NET` all break a naive `\b...\b` pattern, while `Go` must still not
match inside `Google`.

### Files

**Backend**

- `app/schemas/ats.py` — request/response models
- `app/services/ats_service.py` — the scoring engine
- `app/api/v1/ats.py` — `POST /ats/check`, `POST /ats/extract`
- `app/api/v1/router.py` — mounts the router (only edit to an existing backend file)
- `tests/test_ats.py` — 34 tests

`/ats/extract` enables OCR, unlike the AI Checker's equivalent: a scanned
resume is exactly the case the report most needs to describe, and saying "this
has no text layer" requires getting far enough to know that. The extraction
method comes back in the response and the client passes it to `/check`, which
turns `ocr` into a critical finding.

**Frontend**

- `src/types/ats.ts`, `src/lib/api/ats.ts`
- `src/app/api/ats/extract/route.ts` — multipart passthrough (the generic
  `/api/proxy` is sized for small JSON bodies and reads bodies as text)
- `src/app/(admin)/dashboard/ats-checker/page.tsx`
- `src/components/admin/AtsCheckerClient.tsx` — drag-drop with WASM-then-server
  extraction, JD selector, score gauge, per-category bars, findings list
- `src/components/admin/Sidebar.tsx` — nav entry under "AI & Insights"

Visible to any signed-in operator, matching the AI Checker's placement in the
role matrix (`docs/internal/superpowers/plans/2026-08-05-user-role-plan.md`).

## Verification

- `pytest` — 484 passed, 1 skipped, up from a 438-passed baseline: 46 new tests
  (34 in `test_ats.py`, 12 in `test_internal_emails.py`), no regressions
- `ruff check app/` — clean
- `npm run lint` — 0 errors; none of the 40 pre-existing warnings are from new files
- `npm run type-check`, `npm run build` — clean; `/api/ats/extract` and
  `/dashboard/ats-checker` both present in the build output

Calibration was checked against two fixtures at opposite ends: a well-formed
resume scores 92 (EXCELLENT, nothing above INFO), and one built to be
parser-hostile — table layout, no headings, no dates, prose instead of bullets
— scores 34 (POOR) with four critical findings.

## Follow-ups not taken

- **Persisting reports.** Scoring a candidate's resume at invitation time and
  storing the result against `Candidate` would make this part of the pipeline
  rather than a standalone tool. Needs a migration.
- **AI-written suggestions.** The deterministic engine says *what* is wrong;
  an opt-in Ollama pass could draft the replacement bullet. Would reintroduce
  the async job + polling layer this deliberately avoids.
- **Batch checking** a folder of resumes against one JD.
