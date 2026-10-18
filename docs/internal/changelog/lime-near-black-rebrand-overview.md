# Lime + Near-Black Rebrand — Overview

Date: 2026-08-12

A site-wide visual rebrand was requested, referencing two marketplace/
fintech landing pages (SeedUp, Shopvy) — bright chartreuse-lime green +
near-black + warm cream, thick black borders, pill-shaped buttons, punchy
pastel category chips. This supersedes the app's prior brand color (pure
`#00EF00` electric green, itself one of several earlier color systems this
app has been through — see `graphite-indigo-rebrand-phase-a.md` through
`light-indigo-sidebar-retint.md` for that history).

Given the scope (48 page files, 11 `ui/` primitives, ~127 usages of the
shared `.card` class), this is split into phases, same pattern as the
Graphite/Indigo rebrand before it. Each phase ships as its own PR through
the normal CI → merge → deploy pipeline.

**Illustrations**: the reference design leans on hand-drawn character
illustrations. This codebase has zero illustration assets and no capacity
to commission/generate real illustration art — decided with the user to
skip hand-drawn art entirely and use small decorative geometric shapes
(circles/dots, in the spirit of the floating accents already in
`HeroSection.tsx`) instead, on marketing surfaces only.

**Dark mode**: real and shipped, but scoped to the admin dashboard only
(`.admin-shell-root`, toggled via `ThemeToggle.tsx`) — the landing site,
blog, auth pages, and candidate exam flow never render in dark mode. Any
phase touching `.card` or other dual-rendering primitives needs a working
`dark:` variant; phases touching landing/candidate-only surfaces don't.

## What Shipped

| Phase | Area | Status |
| --- | --- | --- |
| 0 | `tailwind.config.ts` color tokens (`brand-*` → lime, `ink-*` → near-black, new `cream`), `Button`/`Badge` bolder styling (2px black borders, pill shape), homepage Hero/Nav, logo/favicon recolor | Shipped (PR #113) |
| 1 | Foundational primitives: `.card`/`.card-hover` (globals.css — the single highest-leverage target, ~127 usages across the admin dashboard and candidate exam flow), `Input`, `StatusBanner`, `Stepper` | Shipped (PR #115) |
| 2 | Remaining landing page sections (Features, Testimonials, HowItWorks, Comparison, SocialProof, BlogTeaser, FinalCta, AssessmentTypes, DashboardMockup) + cream/white section-background rhythm + decorative dot accents; Footer reviewed, no changes needed | Shipped (PR #116) |
| 3 | Auth (login/signup pages, `SignupForm`) + blog (list, post detail, `PostCard`, `ShareButtons`, `ClapButton`) polish | Shipped (PR #117) |
| 4 | Reusable decorative-shape component set | **Skipped** — see below |

### Why Phase 4 was skipped

Phase 4 was conditioned on Phases 1–3 "showing where [decorative shapes are]
actually needed, rather than guessing placement upfront." They didn't:
across all three phases, only one section (`FeaturesSection`) ended up using
a decorative shape accent — two `<span>` dots, ~8 lines, added inline, no
abstraction required. Every other surface (Testimonials, HowItWorks,
Comparison, SocialProof, AssessmentTypes, FinalCta, auth pages, blog) reads
complete without one; the thick borders, pill shapes, and lime/cream
palette already carry the bold-graphic identity the reference design uses
shapes for. `HeroSection`/`FinalCtaSection`'s radial-gradient glows are a
different pattern (full-bleed background effects, not discrete shape
instances) and don't count toward this either.

With ~90% of the app being the admin dashboard — explicitly out of scope
for decorative shapes — a reusable component set would serve a single
existing call site. Building it now would be premature abstraction with no
real payoff. Revisit only if a future page redesign turns up a genuine
recurring need, with concrete usage sites in hand rather than a guess.

## Decisions Made Up Front

1. **Phasing, not one pass** — same lesson as the Graphite/Indigo rebrand:
   scope this large needs reviewable, independently-testable increments.
2. **No illustration assets** — geometric decorative shapes instead of
   hand-drawn art (see above).
3. **Phase priority by leverage** — `.card` first (Phase 1) since one CSS
   class change cascades across the majority of the app's surface area
   before touching any individual page file.

(Per-phase detail — what actually shipped in each, screenshots/verification
notes — lives in the corresponding PR description; this file tracks overall
status and the decisions that apply across every phase.)
