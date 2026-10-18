# Graphite + Electric Indigo Rebrand — Phase E (AI-Specific UI States)

Date: 2026-06-21

Phase E of the admin rebrand (see Phases
[A](graphite-indigo-rebrand-phase-a.md)–[D](graphite-indigo-rebrand-phase-d.md)).
Scope: Step 8 of the original rebrand request — give AI-driven actions and
indicators (generation, extraction, evaluation, model health) a visually
distinct treatment using the secondary accent purple (`#C084FC`), and keep
the language careful about not presenting AI output as a verdict.

## What Changed

| Area | Change |
| --- | --- |
| `AnalyzeJdButton.tsx` | "Extracting skills" loading state: indigo → purple. |
| `GenerateTestsButton.tsx` | "Generating tests" progress panel (header, progress bar, percentage): indigo → purple. |
| `GenerationBanner.tsx` | Same global generating-tests banner: indigo → purple. |
| `jds/[id]/page.tsx` | Added a small "AI extracted" purple tag next to the existing extraction timestamp on the "Extracted Skills & Structure" section. |
| `results/[attemptId]/page.tsx` | The evaluation report's "Preliminary AI Assessment" tag: recolored slate → purple; the disclaimer text now also says "a review signal, not a verdict" — matching the project's existing established phrasing from the AI Checker / AI-likeness-detection features, per the explicit "don't present AI scores as absolute truth" instruction. |
| `ai-checker/page.tsx` | Page header icon: indigo → purple (this page *is* the AI feature). |
| `SettingsClient.tsx` | New `Section` `accent="purple"` option, applied to the "AI Evaluation" config block (icon swapped from a generic gear to `BrainCircuit`). The "AI / Ollama" health row now gets a purple "Local model" tag, and a real fallback detail line (`ollamaDetail()`) instead of a bug: the backend's healthy-path response never sets `detail`, so the row used to show "AI check has not run yet." even when Ollama was fine — it now shows the actual configured/available model. |
| `components/admin/dashboard/SystemStatusCard.tsx` | Same purple-accent treatment and model-name detail line on the Dashboard's compact "Local AI (Ollama)" tile, for consistency with Settings. |

## What Was Deliberately Not Changed

- Sidebar nav active-state color stays indigo for every item, including AI
  Checker — the original request explicitly separates "active navigation
  states" (indigo) from "AI-related labels" (purple); recoloring one nav
  item differently would break the uniform active-state convention.
- `SkillsPanel.tsx`'s existing blue/slate/purple/green category colors were
  left alone — that scheme already encodes meaningful category distinctions
  (must-have vs. nice-to-have vs. tools), and isn't "this came from AI"
  framing; flattening it to all-purple would have lost information for no
  benefit.
- `CodeQuestion`'s dark editor panel (candidate-facing, reviewed in Phase D)
  — unrelated to this phase's admin-side scope.
- No literal "AI Generated" badge was added to `TestCard` — every test on
  this platform is always AI-generated (there's no human-authored
  alternative), so the label would be redundant noise rather than
  information, unlike the JD extraction tag (which marks a specific,
  timestamped AI action on an otherwise-manual JD record).

## Verification

- `npm run type-check`, `npm run lint` (0 errors; one warning fixed —
  `Settings` icon import became unused after `SettingsClient.tsx`'s "AI
  Evaluation" section switched to `BrainCircuit`), `npm run build` all pass.
- Not visually verified in a browser — same constraint as every prior phase.

## Still Deferred

Phase F (final accessibility/loading-state sweep) remains.
