# AI-Likeness Estimate For Open-Ended Answers

Date: 2026-06-20

This update adds an opt-in, probabilistic "AI-likeness" signal for
open-ended candidate answers — a review aid for admins, never a verdict.

## What Shipped

| Area | Change |
| --- | --- |
| Per-answer estimate | Each open-ended answer gets an `estimated_ai_percentage` (0-100), a `confidence` level (LOW/MEDIUM/HIGH — confidence in the estimate itself, not the percentage), up to 5 `suspicious_phrases`, a short `explanation`, and a `recommendation` (NO_CONCERN/REVIEW_SUGGESTED/HIGH_CONCERN). |
| Aggregate | The evaluation report shows an overall AI-likeness percentage (average across analyzed answers), an overall confidence (the *weakest* individual confidence — never overstated), and a flagged-answer count. |
| Opt-in | Disabled by default via `AI_LIKENESS_ENABLED=false`. Uses the same Ollama model already configured for evaluation — no extra model pull required. |
| Non-fatal | Every failure mode (disabled, Ollama unreachable, malformed response after retries) returns `None` and leaves the fields `NULL` — never breaks or delays the evaluation pipeline. |
| Admin UI | A purple "AI-Likeness Estimate" card on the evaluation report (visually distinct from the green/red score ring, so it's never mistaken for a score), plus inline per-question detail in the question feedback list. |
| Scope | Open-ended answers only, matching the request. Code answers keep their existing informal "note if this looks AI-generated" line inside the regular AI feedback text — left as-is, not formalized into structured fields. |

## Design Notes

- **This is a probabilistic writing-style signal, not proof of AI use**,
  and the codebase is deliberately blunt about this everywhere: the
  `ai_detection_service.py` module docstring, the system prompt sent to the
  model, the admin UI copy ("Use it as one review input alongside the
  candidate's full response and score"), and this changelog all say so. LLM-based
  AI-text detection is unreliable in both directions — a well-written human
  answer can be flagged, and a lightly-edited AI answer can pass.
- `ai_detection_service.py` mirrors `embedding_service.py`'s exact shape on
  purpose: a single function, gated behind a settings flag, that returns
  `None` on every failure mode rather than raising. This is the established
  pattern in this codebase for "optional, Ollama-backed, non-fatal
  enrichment of an evaluation."
- The LLM call itself reuses the existing `_eval_one_open_ended()` /
  `_try_validate_oe()` retry structure (prompt → validate → up to 2
  correction attempts → give up) from the main scoring pipeline, just with
  its own prompt and Pydantic schema (`AIDetectionEvalAI`).
- Confidence aggregation is deliberately conservative ("weakest link"): if
  any individual answer's estimate was LOW confidence, the whole attempt's
  aggregate confidence is LOW too.
- Two new Postgres enum types (`AIDetectionConfidence`,
  `AIDetectionRecommendation`) plus 5 new columns on `question_feedback` and
  3 on `evaluations`, all nullable/defaulted so existing rows and the
  feature's default-off state are unaffected.

## Next Steps

Multi-user auth/workspaces/RBAC (the largest remaining item from the original
request — deliberately scoped as its own migration project across both the
Prisma and SQLAlchemy user systems), then the `docs/ui-ux-audit.md` items
(Settings tabs, system health card, JD stepper, Results filters).
