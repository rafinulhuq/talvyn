#!/usr/bin/env bash
# start.sh — Auto-configuring Talvyn launcher
#
# Detects your hardware (GPU VRAM, CPU cores, RAM) and automatically:
#   • Picks the best Ollama model your GPU can fit
#   • Sets Ollama parallelism and thread counts
#   • Tunes question counts so generation stays within timeouts
#   • Writes everything to backend/.env.hardware (loaded by docker-compose)
#
# Usage:  ./start.sh
#         ./start.sh --cpu-only           force CPU inference (no GPU)
#         ./start.sh --status             just show current config and exit
#         ./start.sh --model qwen2.5-coder:7b
#                                          skip the interactive picker below
#                                          and use this exact tag. Hardware-
#                                          tuned timeout/parallelism/question
#                                          counts are kept as-is. Run
#                                          `ollama pull <model>` first.
#                                          Prompts auto-select a matching
#                                          tuned set — see app/prompts/ and
#                                          docs/ai-prompt-registry.md.
#         ./start.sh --no-prompt          skip the interactive model picker
#                                          (same as piping/non-tty use —
#                                          goes straight to the hardware-
#                                          recommended model)
#         ./start.sh --glm-model glm4:9b  ALSO run a second, bigger Ollama
#                                          model for "quality" tasks only
#                                          (question bank generation, rubric
#                                          generation, AI-risk explanation —
#                                          see ai_task_router_service.py).
#                                          Omitting this flag is the default
#                                          and disables that tier entirely —
#                                          every task uses the one model
#                                          you picked above. Only pass this
#                                          if your GPU has enough VRAM to
#                                          hold both models at once; on a
#                                          single small GPU, switching
#                                          between two models mid-job is
#                                          slower than just using one.
#
# Interactive model picker: when run attached to a real terminal (and
# --model/--no-prompt wasn't passed), shows a 10-second arrow-key menu to
# pick a model family other than the hardware-recommended default. No
# input within 10s — or pressing Enter on "Auto" — keeps the recommended
# pick. Picking a non-Gemma family that has no tuned prompt set yet
# (DeepSeek, MiMo) falls back to the Gemma-tuned prompts — see
# docs/ai-prompt-registry.md.
#
# URLs when running:
#   Frontend  http://localhost:3003
#   Backend   http://localhost:9000
#   Mailpit   http://localhost:8026  (dev email UI)
#   Ollama    http://localhost:11434

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OLLAMA_BIN="${OLLAMA_BIN:-$HOME/.local/bin/ollama}"
HW_ENV="$SCRIPT_DIR/backend/.env.hardware"

CPU_ONLY=false
STATUS_ONLY=false
NO_PROMPT=false
MODEL_OVERRIDE=""
GLM_MODEL_OVERRIDE=""
_next_is_model=false
_next_is_glm_model=false
for arg in "$@"; do
  if [ "$_next_is_model" = true ]; then
    MODEL_OVERRIDE="$arg"
    _next_is_model=false
    continue
  fi
  if [ "$_next_is_glm_model" = true ]; then
    GLM_MODEL_OVERRIDE="$arg"
    _next_is_glm_model=false
    continue
  fi
  case "$arg" in
    --cpu-only)   CPU_ONLY=true ;;
    --status)     STATUS_ONLY=true ;;
    --no-prompt)  NO_PROMPT=true ;;
    --model)      _next_is_model=true ;;
    --glm-model)  _next_is_glm_model=true ;;
    -h|--help)
      echo "Usage: ./start.sh [--cpu-only] [--status] [--no-prompt] [--model <ollama-model-tag>] [--glm-model <ollama-model-tag>]"
      exit 0 ;;
  esac
done
if [ "$_next_is_model" = true ]; then
  echo "[error] --model requires a value, e.g. --model qwen2.5-coder:7b" >&2
  exit 1
fi
if [ "$_next_is_glm_model" = true ]; then
  echo "[error] --glm-model requires a value, e.g. --glm-model glm4:9b" >&2
  exit 1
fi

# GLM tier (question bank/rubric/AI-risk "quality" tasks — see
# ai_task_router_service.py): disabled unless --glm-model is passed.
# start.sh is the single source of truth for this — it's written to
# backend/.env.hardware below, which overrides whatever GLM_ENABLED value
# is sitting in backend/.env (or a stale running container), so picking a
# model on the CLI is never silently second-guessed by a leftover cloud/
# second-model setting.
if [ -n "$GLM_MODEL_OVERRIDE" ]; then
  GLM_ENABLED=true
  GLM_MODEL="$GLM_MODEL_OVERRIDE"
