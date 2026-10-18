# Difficulty Distribution Customization — Feature + Bug Fixes

**Date:** 2026-06-07
**Branch:** main
**Status:** ✅ Done

---

## Feature

Admins can now control the EASY / MEDIUM / HARD question mix when generating
assessment tests, instead of always getting the AI's auto-extracted defaults.

A new collapsible `DifficultyCustomizer` panel (sliders for Easy / Medium, with
Hard auto-balancing to 100%) sits above the test cards on
`/dashboard/jds/[id]/tests`. The chosen split is sent as a one-time override on
`POST /tests/generate/{jd_id}` and flows through to the LLM prompt.

```
frontend/src/components/admin/DifficultyCustomizer.tsx   — new slider UI
frontend/src/components/admin/GenerateTestsButton.tsx    — wires UI → API call
frontend/src/lib/api/tests.ts                            — generate() accepts distribution
backend/app/schemas/test.py                              — DifficultyOverride + GenerateTestsRequest
backend/app/api/v1/tests.py                              — /generate/{jd_id} accepts request body
backend/app/services/jd_service.py                       — passes override through to generation
```

---

## Bug 1 — Distribution was computed but never reached the prompt

`generate_tests_for_jd` received a `difficulty_distribution` dict but the
`_GENERATION_PROMPT` template never interpolated it — the LLM had **zero**
visibility into the admin's chosen split. Fixed by adding an explicit line to
the TEST REQUIREMENTS section:

```
- Question difficulty distribution: {easy_pct}% EASY · {medium_pct}% MEDIUM · {hard_pct}% HARD
  (Across {total_q} questions aim for ~{easy_n} EASY, ~{medium_n} MEDIUM, ~{hard_n} HARD)
```

**How the distribution actually applies:** the percentages convert to a target
question count *per test* (e.g. 50/0/50 of 7 questions → ~4 Easy / 0 Medium /
3 Hard), and that **same instruction is sent to all 3 generated tests**
(Technical Screening, Practical Reasoning, Problem-Solving). It does **not**
mean "make one whole test easy, one medium, one hard" — each test internally
contains the requested proportional mix of question difficulties.

---

## Bug 2 — Rounding could produce negative question counts

The original math:

```python
easy_n = round(total_q * easy_pct / 100)
hard_n = round(total_q * hard_pct / 100)
medium_n = total_q - easy_n - hard_n
```

breaks for splits like 50% Easy / 0% Medium / 50% Hard on a 7-question test:
`round(3.5)` rounds **both** to 4, leaving `medium_n = 7 - 4 - 4 = -1`. The
prompt then literally told the LLM to "aim for ~4 EASY, ~-1 MEDIUM, ~4 HARD".

Fixed with a largest-remainder allocation, `_question_difficulty_counts()`
(`backend/app/services/test_generation_service.py`):
floor each share, then hand out leftover questions to whichever bands lost the
most to rounding. Guarantees non-negative counts that always sum to `total_q`.

```python
_question_difficulty_counts(7, 50, 0, 50)  # → (4, 0, 3)   was (4, -1, 4)
_question_difficulty_counts(7, 30, 50, 20) # → (2, 4, 1)
```

---

## Bug 3 — Test-level "Overall difficulty" badge ignored the admin's split

Each test category (`_TEST_TYPE_CONFIG`) had a **hardcoded** `"difficulty"`
value that was written straight into the persisted `Test.difficulty`:

```python
TestType.TECHNICAL:       "MIXED"
TestType.REASONING:       "MEDIUM"
TestType.PROBLEM_SOLVING: "HARD"
```

So the card badges (HARD / MEDIUM / MIXED) **never** reflected the admin's
chosen percentages — "Role-Specific Problem-Solving" always showed HARD no
matter what split was picked.

Fixed in two steps:

1. Removed the hardcoded `"difficulty"` keys from `_TEST_TYPE_CONFIG`.
2. Added `_overall_difficulty_label(easy_pct, medium_pct, hard_pct)` — the
   leading band becomes the label, or `"MIXED"` if no band leads by ≥ 20
   points (e.g. a 50/50 Easy/Hard split has no leader → MIXED).

```python
_overall_difficulty_label(50, 0, 50)   # → MIXED   (tied, no leader)
_overall_difficulty_label(30, 50, 20)  # → MEDIUM  (leads by 20)
_overall_difficulty_label(70, 20, 10)  # → EASY
```

**Important nuance:** simply changing the *prompt's suggested* difficulty
wasn't enough — `_persist_test()` and `regenerate_single_test()` were storing
`Difficulty(validated.difficulty)`, i.e. **whatever the LLM echoed back** in
its JSON response. The local Gemma model doesn't reliably follow the "Overall
difficulty: X" instruction, so the three tests could each get a different,
inconsistent label. The fix **overrides** the LLM's returned value and forces
`Test.difficulty = Difficulty(overall_difficulty)` — a value computed
deterministically from the admin's percentages, guaranteeing all 3 tests show
a consistent badge that matches what was configured.

---

## Bug 4 — Leaderboard crashed with `ModuleNotFoundError`

Unrelated to the difficulty work, but found while investigating a related
report ("leaderboard shows no candidates"): `evaluation_service.get_leaderboard`
and `get_system_report` imported

```python
from app.db.models.invitation import Invitation   # ❌ no such module
```

`Invitation` actually lives in `app.db.models.candidate`. The
`ModuleNotFoundError` was swallowed by the global error handler and surfaced
to the frontend as a generic `INTERNAL_ERROR`, which the leaderboard page
treated the same as "no data" — showing "No evaluated candidates yet for this
JD" even though a matching, properly-joined evaluation existed. Fixed the
import in both functions:

```python
from app.db.models.candidate import Candidate, Invitation
```

---

## Bug 5 — `regenerate_single_test` missing format placeholders (latent crash)

While fixing Bug 1, `_GENERATION_PROMPT` gained `{easy_pct}` / `{medium_pct}` /
etc. placeholders, but `regenerate_single_test()` (used by the per-card
"Regenerate" button) never supplied them — its `.format()` call would raise
`KeyError`. Added a `difficulty_distribution` parameter end-to-end
(`trigger_regenerate_single` → `regenerate_single_test`), pulling the value
from `extracted.difficulty_distribution` so single-test regeneration computes
the same counts and overall-difficulty label as full regeneration.

---

## Files Changed Summary

```
backend/app/schemas/test.py                  — DifficultyOverride, GenerateTestsRequest
backend/app/api/v1/tests.py                  — /generate accepts distribution body
backend/app/services/jd_service.py           — passes override to generation
backend/app/services/test_service.py         — passes distribution to single-test regen
backend/app/services/test_generation_service.py
    — _GENERATION_PROMPT: added distribution + per-question count lines
    — _question_difficulty_counts(): largest-remainder allocation (no negatives)
    — _overall_difficulty_label(): derives badge from admin's percentages
    — _persist_test() / regenerate_single_test(): force difficulty from
      computed label instead of trusting the LLM's echoed value
backend/app/services/evaluation_service.py   — fixed Invitation import (2 places)
frontend/src/components/admin/DifficultyCustomizer.tsx  — new slider UI
frontend/src/components/admin/GenerateTestsButton.tsx   — wires UI → API
frontend/src/lib/api/tests.ts                           — generate() signature
frontend/src/app/(admin)/dashboard/jds/[id]/tests/page.tsx — passes initial distribution
```
