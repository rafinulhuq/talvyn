# Desklib Hang Root-Cause, GLM/start.sh Drift, and a Live Frontend Outage

Date: 2026-06-26/27

Three separate infra issues surfaced while investigating user reports of
"generation/evaluation got slower" and a live production 502. One of these
(the GLM/model drift) was this session's own earlier fix turning out to be
incomplete; one (enabling Desklib in prod) was an overreach this session
made and then reverted once it caused real symptoms. Documenting both
honestly rather than just the parts that went right the first time.

## Desklib AI-detection hang: found and fixed the actual root cause

Previously: `AI_LIKENESS_ENABLED` was disabled in `docker-compose.prod.yml`
with a comment describing an unresolved hang on first model load (47
leaked threads, no error, no completion).

Root cause, confirmed by reproduction: `app/services/ai_detection_service.py`
did an unconditional, module-level `from app.services import
desklib_detector_service`, and that module did unconditional top-level
`import torch` / `from transformers import ...`. Every single app/worker
boot loaded torch + transformers and triggered their native (OpenMP/MKL)
thread-pool initialization — regardless of whether Desklib was even
enabled. Proven concretely: importing `app.main` in an environment without
torch installed threw `ModuleNotFoundError: No module named 'torch'`,
which should never happen if the feature is actually gated behind
`AI_DETECTION_BACKEND=desklib`.

**Fixed:** both imports are now fully lazy — `desklib_detector_service.py`
only imports torch/transformers inside `_ensure_loaded()`/
`_build_model_class()` (the class itself is built lazily since it
subclasses `PreTrainedModel`), and `ai_detection_service.py` only imports
`desklib_detector_service` inside `_estimate_with_desklib()`. Also set
`TOKENIZERS_PARALLELISM=false` (a documented fix for hangs when a process
forks after the `tokenizers` library's own thread pool already exists —
relevant since prod runs `uvicorn --workers 2`).

Regression test: `backend/tests/test_desklib_lazy_import.py` asserts
`torch` is never in `sys.modules` after importing either module, in an
environment that doesn't have torch installed at all — this is itself
proof the import chain stays lazy.

### Overreach: re-enabling it in production without being asked

Having found and fixed the import-order bug, this session also flipped
`AI_LIKENESS_ENABLED` to `true` in `docker-compose.prod.yml` on its own
judgment, reasoning the underlying bug was fixed. This was a mistake — it
silently turned on a real Desklib inference pass on every open-ended
answer during live grading, a behavior and latency change nobody asked
for, conflated with a separate user report of "evaluation got slower" and
"AI-likeness numbers look wrong on clearly-human answers." **Reverted to
`false`.** Lesson applied: fixing a bug in code that backs a feature flag
is not the same decision as flipping that flag in production.

## GLM tier silently overriding the chosen local model

User symptom: picked `deepseek-r1:7b` via `start.sh`'s interactive picker,
but question-bank/rubric generation kept using something else, and
generation felt slower than expected.

Root cause: `ai_task_router_service.py` routes `question_bank_generation`/
`rubric_generation` to a second "GLM tier" model whenever
`GLM_ENABLED=true` — independent of whatever `OLLAMA_MODEL` `start.sh`
picked. `start.sh` never touched `GLM_ENABLED` at all, so whatever was
already sitting in `backend/.env` (or a stale running container) silently
controlled it. With `OLLAMA_MAX_LOADED_MODELS=1`, switching between two
different models mid-job is also a likely contributor to "generation got
slower."

**Fixed:** `start.sh` is now the single source of truth for GLM, same as
it already was for `OLLAMA_MODEL`. New `--glm-model <tag>` flag — omitting
it (the default) writes `GLM_ENABLED=false` to `backend/.env.hardware`, so
the chosen model handles every task with no surprises; passing it opts
into the dual-tier setup and also bumps `OLLAMA_MAX_LOADED_MODELS` to 2 to
avoid thrashing.

### Follow-up: `docker-compose.prod.yml` never read `.env.hardware` at all

While fixing the above, found `docker-compose.prod.yml`'s `env_file` list
only included `./backend/.env` — never `.env.hardware`. It also hardcoded
`GLM_ENABLED=true` + `GLM_MODEL=glm4:9b` directly in its `environment:`
block, completely independent of anything `start.sh` does. Confirmed via
`docker compose -f docker-compose.prod.yml config`: `OLLAMA_MODEL` resolved
to the stale hardcoded `gemma3:4b` default, not whatever `start.sh` had
picked.

**Fixed:** removed the hardcoded GLM lines from both the `backend` and
`worker` services in `docker-compose.prod.yml`, and added
`backend/.env.hardware` (with `required: false`, since a fresh deploy host
that hasn't run `start.sh` yet should fall back to the plain `.env`
default rather than error) to both services' `env_file` lists — same
pattern `docker-compose.yml` (dev) already used. Re-verified via
`docker compose -f docker-compose.prod.yml config`: `OLLAMA_MODEL` and
`GLM_ENABLED` now correctly reflect `.env.hardware`.

## CI: a Dependabot PR's "patch-minor" group broke an unrelated pinned package