else
  GLM_ENABLED=false
  GLM_MODEL=""
fi

_trim() {
  sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//'
}

_first_integer_or_zero() {
  local value
  value=$(printf "%s" "${1:-}" | grep -Eo '[0-9]+' | head -1 || true)
  if [ -z "$value" ]; then
    echo 0
  else
    echo "$value"
  fi
}

# ──────────────────────────────────────────────────────────────
# 1. HARDWARE DETECTION
# ──────────────────────────────────────────────────────────────

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║            Talvyn — Hardware Auto-Config             ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "[detect] Scanning hardware..."

# ── CPU ────────────────────────────────────────────────────────
CPU_CORES_RAW=$(nproc 2>/dev/null || sysctl -n hw.logicalcpu 2>/dev/null || echo 4)
CPU_CORES=$(_first_integer_or_zero "$CPU_CORES_RAW")
[ "$CPU_CORES" -lt 1 ] 2>/dev/null && CPU_CORES=4

CPU_MODEL=$(grep -m1 "model name" /proc/cpuinfo 2>/dev/null | cut -d: -f2- | _trim || true)
[ -z "$CPU_MODEL" ] && CPU_MODEL="Unknown CPU"

TOTAL_RAM_GB_RAW=$(free -g 2>/dev/null | awk '/^Mem:/{print $2}' || echo 8)
TOTAL_RAM_GB=$(_first_integer_or_zero "$TOTAL_RAM_GB_RAW")
[ "$TOTAL_RAM_GB" -lt 1 ] 2>/dev/null && TOTAL_RAM_GB=8

# ── GPU ────────────────────────────────────────────────────────
VRAM_MB=0
GPU_NAME="None"
HAS_GPU=false

if [ "$CPU_ONLY" = false ] && command -v nvidia-smi &>/dev/null; then
  if VRAM_MB_RAW=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits 2>/dev/null \
                   | head -1); then
    VRAM_MB=$(_first_integer_or_zero "$VRAM_MB_RAW")
  fi

  if [ "$VRAM_MB" -gt 0 ] 2>/dev/null; then
    GPU_NAME=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null \
               | head -1 | _trim || true)
    [ -z "$GPU_NAME" ] && GPU_NAME="Unknown GPU"

    HAS_GPU=true
  fi
fi

VRAM_GB=$(( VRAM_MB / 1024 ))

echo "[detect] CPU : $CPU_MODEL ($CPU_CORES cores)"
echo "[detect] RAM : ${TOTAL_RAM_GB} GB"
if [ "$HAS_GPU" = true ]; then
  echo "[detect] GPU : $GPU_NAME (${VRAM_GB} GB VRAM / ${VRAM_MB} MB)"
else
  echo "[detect] GPU : Not available (CPU-only inference)"
fi
echo ""

# ──────────────────────────────────────────────────────────────
# 2. HARDWARE PROFILE SELECTION
# ──────────────────────────────────────────────────────────────

# Profile  | VRAM   | Model        | MCQ | OE | Parallel | Threads | Timeout
# ultra    | ≥16 GB | gemma3:27b   |  5  |  2 |    3     |  auto   |  900s
# high     |  ≥8 GB | gemma3:12b   |  5  |  2 |    1     |  auto   |  900s
# medium   |  ≥4 GB | gemma3:4b    |  5  |  2 |    1     |  half   |  600s
# low      |  ≥2 GB | gemma3:1b    |  3  |  1 |    1     |  half   |  300s
# cpu_fast | RAM≥16 | gemma3:4b    |  3  |  1 |    1     |  all    |  900s
# cpu_slow | RAM<16 | gemma3:1b    |  2  |  1 |    1     |  all    | 1200s

