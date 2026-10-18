# Talvyn Brand Icon

Date: 2026-06-21

The user supplied a new SVG brand mark (rocket + checkmark + assessment-card
symbol, in the Light Indigo palette from
[light-indigo-sidebar-retint.md](light-indigo-sidebar-retint.md)) to replace
the generic lucide `BrainCircuit`-in-a-colored-box placeholder that had been
standing in as "the logo" everywhere.

## What Changed

| File | Change |
| --- | --- |
| `src/app/icon.svg` | Replaced the old favicon (a sky-blue `#0ea5e9` square with a `BrainCircuit` glyph — a leftover from before the indigo rebrand, never updated through any prior phase) with the new artwork. Next.js's file-based icon convention picks this up automatically; `layout.tsx`'s `icons.icon`/`icons.shortcut` metadata already pointed at `/icon.svg`, so no other config changed. |
| `src/components/TalvynIcon.tsx` (new) | A reusable component rendering the same artwork as inline SVG, sized via `className`. Gradient `id`s are suffixed with `useId()` so multiple instances on one page (e.g. the marketing page's nav + footer) don't collide — duplicate SVG gradient ids are invalid and can render inconsistently across browsers. |
| `components/admin/Sidebar.tsx`, `components/admin/AdminShell.tsx` (mobile header), `app/test/layout.tsx` (candidate header — also covers `/tests` and `/apply` via their existing re-exports), `app/(auth)/login/page.tsx`, `components/landing/LandingNav.tsx`, `app/page.tsx` (marketing hero mockup + footer) | Swapped the old `<div className="bg-brand-500 rounded-lg"><BrainCircuit .../></div>` icon-box pattern for `<TalvynIcon className="h-X w-X" />` at the same pixel size as the box it replaced. The wrapping `bg-brand-500` box is gone — the new artwork already has its own background/border baked in. |

## What Was Deliberately Not Touched

`BrainCircuit` is still used elsewhere as a generic AI-indicator icon, not
as "the logo" — e.g. the Sidebar's "AI Checker" nav item icon, the AI
Checker page header accent, and Settings' "AI Evaluation" section icon
(from [graphite-indigo-rebrand-phase-e.md](graphite-indigo-rebrand-phase-e.md)).
Those are contextual AI markers, not brand-mark usages, so they were left
as `BrainCircuit` rather than swapped to the new icon.

## Verification

- `npm run type-check`, `npm run lint` (0 errors, same 62-warning baseline),
  `npm run build` all pass — confirmed the `/icon.svg` static route still
  builds and every `BrainCircuit` import that became unused after the swap
  was removed cleanly (no new unused-import warnings).
- Not visually verified in a browser — same constraint as every prior
  phase in this rebrand effort. Recommend a manual check of the favicon,
  sidebar logo, login page, candidate header, and marketing site nav/footer.
