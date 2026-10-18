# Admin Sidebar Collapse + Animation Audit

Date: 2026-06-21

Two related requests: (1) the desktop sidebar had no way to hide/collapse
itself, and (2) a general complaint that the admin panel lacks animations
and transitions. This covers both — builds on the Graphite + Electric
Indigo rebrand (Phases A–E, see `docs/changelog/index.md`).

## Sidebar Collapse

The desktop sidebar (`components/admin/Sidebar.tsx`) was always fixed at
`w-64` with no way to reclaim screen width. The **mobile** drawer already
had a hide/show affordance (hamburger button + `animate-slide-in-left`/
`animate-slide-out-left`) — this was a desktop-only gap.

- Added a collapse toggle (small circular chevron button on the sidebar's
  right edge, classic admin-dashboard pattern) that shrinks the sidebar from
  `w-64` to a `w-16` icon-only rail via `transition-[width] duration-300`.
- Nav labels, group headers, the "Talvyn" wordmark, the system-status
  text, and the email address all fade out via `opacity`+`width` transitions
  rather than disappearing abruptly; icons get a `title` tooltip when
  collapsed so the rail stays usable.
- The sign-out button is hidden in collapsed mode (it doesn't fit in a 64px
  rail next to the avatar) — expanding the sidebar restores it.
- State persists across page loads via `localStorage`
  (`talvyn_sidebar_collapsed`), synced in a `useEffect` after mount
  (not a lazy `useState` initializer) specifically to avoid a server/client
  hydration mismatch on the main layout shell — a one-frame "starts
  expanded, then collapses" flash is preferred here over a hydration
  warning on every admin page.
- The mobile drawer instance of `Sidebar` is unaffected: `collapsed`/
  `onToggleCollapse` are only passed to the desktop instance in
  `AdminShell.tsx`, so the mobile drawer always renders full-width as
  before — collapsing an already-hidden-by-default drawer would be
  redundant with the hamburger toggle it already has.

## Animation Audit

Went through every admin (and candidate, where shared components overlap)
UI surface for missing transitions. Already in good shape, no changes
needed:

- Page-level navigation (`PageTransition` + `animate-page-enter`, already
  respects `motion-reduce`).
- Button hover/active states (`transition-colors`), card hover
  (`card-hover` → `transition-shadow`).
- Mobile sidebar drawer (already had slide + backdrop fade).
- `recharts` Area charts on the Dashboard already animate on mount by
  default (no `isAnimationActive={false}` override was set) — free, no
  action needed.

Found and fixed several real gaps — UI that appeared/disappeared instantly
with zero transition:

| Component | Gap | Fix |
| --- | --- | --- |
| `NotificationBell.tsx` | Dropdown panel popped in/out instantly | `animate-fade-in` |
| `AdminSearch.tsx` | Search results dropdown popped in/out instantly | `animate-fade-in` |
| `ConfirmDialog.tsx` | Backdrop appeared instantly (only the dialog card faded) | `animate-fade-backdrop` on the backdrop |
| `components/candidate/SubmitConfirm.tsx` | Same backdrop gap, candidate-facing equivalent | Same fix |
| `ExtractedTextPanel.tsx` | Expanded text content appeared instantly | `animate-fade-in` |
| `SettingsClient.tsx` | Tab content swapped instantly with no transition | `key={activeTab}` + `animate-fade-in`, same remount-to-replay technique `PageTransition` already uses |
| `app/test/[token]/exam/page.tsx` | The integrity "blocked action" toast popped in/out instantly | `animate-fade-in` |
| `components/ui/Stepper.tsx` | Step dot color changes (done/current/upcoming) snapped instantly | `transition-colors` |

All additions reuse existing keyframes already defined in
`tailwind.config.ts` (`fade-in`, `fade-backdrop`) — no new animations or
dependencies, and all respect `motion-reduce` like the rest of the app.

## Not Done (Bigger Scope, Flagging Rather Than Assuming)

These are real opportunities but meaningfully larger/cosmetic asks, not
"missing transition" bugs — flagging so you can decide if you want them as
a follow-up:

- A skeleton-to-content cross-fade (today, a loading skeleton just
  disappears and real content pops in — no crossfade). Doing this properly
  means restructuring several `loading.tsx`/data-fetching boundaries, not a
  one-line class change.
- KPI numbers "counting up" on the Dashboard instead of appearing at their
  final value instantly.
- Staggered entrance for list/table rows (results inbox, candidates list,
  JD list) instead of all rows appearing at once.

## Verification

- `npm run type-check`, `npm run lint` (0 errors, 62 warnings — same
  baseline as Phase E), `npm run build` all pass.
- Not visually verified in a browser — same constraint as every prior
  phase in this rebrand effort (no browser tool available in this
  environment).