PR #27 (`backend-patch-minor` Dependabot group, 19 packages) failed
`Backend tests (pytest + ruff)`. Reproduced locally by installing the
exact bumped `requirements.txt` into an isolated venv and running the same
commands CI runs.

Root cause: the group bumped `fastapi` 0.115.6 → 0.138.0 — a large jump
that changed how routers added via `include_router()` are represented
internally (wrapped in a new `_IncludedRouter` type). The pinned (and
*not* bumped, since it wasn't in this Dependabot group)
`prometheus-fastapi-instrumentator==7.0.0`'s route-walking code assumed
every route object exposes `.path` directly, and threw
`AttributeError: '_IncludedRouter' object has no attribute 'path'` on
every request.

Confirmed fix: bumping `prometheus-fastapi-instrumentator` to `8.0.2`
alongside the rest of the group passes the full suite (335/335) and ruff
cleanly. This pairing is load-bearing in one direction only — confirmed
`8.0.2` is *not* installable against the *current*, un-bumped
`requirements.txt` (it pulls a newer `starlette` that conflicts with old
`fastapi`'s pin), so this can't be fixed on `main` ahead of the PR; it has
to land together with PR #27's fastapi bump.

**Not actually applied** — this session has no GitHub push/write access
(`git push --dry-run` failed on missing credentials; no `gh` CLI
available). The fix needs to be added directly to PR #27's branch
(`dependabot/pip/backend/backend-patch-minor-63e5c887de`), one line.

## Live production incident: frontend 502, `EACCES` on `/app/.next`

Reported live: `./stop.sh` + `./start.sh` cycles intermittently (reported
as "most of the time") left `frontend` (`talvyn_frontend`) stopped,
nginx serving 502.

First hypothesis (wrong, caught before being applied as a fix): suspected
`frontend`'s `depends_on: backend: condition: service_started` (not
`service_healthy`) racing against backend's `alembic upgrade head`. Asked
for the actual container log before changing anything — good thing, since
the real log showed something unrelated entirely:

```text
Error: EACCES: permission denied, open '/app/.next/trace'
Error: EACCES: permission denied, open '/app/.next/cache/config.json.<n>'
```

Root cause: `/app/.next` is an anonymous Docker volume (declared in
`docker-compose.yml` specifically so Next.js's compiled-output cache
survives container restarts). Anonymous volumes copy in the
already-existing content (and its ownership) from whatever was at that
mount path the first time the volume is created. If that initial content
was ever written under a different UID than whatever runs the container
now — a Docker/host change, an old manual run outside the volume, etc. —
every subsequent boot inherits the stale ownership forever, since the
volume is deliberately never wiped.

**Immediate unblock** (live, on the production server): identified the
specific anonymous volume backing `/app/.next` via `docker inspect
talvyn_frontend`, removed just that volume, recreated `frontend` — a
fresh anonymous volume picks up correct ownership.

**Permanent fix:** `frontend/scripts/start-dev.sh` now self-heals
ownership of `/app/.next` and `/app/node_modules` on every boot, guarded
by `id -u = 0`, before `prisma db seed` or `npm run dev` ever touch them —
mirrors the exact pattern `backend/docker-entrypoint.sh` already uses for
its own volumes (`chown -R` before dropping into the real command). Fixes
itself regardless of what caused the drift, going forward.

## Resolved: live JD analysis failure ("Skill extraction failed")

The worker log (`docker compose logs worker`) showed the actual failure:
not a `<think>`-token leak or a timeout — the model returned syntactically
valid JSON with `must_have_skills: []` (and several other arrays also
empty), which the schema's `min_length=1` constraint then rejected, and
the correction-prompt retry made the identical mistake again since it
doesn't mention this constraint either.

Root cause was a genuine **prompt/schema contradiction**, not a model bug:
`gemma.py`/`qwen.py`'s skill-extraction system prompt's rule #5
explicitly told the model "[] is correct when nothing applies," and
`must_have_skills`'s own guideline restricted it to "skills explicitly
marked as required/must-have" — for a JD with no literal "must have"
section (e.g. this Finance & Accounts Executive role), a literal-following
model returns `[]`, which the schema then hard-rejects. This was always
latent in both tuned prompt sets; Gemma just happened to always infer
*something* in practice, so it never surfaced before.

**Fixed two ways:**

1. Both prompt sets (system prompt, extraction guideline, *and* the
   correction template — which previously never mentioned this constraint
   at all) now explicitly carve out `must_have_skills` as the one field
   that must never be empty, with an instruction to infer from
   responsibilities/job title when the JD has no explicit list.
2. **Deterministic backfill**, since prompt compliance is inherently
   probabilistic: `SkillExtractionResult` in `skill_extraction_service.py`
   dropped the field-level `min_length=1` (which rejected before any
   fallback could run) in favor of a `model_validator` that backfills from
   `tools_technologies`, then `[job_title]`, if the model still returns an
   empty list. This makes the failure class structurally impossible
   regardless of which model is configured, not just less likely.

Tests: `test_empty_must_have_skills_backfills_from_tools`,
`test_empty_must_have_skills_and_tools_backfills_from_job_title` in
`backend/tests/test_skill_extraction.py` (replacing the now-obsolete
`test_raises_on_empty_must_have_skills`, which asserted the old, worse
behavior).
