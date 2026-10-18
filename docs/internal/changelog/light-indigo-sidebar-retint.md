# Light Indigo Color System — Sidebar Retint + AI Accent Unification

Date: 2026-06-21

The user shared a reference mockup ("Talvyn Light Indigo Color System")
with an explicit 15-color palette and a lighter, fully indigo-toned sidebar
— in contrast to the graphite-black sidebar shipped in
[graphite-indigo-rebrand-phase-a.md](graphite-indigo-rebrand-phase-a.md).

## What Was Found

Checking the mockup's palette against the existing `brand` Tailwind scale
(`frontend/tailwind.config.ts`) showed every requested color already exists
as a `brand` stop:

| Mockup name | Hex | Already in `brand` as |
| --- | --- | --- |
| Primary | `#312E81` | `brand-900` |
| Surface Dark | `#4338CA` | `brand-700` |
| Surface Elevated | `#EEF2FF` | `brand-50` |
| Accent / Accent Hover | `#6366F1` / `#4F46E5` | `brand-500` / `brand-600` (unchanged) |
| Secondary Accent | `#A5B4FC` | `brand-300` |
| Border | `#E0E7FF` | `brand-100` |
| Text Primary | `#1E1B4B` | `brand-950` |
| Background | `#F8FAFF` | ≈ existing `slate-50` (`#F8FAFC`), negligible diff |
| Text Secondary | `#64748B` | = existing `slate-500`, exact match |
| Success/Warning/Danger/Info | unchanged | already match |

So this wasn't a new palette to add — just the indigo scale already in the
codebase, applied to the sidebar instead of graphite.

## Decisions Made Up Front

Two scope questions were resolved with the user before implementation:

1. **Scope: sidebar only**, not a full app-wide retint of every `slate-*`
   usage (1066 occurrences across 70+ files — too much blast radius to
   verify without a browser available in this environment).
2. **AI accent: drop purple, go fully monochromatic indigo.** The mockup's
   Secondary Accent (`brand-300`) replaces the purple Phase E used to mark
   AI-specific UI. The user explicitly accepted that AI elements lose their
   distinct hue in exchange for matching the reference exactly.

## What Changed

| Area | Change |
| --- | --- |
| `tailwind.config.ts` | `ink` scale's hex values repointed from graphite to indigo (`ink-950`→`#312e81`, `ink-900`→`#4338ca`, `ink-800`→`#3730a3`, `ink-700`→`#4338ca`, `ink-600`→`#818cf8`, `ink-500`→`#a5b4fc`, `ink-400`→`#c7d2fe`) — one config edit, cascades through every existing `ink-*` usage with no other code changes needed. |
| `components/admin/Sidebar.tsx` | Active nav item changed from a translucent `bg-brand-500/15` fill + left accent bar to a solid `bg-ink-900 text-white` filled pill (icon also switched to white), matching the mockup's bold active-pill look. |
| AI-specific UI (9 files from Phase E, plus 2 more found in this pass — the "AI-Likeness Estimate" panels and the Dashboard's "AI Evaluations" KPI card) | `purple-*` → `brand-*`, anchored on `brand-300`/`brand-400` for icons/text and `brand-50`/`brand-100` for backgrounds. Files: `AnalyzeJdButton.tsx`, `GenerateTestsButton.tsx`, `GenerationBanner.tsx`, `jds/[id]/page.tsx` ("AI extracted" tag), `results/[attemptId]/page.tsx` ("Preliminary AI Assessment" tag + both "AI-Likeness" panels), `ai-checker/page.tsx`, `SettingsClient.tsx` (`Section`'s `accent` prop renamed `"purple"`→`"secondary"`; `HealthCheckRow`'s `aiAccent` badge), `SystemStatusCard.tsx`, `AiCheckerClient.tsx` (the gauge's hardcoded `rgb(192 132 252)` → `rgb(165 180 252)`), `StatCard.tsx` (`StatAccent`'s `"purple"` renamed `"secondary"`) + its one call site on the Dashboard. |

## What Was Deliberately Not Touched

Several other `purple-*` usages turned out to be **generic decorative
choices**, not "this is AI" markers — converting them would have been
unrelated scope creep:

- `components/ui/Badge.tsx`'s shared `"purple"` variant, and every call site
  that uses it for non-AI things (Open-ended question badges, "Manually
  scored" badges, Tools & Technologies skill tags, leaderboard "Behavioral"
  test type, `AiCheckerClient.tsx`'s `confidenceVariant()` mapping).
- Several quick-link/icon-chip colors that happen to be purple but have no
  AI connection: the "View Candidates" quick-link cards (Dashboard and JD
  detail page), the candidate detail page's test-attempt icon chip, and the
  Results-by-JD list's JD icon chip.
- `app/page.tsx` — the public marketing landing page, entirely out of scope
  (never part of any admin rebrand phase).

## Verification

- `npm run type-check`, `npm run lint` (0 errors, 62 warnings — same
  baseline as Phase E), `npm run build` all pass.
- Grepped for remaining `purple-`/`"purple"` references after the change;
  every hit confirmed as one of the intentionally-untouched generic cases
  above.
- Not visually verified in a browser — same constraint as every prior
  phase in this rebrand effort. Recommend a manual `npm run dev` check of
  the sidebar (collapsed and expanded, active vs. inactive nav items) and
  the AI Checker/Settings/JD-detail/Dashboard AI indicators before treating
  this as final.
