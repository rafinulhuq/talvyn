# Per-Model Prompt Registry

Date: 2026-06-21

Added a `backend/app/prompts/` registry so each of the 4 places Talvyn
calls Ollama (skill extraction, test generation, evaluation, AI-likeness
detection) can have a different, model-family-tuned prompt set — driven by
the existing `OLLAMA_MODEL` env var, no new admin UI. Built to support
trying `qwen2.5-coder:7b` alongside the `gemma3` family `start.sh`'s
hardware auto-detection has always picked, without hand-editing 4 service
files or silently running Gemma-tuned wording against a different model.

See [docs/ai-prompt-registry.md](../ai-prompt-registry.md) for the full
design, how resolution works, and how to tune or add a model family.

## What changed

- **`backend/app/prompts/`** (new): `types.py` (dataclasses for each
  task's prompt set), `gemma.py` (the exact prompts every service used
  before this change — verified byte-identical to the originals, see
  Verification below), `qwen.py` (new, tuned for Qwen2.5-Coder), and
  `registry.py` (`get_prompt_set()` — family-keyword match against
  `OLLAMA_MODEL`, falling back to Gemma for any unrecognised model).
- **4 services refactored** (`skill_extraction_service.py`,
  `test_generation_service.py`, `evaluation_service.py`,
  `ai_detection_service.py`): module-level prompt constants replaced with
  `get_prompt_set().<task>.<field>` lookups at the point each prompt is
  built. No change to call signatures, retry logic, or validation —
  only where the prompt strings come from.
- **`start.sh`**: added `--model <tag>` to override the hardware-detected
  model (e.g. `./start.sh --model qwen2.5-coder:7b`) without losing the
  auto-tuned timeout/parallelism/question-count settings for the detected
  VRAM/RAM tier. Previously the only way to run a non-`gemma3` model was a
  manual `.env.hardware` edit that the next `./start.sh` run would silently
  overwrite.

## Why Qwen2.5-Coder's prompts differ from Gemma's

Documented in full in `qwen.py`'s module docstring and
`docs/ai-prompt-registry.md`. Short version: the code-evaluation prompt is
rewritten the most — it now asks the model to mentally trace execution
before scoring, leaning into the one task a coding-specialized model is
actually better positioned for. The other 3 tasks (skill extraction, test
generation, the non-code evaluation paths) stay close to the Gemma wording,
just more directive, since there's no principled reason a coder-specialized
model would be better — or worse — at JD extraction, MCQ design, or writing
a holistic hire summary. These are a reasoned starting point, explicitly
flagged as not yet validated against real generations from this model —
unlike the Gemma set, which has been running in production.

## Verification

- Programmatically diffed every Gemma prompt constant in `gemma.py` against
  the original module-level constant it replaced (via `git show HEAD:...`
  + `exec`) — all 15 templates across the 4 services are byte-identical.
  The default (no `OLLAMA_MODEL` override) path has zero behavior change.
- `get_prompt_set()` resolution spot-checked: `gemma3:4b`/`gemma3:27b` →
  Gemma, `qwen2.5-coder:7b`/`qwen2.5-coder:14b` → Qwen, an unrelated model
  name (`llama3.1:8b`) → Gemma fallback.
- Backend test suite: **297 passed**, 0 regressions (existing tests mock
  `ollama_client.generate` generically and don't assert on prompt content,
  so this refactor carried low regression risk, confirmed).
- `ruff check app/prompts app/services` clean.
- `start.sh --status --model qwen2.5-coder:7b` (dry run, no services
  started) confirmed the override applies and the summary box flags it.

## Still Not Done

No admin UI for live model/prompt switching — this is env-var + restart,
matching how `OLLAMA_MODEL` already worked. No per-request model selection.
The Qwen prompt set hasn't been run against a real JD/candidate yet — that
validation pass is the natural next step once `qwen2.5-coder:7b` is pulled
and tried.
