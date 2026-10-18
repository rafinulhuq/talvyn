# Database Schema Authority

**Decision (A8-2): Alembic is the single source of truth for the database
schema. Prisma is a read model only.**

This resolves the long-standing ambiguity where both Alembic (backend) and
Prisma (frontend) described the database and had drifted apart.

## The rule

- **Alembic owns the schema.** Every schema change — new table, column, index,
  enum, constraint — is a migration under `backend/alembic/versions/`. The
  fresh-Postgres CI job (`backend-migrations`) applies `alembic upgrade head`
  to a brand-new database on every PR, so the migration history is always the
  authoritative, buildable definition of the DB.
- **Prisma does not migrate.** `frontend/prisma/schema.prisma` exists purely
  to generate the Prisma Client (used by the frontend for `users`/auth/signup
  reads and by `prisma/seed.ts`) and for occasional introspection. There are
  **no Prisma migrations** — the `prisma/migrations/` directory was removed,
  and the `db:push` / `db:migrate` / `db:migrate:prod` npm scripts are gone.
- The runtime enforces this: `frontend/scripts/start-dev.sh` and
  `docker-compose.prod.yml` explicitly **do not** run `prisma migrate deploy`
  or `prisma db push` (doing so fails with P3005 — "schema is not empty" —
  because Alembic already built the tables and there is no
  `_prisma_migrations` tracking table).

## Making a schema change

1. Write and commit an Alembic migration in `backend/alembic/versions/`
   (single head — the `backend-migrations` job guards this).
2. Update the corresponding SQLAlchemy model(s) in `backend/app/db/models/`.
3. Hand-mirror the affected model(s) in `frontend/prisma/schema.prisma` so the
   generated Prisma Client stays accurate (match the `@map` snake_case column
   names). Run `npm run db:generate` to regenerate the client.

## Drift detection in CI

The `schema-drift` job builds a database from Alembic (`alembic upgrade head`)
and then runs `prisma migrate diff` to compare `schema.prisma`'s datamodel
against that Alembic-built database. Any difference is printed as the SQL that
*would* reconcile Prisma to the real schema.

**This job is currently non-blocking (`continue-on-error`).** The two schemas
have accumulated historical drift (e.g. the Prisma `Candidate` model is missing
`candidate_number` / `linkedin_url` / `resume_url` that Alembic defines), so the
job reports rather than fails while that backlog is paid down. Once the
datamodel matches, flip the job to blocking (remove `continue-on-error`) so
drift can never silently return.