if [ "$HAS_GPU" = true ]; then
  if [ "$VRAM_GB" -ge 16 ]; then
    PROFILE="ultra"
    OLLAMA_MODEL="gemma3:27b"
    MCQ_COUNT=5; OE_COUNT=2
    OLLAMA_NUM_PARALLEL=3; OLLAMA_NUM_THREADS=$(( CPU_CORES / 2 ))
    OLLAMA_TIMEOUT=900; SEQUENTIAL=false
  elif [ "$VRAM_GB" -ge 8 ]; then
    PROFILE="high"
    OLLAMA_MODEL="gemma3:12b"
    MCQ_COUNT=5; OE_COUNT=2
    OLLAMA_NUM_PARALLEL=1; OLLAMA_NUM_THREADS=$(( CPU_CORES / 2 ))
    OLLAMA_TIMEOUT=900; SEQUENTIAL=true
  elif [ "$VRAM_GB" -ge 4 ]; then
    PROFILE="medium"
    OLLAMA_MODEL="gemma3:4b"
    MCQ_COUNT=5; OE_COUNT=2
    OLLAMA_NUM_PARALLEL=1; OLLAMA_NUM_THREADS=$(( CPU_CORES / 2 ))
    OLLAMA_TIMEOUT=600; SEQUENTIAL=true
  elif [ "$VRAM_GB" -ge 2 ]; then
    PROFILE="low"
    OLLAMA_MODEL="gemma3:1b"
    MCQ_COUNT=3; OE_COUNT=1
    OLLAMA_NUM_PARALLEL=1; OLLAMA_NUM_THREADS=$(( CPU_CORES / 2 ))
    OLLAMA_TIMEOUT=300; SEQUENTIAL=true
  else
    # Very low VRAM — fall back to CPU
    HAS_GPU=false
    PROFILE="cpu_fast"
    OLLAMA_MODEL="gemma3:4b"
    MCQ_COUNT=3; OE_COUNT=1
    OLLAMA_NUM_PARALLEL=1; OLLAMA_NUM_THREADS=$CPU_CORES
    OLLAMA_TIMEOUT=900; SEQUENTIAL=true
  fi
else
  # CPU-only path
  if [ "$TOTAL_RAM_GB" -ge 16 ]; then
    PROFILE="cpu_fast"
    OLLAMA_MODEL="gemma3:4b"
    MCQ_COUNT=3; OE_COUNT=1
    OLLAMA_NUM_PARALLEL=1; OLLAMA_NUM_THREADS=$CPU_CORES
    OLLAMA_TIMEOUT=900; SEQUENTIAL=true
  else
    PROFILE="cpu_slow"
    OLLAMA_MODEL="gemma3:1b"
    MCQ_COUNT=2; OE_COUNT=1
    OLLAMA_NUM_PARALLEL=1; OLLAMA_NUM_THREADS=$CPU_CORES
    OLLAMA_TIMEOUT=1200; SEQUENTIAL=true
  fi
fi

# Clamp threads to at least 2
[ "$OLLAMA_NUM_THREADS" -lt 2 ] 2>/dev/null && OLLAMA_NUM_THREADS=2

# ──────────────────────────────────────────────────────────────
# 2b. INTERACTIVE MODEL PICKER (arrow keys, 10s, auto-picks Auto)
# ──────────────────────────────────────────────────────────────
#
# Skipped entirely when: --model was passed (explicit choice, no need to
# ask), --no-prompt was passed, or stdin isn't a real terminal (CI, piped
# input, cron — there's no one to press a key).
#
# Each option below is a model FAMILY, not an exact tag — the size variant
# actually pulled is chosen to match the hardware profile already detected
# above (PROFILE), the same way the existing gemma3 picks already scale
# with VRAM. DeepSeek and MiMo have no tuned prompt set yet (only Gemma
# and Qwen do — see backend/app/prompts/) so picking them falls back to
# the Gemma-tuned prompts until someone adds a dedicated set; see
# docs/ai-prompt-registry.md for how.

PICKED_FAMILY="auto"

