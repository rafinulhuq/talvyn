# Plan: dark-mode status tints and opacity-modified surfaces

> **Status:** Implemented (2026-08-29).

Reported from two screenshots — the Evaluation Report and the leaderboard's
expanded candidate row — both in dark mode on mobile.

## What's wrong, concretely

### Screenshot 1 — Evaluation Report

| # | Element | Class | Rendered |
|---|---|---|---|
| 1 | "AI Recommendation: No Hire" banner | `bg-danger-light` `#fef2f2` | near-white pink card on the dark page |
| 2 | Four "Hiring Recommendation Criteria" tiles | `bg-emerald-50`, `bg-success-light`, `bg-warning-light`, `bg-danger-light` | four pale patches |
| 3 | Tile borders | `border-emerald-200`, `border-success/20`, `border-warning/20`, `border-danger/20` | light borders |
| 4 | Threshold text inside the tiles | `text-slate-700`, `text-slate-500` | **remapped to light** (`#9fb5af`) and then sitting on a *light* tile — washed out |

Item 4 is the important one: the dark layer already rewrites slate text to a
light colour, so any surface that stays light gets light-on-light. Fixing the
backgrounds is not cosmetic — it is what makes the existing text remap correct.

### Screenshot 2 — Leaderboard expanded row

| # | Element | Class | Rendered |
|---|---|---|---|
| 5 | The whole expanded panel | `bg-slate-50/60` | `#f8fafc` at 60% over the card ≈ `#9ba2a2` — the flat grey block |
| 6 | "Candidate" / "Test" / email / "AI Summary" text on it | `text-slate-400/500/800` (remapped light) | light text on that mid-grey — barely legible |
| 7 | "No Hire" chip | `bg-danger-light` + `border-danger/20` | pale pink chip |

Item 5 is a coverage gap, not a missing rule: the layer remaps `.bg-slate-50`
but **not** `.bg-slate-50\/60`. Its own comment already notes that each opacity
fraction compiles to a separate utility class — that was handled for
`bg-brand-50` and never extended to the rest.

## Root cause

The compatibility layer covers exactly one hue family — slate plus `brand`.
Every **semantic** colour (`success` / `warning` / `danger` / `info`) and every
raw Tailwind palette used for status tinting (`emerald`, `amber`, `red`,
`blue`, `purple`, `green`) has no dark treatment at all, and only bare
utilities are covered, never opacity-modified ones.

A scripted audit over `src/components/admin` and `src/app/(admin)` (resolving
every class against the Tailwind v4 default theme plus this project's
`extend.colors`, and excluding any class that already has a `dark:` sibling on
the same element) found **62 uncovered light-tint classes**. The largest:

```
bg-danger-light    #fef2f2   31 files
bg-success-light   #d9f2ea   14 files
bg-warning-light   #fffbeb   13 files
bg-amber-50                  11 files
bg-red-50                    10 files
border-red-200               11 files
text-danger                  32 files
text-success                 21 files
```

## Approach

**Extend the compatibility layer rather than convert components.**
`bg-danger-light` alone appears in 52 files. Converting each to a `dark:`
variant would be a huge, high-risk diff, and the layer is the mechanism this
codebase already chose for exactly this situation. One file, one place, and
every surface using those tokens is fixed at once — including the ones not in
these two screenshots.

Three rules for the values:

1. **Preserve hue.** A danger tint must still read red and a warning tint
   amber — that is the entire point of a status colour. This is why the tints
   are not folded into the existing desaturated-teal steps.
2. **Match the layer's existing lightness relationships.** Tints land near the
   `#152925` "elevated surface" step so they sit on a card the way the light
   tints sit on white.
3. **Invert the paired text.** `text-danger-dark` (`#b91c1c`) on a now-dark
   tint would be worse than before, so every `*-dark` / `*-700` status text
   token gets a light counterpart. These also improve the many places such
   text already sits directly on a dark card.

**Explicitly not remapped:** `bg-amber-400`, `bg-amber-300`, `bg-green-400`,
`bg-emerald-400`, `bg-red-400`. The audit flags them by luminance, but they are
solid accent fills — progress bars, status dots, heatmap cells — that are meant
to be bright and already read correctly on dark. Remapping them would be the
bug.

## Two further issues the work surfaced

**The page ground was off-hue.** `admin-shell-root` and `bg-slate-50` sit on
the *same* element in `AdminShell.tsx`, so the layer's descendant rule could
never reach it and the page fell through to that element's `dark:bg-slate-950`
— Tailwind's generic navy `#020617` under desaturated-teal cards. Matched on
both classes (specificity 0,3,0, outranking the `dark:` variant's 0,2,0) and
pointed at this layer's own `#0a1512`.

**Muted captions failed AA on the tints.** `text-slate-400/500` maps to
`#6f8983`, which is well calibrated for the card and page (4.6:1 and 4.9:1,
close to what slate-500 gives on white in light mode) but drops to ~3.8:1 on a
tint — below AA for the 10px descriptions in the criteria tiles. Lifting the
token globally would over-brighten muted text everywhere and flatten the
hierarchy the card values were tuned for, so the lift to `#8aa39c` is scoped to
tinted containers only, where it reaches at least 5.0:1.

## Verification

Contrast checked programmatically over the 16 pairs that actually co-occur in
the codebase, against the real dark surfaces. All pass at 4.5:1 or better; the
worst was `bg-slate-50/60` + `text-slate-500`, which went from **1.28:1 to
6.63:1**. Several now beat their own light-mode baseline (the "Maybe" tile's
caption was 3.19:1 in light mode, 5.37:1 in dark).

Both reported screens were then rendered in Chromium from the real component
markup against the **actual compiled CSS** of a production build (built once
with the change and once with `globals.css` stashed, to get a true
before/after). Computed colours read back from the browser:

| | before | after |
|---|---|---|
| banner background | `rgb(254,242,242)` | `rgb(51,26,26)` |
| banner text | `rgb(185,28,28)` | `rgb(245,163,160)` |
| "Maybe" tile | `rgb(255,251,235)` | `rgb(51,40,15)` |
| tile caption | `rgb(111,137,131)` | `rgb(138,163,156)` |
| expanded panel | `#f8fafc` @ 60% | `rgb(13,26,23)` |
| `bg-green-400` bar | unchanged | unchanged |

The audit re-run drops from **62 uncovered classes to 6**, and all six are
correct as they stand: `bg-amber-300/400`, `bg-green-400` (bright accent fills)
and `bg-white/10`, `border-white/10`, `text-ink-500` (all in `Sidebar.tsx`, an
always-dark surface).

## Not done

The layer remains a bridge, as its original comment says. Converting individual
admin surfaces to real `dark:` variants — and retiring the corresponding remaps
— is still the endpoint; this widens the bridge to the colours it always
should have covered rather than moving toward that.
