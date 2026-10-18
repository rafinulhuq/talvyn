# Hardware Guidance

> **Status:** Recommendation for discussion — verify the `ollama ps` check below before purchasing
> **Written:** 2026-08-27
> **Audience:** whoever signs off on the server purchase, and whoever tunes `start.sh` afterwards
> **Supersedes nothing** — this sits alongside `talvyn-hardware-specifications.html` and
> `multi-user-capacity-plan.md`, and disagrees with the first one in a place worth reading.

This is about one question: what hardware makes Talvyn generate assessments
faster? The short answer is GPU memory, and the interesting part is that the
threshold that matters is lower than our existing hardware report suggests —
but the profile table in `start.sh` may be reaching for it a step too early.

---

## The only number that really matters

The application itself is cheap to run. FastAPI, Next.js, PostgreSQL, Redis,
nginx — none of it is demanding, and none of it is what makes a candidate wait.
Ollama is the entire cost, and GPU memory is the binding constraint on Ollama.
`multi-user-capacity-plan.md` already says this plainly and it's correct: "The
important constraint is not CPU or RAM."

So the purchasing decision is almost entirely a VRAM decision. Everything below
follows from that.

---

## The cliff: 16 GB is where the algorithm changes

This is the part that gets lost when people compare GPUs on raw speed. Look at
what `start.sh` actually does with the hardware it detects:

| Profile | VRAM floor | Model | Parallel | Sequential | Est. time |
| --- | --- | --- | --- | --- | --- |
| ultra | ≥ 16 GB | gemma3:27b | 3 | **false** | ~3 min |
| high | ≥ 8 GB | gemma3:12b | 1 | true | ~6 min |
| medium | ≥ 4 GB | gemma3:4b | 1 | true | ~15 min |
| low | ≥ 2 GB | gemma3:1b | 1 | true | ~6 min, fewer questions |
| cpu_fast | RAM ≥ 16 GB | gemma3:4b | 1 | true | ~20–30 min |
| cpu_slow | RAM < 16 GB | gemma3:1b | 1 | true | ~25–35 min |

The Parallel column is `OLLAMA_NUM_PARALLEL` and Sequential is
`TEST_SEQUENTIAL_GENERATION`. Only the ultra tier sets `SEQUENTIAL=false`. Every other profile generates the
three tests one after another, in series.

That means moving from 8 GB to 16 GB isn't a speed upgrade in the ordinary
sense — it's a change in how the work is done. Three sequential generations
become three concurrent ones. It's the reason the README shows roughly 3 minutes
at the ultra tier against roughly 6 at the high tier, even though gemma3:27b is
more than twice the size of gemma3:12b and should on its face be slower.

If we buy one thing, we buy our way past that line. Everything above it is
incremental; everything below it is a different, worse algorithm.

---

## Two thresholds I think are set too low

This matters before anyone spends money, because it changes which card to buy.

`gemma3:27b` at Ollama's default Q4_K_M quantisation is roughly **17 GB** of
weights. The ultra profile triggers at **16 GB** — and then asks for
`OLLAMA_NUM_PARALLEL=3`, which multiplies the KV cache on top of those weights.
A card with exactly 16 GB cannot hold that.

Ollama will not fail loudly when this happens. It will silently offload layers
to system RAM and keep going, and generation gets dramatically slower — quite
possibly slower than the high tier it was supposed to beat. So the README's
"≥ 16 GB → 27b → ~3 min" row is likely optimistic for a card sitting exactly on
the boundary.

The same pattern shows up one tier down. `gemma3:12b` is roughly **8.1 GB**
against an 8 GB floor. That is the RTX 3060 Ti named as the first production
server in `multi-user-capacity-plan.md` — the model is at or just over the
card's capacity before any KV cache is allocated at all.

### Verify this before acting on it

Quantisation details and Ollama's offload behaviour both shift between versions,
so treat the numbers above as a hypothesis worth ten seconds of checking rather
than a settled fact. While a generation job is running:

```bash
ollama ps
```

The output reports how the loaded model is split between CPU and GPU. If it says
anything other than 100% GPU, that profile is spilling and its VRAM floor needs
raising. This costs nothing, needs no purchase, and would change the
recommendation below if it comes back clean.

---

## What to buy

| Use case | Specification | Reasoning |
| --- | --- | --- |
| Development | Any 8–12 GB NVIDIA card, 32 GB RAM | Runs 4b or 12b sequentially. Fine for building features. Don't chase generation speed on a dev box. |
| Best value for speed | RTX 4090 or 5090, 24–32 GB VRAM, 64 GB RAM, 16-core CPU, 2 TB NVMe | Clears the 16 GB cliff with genuine headroom for three-way parallel KV cache. 27b fits properly rather than marginally. |
| Production, small team | RTX 6000 Ada 48 GB, or L40S 48 GB for a rack | ECC memory, better sustained thermals, room for larger models later. What our existing report recommends, and I agree for a deployed server. |
| Multi-tenant / high concurrency | 96 GB Blackwell, or H100/H200 | Only worth it once the code can use it — see the caveat below. |

