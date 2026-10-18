# Interactive Model Picker in start.sh

Date: 2026-06-22

`./start.sh --model <tag>` (from the per-model prompt registry work) was
the only way to try a model other than the hardware-auto-detected
`gemma3` tag, and it required already knowing the exact tag to type.
Wanted something more discoverable: a short list of named model families
to choose from, without slowing down the common case of just running
`./start.sh` and letting it pick.

## What it does

Running `./start.sh` from a real terminal (no `--model`, no `--no-prompt`,
stdin actually a tty) now shows an arrow-key menu before starting Ollama:

```text
[model] Pick a model family, or wait — the recommended one runs automatically:

  > Auto — recommended for your hardware (gemma3:4b)
    Gemma 3 (general-purpose)
    Qwen 2.5 Coder (code-specialized)
    DeepSeek R1 (reasoning-specialized)
    MiMo (Xiaomi reasoning model)
  (↑/↓ to choose, Enter to confirm — auto-selecting in 10s)
```

Up/Down arrows move the highlight (redrawn in place via ANSI cursor
movement, not a screen clear), Enter confirms immediately, and 10 seconds
of no input runs whatever's highlighted — `Auto` by default, so doing
nothing produces the exact same outcome as before this change. Each
family maps to a tag sized for the hardware tier already detected this
run (`qwen2.5-coder:14b` on the `ultra` profile down to `:1.5b` on
`cpu_slow`, etc.) — the same scaling principle the existing `gemma3:27b`
→ `gemma3:1b` picks already used.

Skipped automatically — falls straight through to the existing
auto-detected default — when: `--model <tag>` was passed (explicit choice
already made), `--no-prompt` was passed (new flag, for scripted/CI use),
or stdin isn't a real terminal (CI, piped input, cron: there's no one to
press a key, and blocking on `read` in that context would either hang or
misbehave depending on what's connected to stdin).

## Implementation notes

Pure bash, no new dependency — `read -rsn1 -t <seconds>` polls for one
keystroke at a time with a shrinking timeout budget (computed from the
bash `SECONDS` builtin against a 10-second deadline, so rapid navigation
doesn't extend the window — it's a hard 10s from when the menu first
renders, not 10s of *idle* time). An arrow key arrives as a 3-byte escape
sequence (`ESC [ A` / `ESC [ B`); on reading a lone `ESC` byte, a second
`read -rsn2 -t 0.05` grabs the other two before the loop's next iteration,
short enough to not be mistaken for a separate later keypress. Enter
arrives as a single byte that `read -n1` reports as an empty string —
checked for `-z` and used to break out of the wait loop early.

## Bug found in real use, twice: redraw drift in narrow terminals

**First version**: redrew by moving the cursor up a fixed number of rows
(`printf '\033[%dA' "$((MENU_N + 1))"`) and re-printing. That assumes every
menu line occupies exactly one terminal row — true in a wide terminal, but
the user hit this running inside an editor's narrower integrated terminal
panel, where the longer labels (the original wording included
parentheticals like "general-purpose") wrapped onto a second row. Each
redraw then moved up too few actual rows, landing partway into the
previous render instead of its start, so old and new text interleaved and
the output grew without bound on every tick.

**Second attempt**: replaced row-counting with `tput sc` (mark the cursor
position once, before the first render) + `tput rc` + `tput ed` (jump back
to that exact saved position and clear everything after it, every
subsequent redraw). This looked right and passed a 40-column PTY test —
but the user hit it again: `tput sc`/`rc` save an *absolute* screen
coordinate, which doesn't follow the terminal if it scrolls. Once the
menu's wrapped lines pushed content past the bottom of the visible panel
(more rows used than the panel is tall, not just wider lines than it is
wide), the terminal scrolled, the saved coordinate now pointed at
whatever scrolled into that spot, and "restore + clear" landed in the
wrong place — each redraw printed a fresh copy below the last instead of
overwriting it, which is exactly the second screenshot the user reported
(stacked "auto-selecting in Ns)" blocks, not unbounded growth this time,
but still not overwriting in place).

**Actual fix**: dropped save/restore entirely. Redraw now computes the
real number of terminal rows the previous render occupied —
`ceil(len(line) / tput cols)` per line, summed across all N option lines
+ the countdown line — and moves the cursor up by *that* amount, relative
to wherever the cursor already is right after printing (`\r` first to
guarantee column 0, since `\n` alone doesn't guarantee a carriage return
on every terminal). Relative movement from "right here" doesn't care
whether the terminal scrolled in between — there's no remembered absolute
coordinate to go stale. Labels were also shortened further (dropped the
parentheticals) so wrapping is rare in the first place, and the
one-time instructional line was pulled out of the redrawn block entirely
(printed once, before the loop starts) so the redrawn portion is just the
5 option lines plus a short countdown line.

Verified with a PTY forced to 40 columns **and** only 10 rows (stressing
both wrapping and scrolling at once, where the first fix's test — default
height — hadn't), firing 7 rapid up/down presses across ~3 seconds: total
output stayed at 2.49KB (bounded, not growing), every redraw's `\r` +
cursor-up + clear sequence visible and landing in the right place, and the
final selection (`deepseek`, after the exact sequence of moves) matched
what the navigation math predicted.

## Verification

Couldn't rely on manually typing into the harness's shell, so verified
with two automated PTY-based tests (`python3` + `pty.openpty()`, writing
raw bytes to the master side while `start.sh --status` ran on the slave
side — `--status` exits right after picking, before touching
Ollama/Docker, so this asserts purely on the picker logic):

- **No input at all, real tty**: 10.0s wall-clock runtime, countdown
  visibly ticked 10 → 0 in the captured output, fell through to the
  `Auto` default (`gemma3:4b` in the test's `--cpu-only` profile) with no
  `[model] Selected: ...` line — confirms the timeout path doesn't hang
  and doesn't misfire as a "selection."
- **Down, Down, Enter**: resolved to `qwen2.5-coder:3b` (the `cpu_fast`
  tier's Qwen size in that test run) and exited in 1.1 seconds — confirms
  arrow navigation moves the highlight correctly and Enter breaks the wait
  early rather than always running the full 10s.
- **Down, Enter** (picking "Gemma 3" explicitly, not "Auto"): resolved to
  `gemma3:4b` with a `[model] Selected: gemma -> gemma3:4b` confirmation
  line — this case needed an explicit fix mid-implementation: the first
  version silently produced no confirmation message when "Gemma 3" was
  picked (since the resulting tag is identical to `Auto`'s), which could
  read as the keypress not having registered at all.
- `bash -n start.sh` (syntax) and a real `< /dev/null` non-tty run (the
  `-t 0` check correctly skips the picker, falls straight to `Auto`, zero
  delay) both clean.

## Still Not Done

DeepSeek R1 and MiMo are selectable but have no tuned prompt set — picking
either currently uses the Gemma-tuned prompts via the registry's existing
fallback (documented in `docs/ai-prompt-registry.md`, not a bug). MiMo's
exact current Ollama library tag wasn't independently verified — the pull
step fails clearly if `mimo:7b` isn't the right name by the time someone
tries it. No live model switching — same restart-to-apply model as
before, just an easier way to pick which one before that restart.