if [ "$STATUS_ONLY" = false ] && [ -z "$MODEL_OVERRIDE" ] && [ "$NO_PROMPT" = false ] && [ -t 0 ]; then
  # Labels kept very short on purpose: a redraw that overwrites in place
  # has to know exactly how many terminal ROWS the previous render
  # occupied, and a line wider than the terminal wraps onto extra rows —
  # short labels make that basically never happen even in a narrow
  # editor-integrated terminal panel, and the row-counting below (not
  # save/restore-cursor — that breaks once the menu's height triggers a
  # terminal scroll, since the saved coordinate doesn't follow the scroll)
  # handles it correctly even if it still does.
  MENU_LABELS=(
    "Auto ($OLLAMA_MODEL)"
    "Gemma 3"
    "Qwen 2.5 Coder"
    "DeepSeek R1"
    "MiMo"
  )
  MENU_FAMILIES=(auto gemma qwen deepseek mimo)
  MENU_N=${#MENU_LABELS[@]}
  MENU_SEL=0
  MENU_DEADLINE=10
  MENU_PREV_ROWS=0

  _menu_cols() {
    local c
    c=$(tput cols 2>/dev/null) || c=80
    [ -z "$c" ] || [ "$c" -lt 1 ] 2>/dev/null && c=80
    echo "$c"
  }

  # Rows a single printed line actually occupies once the terminal wraps
  # it — a line longer than the terminal width takes ceil(len/cols) rows,
  # and even an empty line still takes 1.
  _menu_rows_for() {
    local len=${#1} cols=$2
    if [ "$len" -eq 0 ]; then
      echo 1
    else
      echo $(( (len + cols - 1) / cols ))
    fi
  }

  _menu_render() {
    local i cols total=0 line
    cols=$(_menu_cols)
    for ((i = 0; i < MENU_N; i++)); do
      if [ "$i" -eq "$MENU_SEL" ]; then
        line="> ${MENU_LABELS[$i]}"
        printf "\033[1;36m%s\033[0m\n" "$line"
      else
        line="  ${MENU_LABELS[$i]}"
        printf "%s\n" "$line"
      fi
      total=$(( total + $(_menu_rows_for "$line" "$cols") ))
    done
    local left=$(( MENU_DEADLINE - SECONDS ))
    [ "$left" -lt 0 ] && left=0
    line="(auto-selecting in ${left}s)"
    printf "%s\n" "$line"
    total=$(( total + $(_menu_rows_for "$line" "$cols") ))
    MENU_PREV_ROWS=$total
  }

  echo "[model] Pick a model family — up/down + Enter, or wait:"
  SECONDS=0
  _menu_render
  while (( SECONDS < MENU_DEADLINE )); do
    _menu_key=""
    _menu_rest=""
    _menu_budget=$(( MENU_DEADLINE - SECONDS ))
    [ "$_menu_budget" -lt 1 ] && _menu_budget=1
    if read -rsn1 -t "$_menu_budget" _menu_key 2>/dev/null; then
      if [ "$_menu_key" = $'\x1b' ]; then
        read -rsn2 -t 0.05 _menu_rest 2>/dev/null || true
        case "$_menu_rest" in
          "[A") MENU_SEL=$(( (MENU_SEL - 1 + MENU_N) % MENU_N )) ;;  # up arrow
          "[B") MENU_SEL=$(( (MENU_SEL + 1) % MENU_N )) ;;          # down arrow
        esac
      elif [ -z "$_menu_key" ]; then
        break  # Enter confirms the current highlight immediately
      fi
    fi
    # Relative cursor-up from right where the cursor already is — robust
    # against terminal scrolling, unlike a remembered absolute position.
    # \r first to guarantee column 0 before moving up, rather than relying
    # on the terminal having translated the previous \n into an implicit
    # carriage return too.
    printf "\r\033[%dA\033[J" "$MENU_PREV_ROWS"
    _menu_render
  done
  echo ""

  PICKED_FAMILY="${MENU_FAMILIES[$MENU_SEL]}"
  unset -f _menu_render _menu_rows_for _menu_cols

  if [ "$PICKED_FAMILY" = "gemma" ]; then
    # Already the hardware-recommended tag — no remapping needed, just
    # confirm the choice was registered (picking this isn't silently the
    # same as not having picked anything).
    echo "[model] Selected: gemma -> $OLLAMA_MODEL"
    echo ""
  elif [ "$PICKED_FAMILY" != "auto" ]; then
    case "$PICKED_FAMILY" in
      qwen)
        case "$PROFILE" in
          ultra)    OLLAMA_MODEL="qwen2.5-coder:14b" ;;
          high)     OLLAMA_MODEL="qwen2.5-coder:7b" ;;
          medium)   OLLAMA_MODEL="qwen2.5-coder:7b" ;;
          low)      OLLAMA_MODEL="qwen2.5-coder:3b" ;;
          cpu_fast) OLLAMA_MODEL="qwen2.5-coder:3b" ;;
          cpu_slow) OLLAMA_MODEL="qwen2.5-coder:1.5b" ;;
        esac
        ;;
      deepseek)
        case "$PROFILE" in
          ultra)    OLLAMA_MODEL="deepseek-r1:14b" ;;
          high)     OLLAMA_MODEL="deepseek-r1:8b" ;;
          medium)   OLLAMA_MODEL="deepseek-r1:7b" ;;
          low)      OLLAMA_MODEL="deepseek-r1:1.5b" ;;
          cpu_fast) OLLAMA_MODEL="deepseek-r1:7b" ;;
          cpu_slow) OLLAMA_MODEL="deepseek-r1:1.5b" ;;
        esac
        ;;
      mimo)
        # Only one published size as of writing. If Ollama's library
        # doesn't have this exact tag, the pull step below fails loudly
        # with a clear "model not found" — re-run with --model <tag> for
        # whatever the correct current tag is.
        OLLAMA_MODEL="mimo:7b"
        ;;
    esac
    echo "[model] Selected: $PICKED_FAMILY -> $OLLAMA_MODEL"
    echo ""
  fi
