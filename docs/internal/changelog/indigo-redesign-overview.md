# Indigo + Navy Redesign — Overview

Date: 2026-08-14

A second site-wide visual redesign, this time **replacing** the lime-green
+ near-black + cream identity shipped earlier this session
(`lime-near-black-rebrand-overview.md`, PRs #113, #115-#118). Referenced
from three HR-SaaS dashboard mockups (Hirebyte-style landing/dashboard,
AIRecruit360-style admin) that point at a cleaner, more conventional SaaS
look: indigo/blue as the primary brand color, cool light-lavender/white
backgrounds, soft-shadow cards with a thin border, a dark navy sidebar,
pill buttons, and a multi-color chart accent palette.

Confirmed with the user before starting: full replacement (not a second
configurable theme), soft-shadow-and-thin-border cards (not the lime era's
thick 2px black border, not pure shadow-only either), keep the existing
light/dark toggle infrastructure rather than forcing an always-dark
sidebar, and skip illustrations again (no assets, no commissioning
capability — same constraint as the lime rebrand).

Same phased structure as the lime rebrand — this is a repaint, not a new
initiative, so the file boundaries and order are identical; only the token
values and the card/button treatment invert.

## What Shipped

| Phase | Area | Status |
| --- | --- | --- |
| 1 | Foundational tokens + primitives: `tailwind.config.ts` (`brand`→indigo, `ink`→navy-black, `cream`→`mist`, reactivated `shadow-card`/`shadow-card-hover`), `.card`/`.card-hover`, `Button`, `Badge`, `Input`, `StatusBanner`, `BrandLogo`/`icon.svg`, dark-mode CSS vars, `ActivityChart` stray hex | Shipped |
| 2 | Landing page sections (reverses the thick-border treatment back to soft-shadow, retints hardcoded glow gradients and CTA colors) | Shipped |
| 3 | Auth + blog polish | Planned |
| 4 | Transactional email retint (`render_email_shell()` in the backend) | Planned |

## New Color Palette

**`brand` (indigo)**: 50 `#eef2ff` · 500 `#6366f1` · 600 `#4f46e5`
(primary fill) · 700 `#4338ca` (hover/AA-text) · 950 `#1e1b4b`.

**`ink` (navy-black)**: 950 `#0b0e17` (sidebar bg) · 900 `#131726`
(active nav) · 800 `#1e2436` (hover) · down to 400 `#8993a8` (inactive
text).

**`mist` (cool light background, renamed from `cream`)**: DEFAULT
`#f5f6fa` · deep `#eef0f7`.

`success`/`warning`/`danger`/`info` and `surface.*` are unchanged — not
brand identity.

## Phase 1 detail

- Token repoint cascades automatically through every `bg-brand-*`/
  `border-ink-950`/etc. usage by name — the same "retune first" strategy
  used for the lime rebrand's Phase 0/1.
- `.card`/`.card-hover`: thick `border-2 border-ink-950`, no shadow →
  thin `border border-slate-200` + `shadow-card`, hover → `shadow-card-hover`
  + `border-brand-300` + a slight lift (`hover:-translate-y-0.5`).
- `Button.tsx`: `primary`/`danger` drop their border entirely and rely on
  a solid indigo/danger fill + soft shadow (indigo-600 is dark enough for
  white text, unlike lime-500 which needed near-black text); `secondary`/
  `outline` keep a thin border since they're unfilled/light-filled.
- `BrandLogo.tsx`: the lime rebrand's single `#b8ce2a` accent worked on
  both light and dark tiles because lime is bright enough for both. Indigo
  doesn't have that property — a shade dark enough for AA contrast on
  white (`#4338ca`) is nearly invisible on the navy sidebar. Fixed by
  making the accent variant-dependent (`ACCENT_ON_LIGHT`/`ACCENT_ON_DARK`)
  the same way the wordmark's text color already switches with
  `on-light`/`on-dark` — `BrandMark` also gained a `variant` prop
  (defaulting to `on-dark`, matching its only current call site in the
  collapsed sidebar).
- `ActivityChart.tsx` had a stray hardcoded `#b8ce2a` (the "submitted"
  line + its gradient fill) missed by the lime rebrand's own audit —
  caught and retinted here; the sky-blue/purple accent lines are
  deliberately left alone (multi-color chart palette, not brand identity).

## Phase 2 detail

- Every card-like surface in `frontend/src/components/landing/`
  (`FeaturesSection`, `TestimonialsSection`, `HowItWorksSection`,
  `ComparisonSection`, `SocialProofSections`, `AssessmentTypesSection`,
  `DashboardMockup`) converted from `border-2 border-ink-950` (no shadow)
  to `border border-slate-200 shadow-card` with a `shadow-card-hover` +
  `border-brand-300` hover state — matching Phase 1's `.card`/`.card-hover`
  treatment.
- `HeroSection`/`LandingNav`/`FinalCtaSection`'s pill CTAs realigned to
  `Button.tsx`'s actual variants: primary buttons dropped their border and
  moved to solid `bg-brand-600`/`bg-brand-500` fills with white text
  (indigo is dark enough, unlike lime-500); secondary/outline buttons kept
  a thin border instead of the old 2px.
- Caught two more stray hardcoded hex values the lime rebrand's own audit
  missed: `HeroSection`'s radial glow was still lime RGB
  (`rgba(215,240,80,...)`) and `FinalCtaSection`'s was still the
  *original pre-lime* pure green (`rgba(0,239,0,...)`) — both retinted to
  indigo (`rgba(99,102,241,...)`), with `FinalCtaSection`'s opacity bumped
  slightly since indigo reads less luminous than pure green at the same
  alpha against a dark background.
- `FeaturesSection`'s decorative dot accents changed from a thick black
  ring to a thin indigo ring, matching the softer overall treatment.
