# Public Link Analytics — Feature

**Date:** 2026-06-20
**Branch:** main
**Status:** ✅ Done

---

## Feature

The admin Candidates page now shows a funnel for each public assessment
link — views → registrations → starts → completions, plus a recommendation
breakdown and pass rate over whatever has been evaluated so far. This closes
the gap the feature checklist flagged right after public links shipped:
registrations were already tracked, but there was no way to see how many of
those registrations actually turned into a started or completed attempt.

```
backend/app/db/models/public_link.py                — PublicAssessmentLink.view_count
backend/alembic/versions/c1d2e3f4a5b6_...py          — new column migration
backend/app/schemas/public_link.py                   — PublicLinkAnalyticsResponse
backend/app/services/public_link_service.py          — _increment_view_count(), get_link_analytics()
backend/app/api/v1/public_links.py                   — GET /{link_id}/analytics
backend/tests/test_public_links.py                    — 6 new tests
frontend/src/types/public_link.ts                    — PublicLinkAnalytics
frontend/src/lib/api/publicLinks.ts                   — getAnalytics()
frontend/src/components/admin/PublicLinkSection.tsx    — funnel + pass-rate display
```

**Funnel definitions**, all computed live in `get_link_analytics()` — nothing
is pre-aggregated or cached, since this is low-volume admin dashboard traffic
for one link at a time:

- **Views** — `PublicAssessmentLink.view_count`, incremented unconditionally
  in `resolve_public_link()` every time a page load finds the link, even if
  it turns out disabled/expired/full. `register_via_public_link()` shares
  the same lookup helper but does **not** increment this counter, so
  submitting the registration form right after loading the page doesn't
  double-count the view.
- **Registrations** — `PublicAssessmentLink.registration_count`, already
  tracked since the original public-link feature (only brand-new
  invitations count, not reused/rotated ones).
- **Starts** — distinct invitations (by `public_link_id`) with at least one
  `TestAttempt` where `started_at IS NOT NULL`.
- **Completions** — distinct invitations with `InvitationStatus.COMPLETED`.
- **Recommendation breakdown / pass rate** — grouped over every evaluated
  `TestAttempt` under the link's invitations, using
  `COALESCE(admin_override_recommendation, ai_recommendation)` — the same
  precedence the existing results pages already use, so an admin override
  isn't silently ignored in the funnel. Pass rate is
  `(STRONG_HIRE + HIRE) / evaluated_attempts`, reported as `null` (not `0%`)
  when nothing has been evaluated yet.

These stages are independent denominators, not a strict subset chain over
time — a registration cap change or link edit between two points in time
means `starts` isn't guaranteed to be `<= registrations` if you compare two
different snapshots, though within one snapshot it always will be.

Verified against a real Postgres instance (not just the SQLite test suite):
created a JD + approved test + public link, resolved it twice, registered
one candidate, and confirmed `views: 2`, `registrations: 1` — registering
did not inflate the view count. All 237 backend tests pass (24 in
`test_public_links.py`, 6 of them new for this feature).

---

## Files Changed Summary

```
backend/app/db/models/public_link.py                  — view_count column
backend/alembic/versions/c1d2e3f4a5b6_add_public_link_view_count.py — new
backend/app/schemas/public_link.py                     — view_count on PublicLinkResponse,
                                                          PublicLinkAnalyticsResponse
backend/app/services/public_link_service.py            — _increment_view_count(),
                                                          get_link_analytics()
backend/app/api/v1/public_links.py                      — GET /{link_id}/analytics
backend/tests/test_public_links.py                      — TestPublicLinkAnalytics (6 tests)

frontend/src/types/public_link.ts                       — view_count, PublicLinkAnalytics
frontend/src/lib/api/publicLinks.ts                      — getAnalytics()
frontend/src/components/admin/PublicLinkSection.tsx      — funnel stats + pass-rate row
```