### Where I disagree with our existing hardware report

`talvyn-hardware-specifications.html` dismisses the 24 GB RTX 4090 and treats
48 GB as the entry point for the sub-two-minute target. I think that over-buys.

The expensive transition is 8 GB → 24 GB, because that's where sequential
generation becomes parallel generation. The 24 GB → 48 GB step is a comfort and
reliability purchase, not a speed one. A 4090 running 27b with
`OLLAMA_NUM_PARALLEL=3` should land close to the two-minute target for a
fraction of the cost of an RTX 6000 Ada.

Buy 48 GB for ECC memory, sustained thermals, and multi-user headroom. Don't buy
it expecting a single job to finish meaningfully faster than it would on 32 GB.

---

## The parts that aren't the GPU

Modest requirements, but not zero — and one of them is routinely underestimated.

**RAM: 64 GB.** The full stack is roughly fourteen containers, and GlitchTip
alone brings its own PostgreSQL instance plus a Celery worker and beat
scheduler. 32 GB works if Prometheus, Grafana, and GlitchTip are left out;
16 GB will thrash. Note that Ollama runs natively on the host rather than in
Docker, so the model sits in VRAM while all fourteen containers sit in system
RAM — the two budgets are separate.

**CPU: 12–16 cores.** `start.sh` hands Ollama half the available cores on GPU
profiles and all of them on CPU profiles. Leave real cores spare: the Desklib
detector in `desklib_detector_service.py` is deliberately CPU-only, and that is
the right call — the GPU is already saturated by Ollama, and a DeBERTa forward
pass over 768 tokens is fast enough on CPU for background work.

**Storage: 2 TB NVMe.** Model weights, PostgreSQL with pgvector, MinIO objects,
and uploads. Gen4 is plenty. Gen5 buys nothing measurable for this workload.

**Not needed:** 10GbE networking, ECC on a development machine, or a second GPU.
Ollama will not usefully split a single model across two cards at this scale.

---

## The caveat that matters most

`backend/app/worker.py` sets `max_jobs = 1`.

That is a deliberate guard — it stops concurrent jobs from overwhelming an 8 GB
GPU, and on current hardware it is the correct setting. But it also means the
system processes exactly one AI job at a time no matter what card is installed.
Put an H100 in the rack tomorrow and two admins generating assessments
simultaneously will still queue behind one another.

Converting VRAM into throughput requires the code changes that
`multi-user-capacity-plan.md` already specifies: separate the queues into
`critical`, `normal_ai`, `slow_ai`, and `io`, then raise `max_jobs` for the
classes that never touch the GPU. Buy the hardware and schedule that work
together, or the hardware idles.

---

## The speedups that cost nothing

Worth exhausting before spending anything at all.

**Pre-generated question banks.** Generate once per job description, then serve
each candidate a locked random subset. This converts a per-candidate cost into a
one-time setup cost and is the single largest available win. The plan calls for
it and `question_bank_service.py` already exists.

**Batched evaluation.** `task_evaluate_exam_batched` is already the default path
for sectioned exams. Confirm nothing quietly falls back to one LLM call per
answer — fifteen answers should be one call, not fifteen.

**Cloud burst for peak load.** `ai_provider_service.py` already abstracts this.
Renting API capacity for the occasional spike is frequently cheaper than buying
and powering a GPU sized for a peak that arrives twice a week.

---

## Recommendation

A 24–32 GB card in the RTX 4090/5090 class, 64 GB of system RAM, 16 cores, and
a 2 TB NVMe drive.

Then run the `ollama ps` check during a real generation and correct the profile
thresholds in `start.sh` if 27b turns out not to be fully resident. Step up to
48 GB with ECC when this becomes a shared production server rather than a single
team's machine — and pair that step with the queue separation work, because
without it the extra memory has nothing to do.

---

## Appendix: where these claims come from

| Claim | Source |
| --- | --- |
| Profile table and parallelism knobs | `start.sh` — profile selection and the `OLLAMA_*` exports |
| Only ultra disables sequential generation | `SEQUENTIAL=false` appears once, in the ultra branch |
| Generation time estimates | Hardware profile table in `README.md` |
| One AI job at a time | `max_jobs = 1` in `backend/app/worker.py` |
| GPU is the binding constraint | `docs/multi-user-capacity-plan.md`, "Current Hardware Target" |
| First production server is an 8 GB RTX 3060 Ti | `docs/multi-user-capacity-plan.md` |
| 48 GB recommended as the entry point | `docs/talvyn-hardware-specifications.html` |
| Detector is CPU-only by design | Module docstring, `backend/app/services/desklib_detector_service.py` |
| Embedding model is small and separate | `nomic-embed-text`, ~274 MB — `backend/app/services/embedding_service.py` |
| Ollama runs on the host, not in Docker | `README.md`, Docker services section |
