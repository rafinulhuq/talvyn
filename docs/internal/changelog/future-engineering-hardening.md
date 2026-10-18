# Future Engineering Hardening

**Date noted:** 2026-06-08
**Status:** Planned

This note tracks the next engineering fixes to document as future changelog
entries once they are implemented. These are not shipped changes yet.

---

## 1. Candidate Attempt Token Ownership

Candidate attempt endpoints are public because candidates call them directly
from the browser. Every attempt-specific write should verify that the provided
`X-Attempt-Token` belongs to the `attempt_id` being modified.

Routes to harden:

- `POST /api/v1/attempts/{attempt_id}/answer`
- `POST /api/v1/attempts/{attempt_id}/bulk-save`
- `POST /api/v1/attempts/{attempt_id}/heartbeat`
- `POST /api/v1/attempts/{attempt_id}/submit`
- `POST /api/v1/attempts/{attempt_id}/event`

Expected changelog once fixed:

- Add a shared backend helper that loads the attempt and verifies the token
  hash against the attempt's invitation.
- Pass the token from route handlers into all attempt service write methods.
- Add regression tests for wrong-token access on every protected attempt route.

---

## 2. Candidate Question Ownership

Answer saves should verify that every submitted `question_id` belongs to the
test assigned to the candidate's attempt.

Expected changelog once fixed:

- Reject answer payloads containing questions from another test or job
  description.
- Apply the check to both single-answer and bulk-answer saves.
- Add tests for cross-test and cross-attempt answer injection attempts.

---

## 3. Prisma and TypeScript Schema Sync

Alembic/Pydantic are ahead of the frontend Prisma schema and some TypeScript
types. The sync should include newer backend fields such as:

- `generation_status`
- `passing_marks`
- `QuestionType.CODE`
- `code_language`
- `code_starter`
- evaluation score breakdown fields
- `evaluation_level`
- `improvement_suggestions`
- `suitable_role`
- `skill_breakdown`

Expected changelog once fixed:

- Update `frontend/prisma/schema.prisma` to match the latest Alembic schema.
- Update frontend TypeScript API types to match backend Pydantic responses.
- Regenerate the Prisma client.
- Run frontend type-check/build and backend tests.

---

## 4. Readiness Endpoint Status Code

`GET /api/v1/health/ready` computes whether the service is degraded, but the
HTTP response should also return `503` when required dependencies are down.

Expected changelog once fixed:

- Return `503 Service Unavailable` when database or Ollama checks fail.
- Keep the current detailed JSON body for diagnostics.
- Add/adjust tests for healthy and degraded readiness responses.

---

## 5. Production Migration Startup

~~The backend Dockerfile runs `prestart.sh` before Uvicorn, but production
compose currently overrides the command with plain `uvicorn`, which can
skip Alembic migrations.~~ Resolved by the time of
`docs/changelog/dev-prod-deployment-drift-fix.md` (2026-06-21) —
`docker-compose.prod.yml`'s backend command is
`bash /app/prestart.sh && uvicorn ...`, confirmed already in place. That
same pass found and fixed the frontend's equivalent gap: production never
ran `prisma migrate deploy`, only `prisma generate` (client codegen, not a
database write) — see that changelog entry.

