# Transparent Logo + Favicon Redesign

Date: 2026-06-21

The user reported the favicon/logo didn't match the rest of the app and
asked for a creative, transparent redesign matching the Light Indigo theme.

## What Was Wrong

`TalvynIcon` (`frontend/src/components/TalvynIcon.tsx`, mirrored as
the static favicon `frontend/src/app/icon.svg`) drew its mark on top of an
**opaque rounded-square card** (a light gradient fill + border). That read
fine on a white page, but everywhere it sat on the dark indigo sidebar
(`#312E81`) it showed up as a pale rounded-square "sticker" instead of
blending into the chrome. The mark's own gradient also ran down to
`#312E81` — *exactly* the sidebar's background color — so simply deleting
the card without also fixing the gradient would have made part of the icon
disappear against the sidebar.

## What Changed

Re-verified the canonical palette directly in `tailwind.config.ts` first
(multiple passes have touched these colors since they were first defined),
then:

- Removed the background rect/border entirely — the icon is now fully
  transparent, no card.
- Removed decorative elements that depended on the card for contrast or
  wouldn't read at favicon size: the small "target" circles, three thin
  skill-bar lines, and one of two sparkle accents.
- Changed the mark's gradient from `brand-300 → brand-500 → brand-900`
  (`#A5B4FC → #6366F1 → #312E81`) to `brand-300 → brand-500 → brand-600`
  (`#A5B4FC → #6366F1 → #4F46E5`) — dropping the darkest stop is what fixes
  the "disappears on the sidebar" problem, since `brand-900`/`950` are dark
  enough to vanish with no card behind them. `brand-500`/`600` are the
  app's actual primary-action colors, already proven legible on white
  (every button) and on the sidebar (which uses the still-darker
  `brand-700`/`800` for its own fills).
- Thickened the checkmark stroke (14px → 20px in the 256-unit viewBox)
  after actually rendering it at true favicon size and finding the
  checkmark nearly disappeared at 32px — see Verification below.
- Component's external API (`className`/`decorative`/`ariaLabel`) is
  unchanged, so no call site needed to change.

No new colors were introduced — every value above is an existing `brand`
scale stop already used elsewhere in the app.

## Verification — Actually Looked At It This Time

Every prior visual change in this rebrand effort had only been verified
with `type-check`/`lint`/`build`. This time, real rendering tools were
available in the environment and were used:

1. **First attempt used ImageMagick's SVG delegate** (`inkscape` was
   present but broken — a `symbol lookup error` from a snap library
   conflict). The fallback delegate **silently dropped all
   `<linearGradient>` fills**, rendering the mark and flame as invisible
   and a flat color as the wrong gray. This would have been a false
   negative if trusted — caught it by noticing the render looked nothing
   like the source SVG, not by assuming the tool was correct.
2. **Switched to `google-chrome --headless=new --screenshot`** — an actual
   browser engine, the real target rendering environment — wrapped the SVG
   in minimal HTML pages with `#312E81` and `#FFFFFF` backgrounds (the
   sidebar's and the page's actual colors) and viewed the screenshots
   directly with the Read tool. The icon renders correctly and reads
   clearly on both.
3. Rendered at true 32×32 favicon size the same way; found the checkmark
   stroke had softened to near-invisibility — fixed by thickening it (see
   above) and re-rendered to confirm the improvement. Even after
   thickening, fine detail still softens at 32px due to anti-aliasing at
   that scale — expected and arguably better than the old artwork, which
   had strictly more fine detail (sparkles, thin lines, circles) competing
   for the same pixels.
4. Confirmed genuine transparency at the pixel level (not just "looks like
   the background"): sampled corner/edge pixels with
   `convert icon.png -format "%[pixel:p{2,2}]" info:` → `srgba(0,0,0,0)`
   at every sampled point.
5. Screenshotted the **actual running login page** on the live dev stack
   (`http://localhost:3003/login`) — confirmed the real app, not just an
   isolated mockup, renders the new icon correctly above the "Talvyn"
   wordmark.
6. `npm run type-check`, `npm run lint` (0 errors, 62-warning baseline),
   `npm run build` all pass.

## Still Not Done

The authenticated admin sidebar (dark background) wasn't screenshotted
live — that needs a session cookie injected into headless Chrome, which
wasn't worth the engineering effort given the isolated mockup already used
the sidebar's exact production hex value (`#312E81`) and the result reads
clearly. Worth a quick manual look in a real browser session to be sure.