fi

# Manual model override (--model) — replaces only the model tag. The
# hardware-tuned timeout/parallelism/question counts for the detected
# VRAM/RAM tier are kept as-is; they're a reasonable starting point for a
# similarly-sized model, but tune backend/.env.hardware by hand afterward
# if the override model is meaningfully bigger or slower than what the
# auto-picked gemma3 tag would have been.
if [ -n "$MODEL_OVERRIDE" ]; then
  OLLAMA_MODEL="$MODEL_OVERRIDE"
fi

QUESTIONS_PER_TEST=$(( MCQ_COUNT + OE_COUNT ))
EST_TIME_PER_TEST=0
case "$PROFILE" in
  ultra)      EST_TIME_PER_TEST=60  ;;
  high)       EST_TIME_PER_TEST=120 ;;
  medium)     EST_TIME_PER_TEST=300 ;;
  low)        EST_TIME_PER_TEST=120 ;;
  cpu_fast)   EST_TIME_PER_TEST=480 ;;
  cpu_slow)   EST_TIME_PER_TEST=600 ;;
esac
EST_TOTAL=$(( EST_TIME_PER_TEST * 3 ))
EST_MIN=$(( EST_TOTAL / 60 ))
EST_SEC=$(( EST_TOTAL % 60 ))

echo "╔══════════════════════════════════════════════════════╗"
printf "║  Profile  : %-40s║\n" "$PROFILE"
if [ -n "$MODEL_OVERRIDE" ]; then
  printf "║  Model    : %-40s║\n" "$OLLAMA_MODEL (--model override)"
else
  printf "║  Model    : %-40s║\n" "$OLLAMA_MODEL"
fi
printf "║  Tests    : 3 types × %d MCQ + %d open-ended%s║\n" \
       "$MCQ_COUNT" "$OE_COUNT" "$(printf '%*s' $(( 21 - ${#MCQ_COUNT} - ${#OE_COUNT} )) '')"
printf "║  Mode     : %-40s║\n" "$([ "$SEQUENTIAL" = true ] && echo 'sequential (safer for VRAM)' || echo 'parallel')"
printf "║  Timeout  : %-40s║\n" "${OLLAMA_TIMEOUT}s per generation"
printf "║  Est. gen : %-40s║\n" "~${EST_MIN}m ${EST_SEC}s for all 3 tests"
if [ "$GLM_ENABLED" = true ]; then
  printf "║  GLM tier : %-40s║\n" "$GLM_MODEL (question bank/rubric/AI-risk)"
else
  printf "║  GLM tier : %-40s║\n" "disabled — $OLLAMA_MODEL handles every task"
fi
echo "╚══════════════════════════════════════════════════════╝"
echo ""

if [ "$STATUS_ONLY" = true ]; then
  echo "[status] Exiting (--status flag). No services started."
  exit 0
fi

# ──────────────────────────────────────────────────────────────
# 3. WRITE HARDWARE ENV FILE
# ──────────────────────────────────────────────────────────────

_TMPENV=$(mktemp)
cat > "$_TMPENV" <<EOF
# Auto-generated by start.sh — do not edit manually.
# Re-run ./start.sh to regenerate based on current hardware.
# Profile: $PROFILE | GPU: $GPU_NAME | VRAM: ${VRAM_GB}GB | CPU cores: $CPU_CORES | RAM: ${TOTAL_RAM_GB}GB

OLLAMA_MODEL=$OLLAMA_MODEL
OLLAMA_TIMEOUT_SECONDS=$OLLAMA_TIMEOUT
TEST_MCQ_COUNT=$MCQ_COUNT
TEST_OE_COUNT=$OE_COUNT
TEST_SEQUENTIAL_GENERATION=$SEQUENTIAL
GLM_ENABLED=$GLM_ENABLED
GLM_MODEL=$GLM_MODEL
EOF

