# Bottleneck 1 — Parallel Test Generation

**Date:** 2026-05-24
**Branch:** office
**Status:** ✅ Done

---

## Problem

Test generation was running **sequentially** — one Ollama call at a time, blocking until
each finished before starting the next.

```python
# BEFORE — sequential loop (bad)
for test_type in [TestType.TECHNICAL, TestType.REASONING, TestType.PROBLEM_SOLVING]:
    validated = await _generate_with_retry(prompt, seed=seed)  # blocks here each time
    test = await _persist_test(...)
```

**Total time: 6–18 minutes** (each Ollama call takes 2–6 min, done one-by-one).

---

## Fix

### File 1: `backend/app/services/test_generation_service.py`

**Added** `import asyncio` at the top.

**Rewrote** `generate_tests_for_jd()`:

1. **Build all 3 prompts first** (pure CPU, instant — no I/O).
2. **Fire all 3 Ollama calls at the same time** using `asyncio.gather()`.
3. **Persist sequentially** — SQLAlchemy `AsyncSession` is not concurrency-safe,
   so DB writes stay one-by-one (but they're fast, milliseconds each).

```python
# AFTER — parallel Ollama calls (good)
validated_results = await asyncio.gather(
    *[_generate_with_retry(prompt, seed=seed) for _, prompt, seed in prompts]
)
# then persist sequentially (DB writes are fast)
for (test_type, _, _), validated in zip(prompts, validated_results):
    test = await _persist_test(jd_id=jd_id, test_type=test_type, validated=validated, db=db)
```

### File 2: `docker-compose.yml`

Added three environment variables to the `ollama` service:

| Variable | Value | Purpose |
|---|---|---|
| `OLLAMA_NUM_PARALLEL` | `3` | Allows Ollama to process 3 requests concurrently instead of queuing them |
| `OLLAMA_KEEP_ALIVE` | `-1` | Keeps the model permanently loaded in memory — no cold-start between calls |
| `OLLAMA_FLASH_ATTENTION` | `1` | Reduces per-request memory overhead, enabling stable parallel execution |

---

## Result

| | Before | After |
|---|---|---|
| Test generation time | 6–18 min | 2–6 min |
| Speedup | — | ~3x |
| Ollama calls | Sequential (1 + 1 + 1) | Parallel (all 3 at once) |
| DB writes | Sequential | Sequential (unchanged, safe) |

> **Note:** The actual speedup depends on hardware. On GPU the gain is most visible.
> On CPU-only, Ollama may still serialize internally but the async overhead is eliminated.

---

## Files Changed

```
backend/app/services/test_generation_service.py   — asyncio.gather parallelism
docker-compose.yml                                 — Ollama parallel config
```
