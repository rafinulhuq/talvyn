# Per-Model Prompt Registry

Talvyn calls Ollama from 4 places: skill extraction (JD → structured
data), test generation, answer evaluation (open-ended + code + the
aggregate hire/no-hire summary), and AI-likeness detection. Every one of
those prompts used to be a hardcoded module-level constant tuned only
against `gemma3` (the only family `start.sh`'s hardware auto-detection has
ever picked). Swapping in a different model — e.g. to try
`qwen2.5-coder:7b` — used to mean either accepting Gemma-tuned wording
against a different model, or hand-editing 4 service files.

`backend/app/prompts/` fixes that: each task's prompts now live in a
per-model-family module, resolved automatically from `OLLAMA_MODEL` at the
point each service calls Ollama.

## How it resolves

```
backend/app/prompts/
  types.py      — dataclasses: SkillExtractionPrompts, TestGenerationPrompts,
                  EvaluationPrompts, AIDetectionPrompts, ModelPromptSet
  gemma.py      — GEMMA_PROMPTS — the only set that's actually been run
                  against real candidates; also the default/fallback
  qwen.py       — QWEN_PROMPTS — tuned for the Qwen2.5-Coder family
  registry.py   — get_prompt_set(model_name) — keyword match, not exact tag
```

`get_prompt_set()` (no args) reads the configured `OLLAMA_MODEL` and matches
it against known family keywords (`"qwen"`, `"gemma"`) case-insensitively,
substring match — so `qwen2.5-coder:7b`, `qwen2.5-coder:14b`, and any future
`qwen3` tag all resolve to the same `QWEN_PROMPTS` without registry changes.
An unrecognised model name (a different family entirely) falls back to
`GEMMA_PROMPTS` — the only prompt set actually validated against this app —
rather than guessing or erroring.

This is **switching by restart, not a live admin toggle.** `OllamaClient`
already binds the model name once per process (from `Settings`, itself
`@lru_cache`'d) — the prompt registry follows that same existing pattern
rather than introducing a new one. Change the model, restart the backend +
worker, done.

## Testing a different model

Two ways to pick a model, either skips hardware auto-detection's default
`gemma3` choice:

**Interactive picker** — run `./start.sh` from a real terminal (not piped,
not CI) with no `--model` flag, and it shows a 10-second arrow-key menu:

```text
[model] Pick a model family, or wait — the recommended one runs automatically:

  > Auto — recommended for your hardware (gemma3:4b)
    Gemma 3 (general-purpose)
    Qwen 2.5 Coder (code-specialized)
    DeepSeek R1 (reasoning-specialized)
    MiMo (Xiaomi reasoning model)
  (↑/↓ to choose, Enter to confirm — auto-selecting in 10s)
```

Up/Down moves the highlight, Enter confirms immediately, and not touching
it for 10 seconds runs the highlighted option (`Auto` by default) — exactly
the same outcome as not having the picker at all. Picking a family maps to
a specific tag sized for your already-detected hardware tier (the same way
`gemma3:27b` vs `gemma3:4b` already scale with VRAM) — see the mapping
table in `start.sh`'s "INTERACTIVE MODEL PICKER" section. Skip the picker
with `--no-prompt`, or it's skipped automatically when stdin isn't a real
terminal (CI, piped input, cron).

**Direct flag** — skips the picker entirely and uses the exact tag given:

```bash
ollama pull qwen2.5-coder:7b
./start.sh --model qwen2.5-coder:7b
```

Either way, the hardware-tuned timeout, parallelism, and question-count
settings for your detected VRAM/RAM tier are kept as-is (a reasonable
starting point for a similarly-sized model — hand-edit
`backend/.env.hardware` afterward if the model is meaningfully bigger or
slower than what auto-detection would have picked).

Manually, the equivalent is setting `OLLAMA_MODEL=qwen2.5-coder:7b` in
`backend/.env.hardware` directly — but note `start.sh` regenerates that
file from hardware detection on every run, so a manual edit doesn't survive
the next `./start.sh` without `--model` or a picker selection.

**DeepSeek R1 and MiMo have no tuned prompt set yet** (only `gemma.py` and
`qwen.py` exist under `backend/app/prompts/`) — picking either family falls
back to `GEMMA_PROMPTS` via the registry's existing unrecognised-model
fallback. They're in the menu because they're real, pullable Ollama models
worth being able to try the *test-generation pipeline* against, not because
their prompts are tuned — see "Adding a new model family" below to give
either one its own tuned set once you've actually run it. MiMo's exact
Ollama library tag may not be `mimo:7b` by the time you read this — the
pull step fails with a clear "model not found" if so; re-run with
`--model <correct-tag>` once you know it.

## Tuning a model's prompts

Each `ModelPromptSet` is one Python object — to adjust how `qwen2.5-coder`
is prompted for, say, code evaluation only, edit
`_CODE_EVAL_TEMPLATE` in `qwen.py`; the other 3 tasks (and every other
model family) are untouched. There's no templating engine — these are
plain `str.format()` templates, matching the rest of the codebase's
existing prompt style. Keep the exact placeholder names each service
formats with (e.g. `{question_text}`, `{max_score}`) — see the calling
function in `app/services/*.py` for the full set a given template must
support.

The `QWEN_PROMPTS` set shipped with this registry is a **reasoned starting
point, not a validated one** — written from Qwen2.5-Coder's known
characteristics (code-specialized training, strong instruction-following,
terser default prose), not from runs against real candidates the way the
Gemma set has had. Expect to revise it after actually generating tests and
evaluations with it. The code-evaluation prompt is the most rewritten one —
it asks the model to mentally trace execution before scoring, since that's
the one task a coding-specialized model is actually better positioned for
than Gemma; the other 3 tasks are intentionally close to the Gemma wording,
just more directive, since there's no principled reason a coder model
would be better (or worse) at writing structured JD extraction, MCQ
question design, or a holistic hire summary.

## Adding a new model family

1. Create `backend/app/prompts/<family>.py`, following `qwen.py`'s
   structure: one `ModelPromptSet` instance covering all 4 tasks.
2. Register it in `registry.py`'s `_FAMILY_KEYWORDS` list, choosing a
   keyword that's unambiguous against the existing entries.
3. No service code changes needed — every service already calls
   `get_prompt_set()` rather than hardcoding a family.

## What this doesn't do

- No admin UI for switching models or editing prompts live — by design,
  this iteration keeps the existing env-var-driven, restart-to-apply model
  selection. A database-backed, live-editable version would be a much
  larger change (new schema, new endpoints, new Settings UI) and wasn't
  the chosen scope.
- No per-request model selection — one model, one prompt set, for the
  whole running process, same as before.
- The `_TEST_TYPE_CONFIG` dict in `test_generation_service.py` (what each
  of the 3 test types — Technical/Reasoning/Problem-Solving — should
  cover) is intentionally **not** part of the per-model registry. It's
  substantive content about what to test, not phrasing/formatting style,
  so it stays shared across every model family.