if cmp -s "$_TMPENV" "$HW_ENV" 2>/dev/null; then
  echo "[config] backend/.env.hardware unchanged (skipping write)"
  rm "$_TMPENV"
else
  mv "$_TMPENV" "$HW_ENV"
  echo "[config] Written to backend/.env.hardware"
fi
echo ""

# ──────────────────────────────────────────────────────────────
# 4. START OLLAMA (native, for full GPU/CPU access)
# ──────────────────────────────────────────────────────────────

if ! command -v "$OLLAMA_BIN" &>/dev/null; then
  if command -v ollama &>/dev/null; then
    OLLAMA_BIN="ollama"
  else
    echo "[error] Ollama not found. Install from https://ollama.com"
    exit 1
  fi
fi

if curl -s http://localhost:11434/api/tags >/dev/null 2>&1; then
  echo "[ollama] Already running"
else
  echo "[ollama] Starting (profile: $PROFILE)..."
  # 2 loaded models only when GLM tier is on — otherwise Ollama would
  # unload/reload the single model on every call for no reason, and with
  # GLM on, capping at 1 would thrash between the two models all job long.
  if [ "$GLM_ENABLED" = true ]; then
    OLLAMA_MAX_LOADED=2
  else
    OLLAMA_MAX_LOADED=1
  fi
  OLLAMA_HOST=0.0.0.0:11434 \
  OLLAMA_NUM_PARALLEL=$OLLAMA_NUM_PARALLEL \
  OLLAMA_KEEP_ALIVE=-1 \
  OLLAMA_FLASH_ATTENTION=1 \
  OLLAMA_MAX_LOADED_MODELS=$OLLAMA_MAX_LOADED \
  OLLAMA_NUM_THREADS=$OLLAMA_NUM_THREADS \
    "$OLLAMA_BIN" serve > /tmp/ollama.log 2>&1 &

  echo -n "[ollama] Waiting for server"
  for i in $(seq 1 30); do
    if curl -s http://localhost:11434/api/tags >/dev/null 2>&1; then
      echo " ready"
      break
    fi
    sleep 1
    echo -n "."
  done
fi

# ──────────────────────────────────────────────────────────────
# 5. PULL MODEL (first-time or if missing)
# ──────────────────────────────────────────────────────────────

MODEL_TAG="$OLLAMA_MODEL"
if "$OLLAMA_BIN" list 2>/dev/null | awk 'NR > 1 { print $1 }' | grep -Fxq "$MODEL_TAG"; then
  echo "[ollama] $MODEL_TAG already available"
else
  echo "[ollama] Pulling $MODEL_TAG (first-time download)..."
  "$OLLAMA_BIN" pull "$MODEL_TAG"
fi

if [ "$GLM_ENABLED" = true ]; then
  if "$OLLAMA_BIN" list 2>/dev/null | awk 'NR > 1 { print $1 }' | grep -Fxq "$GLM_MODEL"; then
    echo "[ollama] $GLM_MODEL (GLM tier) already available"
  else
    echo "[ollama] Pulling $GLM_MODEL (GLM tier, first-time download)..."
    "$OLLAMA_BIN" pull "$GLM_MODEL"
  fi
fi

# ──────────────────────────────────────────────────────────────
# 6. START DOCKER SERVICES
# ──────────────────────────────────────────────────────────────

echo "[docker] Starting services..."
cd "$SCRIPT_DIR"
docker compose up -d --no-recreate

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  Talvyn is running                                  ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "║  Frontend   http://localhost:3003                    ║"
echo "║  Backend    http://localhost:9000                    ║"
echo "║  Mailpit    http://localhost:8026  (dev email UI)    ║"
echo "║  Ollama     http://localhost:11434                   ║"
echo "╠══════════════════════════════════════════════════════╣"
printf "║  Profile: %-42s║\n" "$PROFILE  ($GPU_NAME)"
printf "║  Model  : %-42s║\n" "$OLLAMA_MODEL"
if [ "$GLM_ENABLED" = true ]; then
  printf "║  GLM    : %-42s║\n" "$GLM_MODEL (question bank/rubric/AI-risk)"
else
  printf "║  GLM    : %-42s║\n" "disabled — $OLLAMA_MODEL handles every task"
fi
printf "║  Tests  : 3 × (%d MCQ + %d open-ended) — ~%dm gen time ║\n" \
       "$MCQ_COUNT" "$OE_COUNT" "$EST_MIN"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "  Tip: run './start.sh --status' to see the hardware profile without starting."
echo ""
