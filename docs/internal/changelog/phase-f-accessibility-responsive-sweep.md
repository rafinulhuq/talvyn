# Phase F — Accessibility + Responsive Sweep

Date: 2026-06-21

The final, long-deferred phase of the admin visual rebrand: keyboard focus
states, color contrast (especially the lighter `brand-300`/`400` AI accents
flagged as a risk back in
[graphite-indigo-rebrand-phase-e.md](graphite-indigo-rebrand-phase-e.md)),
and responsive behavior. Unlike every prior phase, this one had real
tooling available — computed actual WCAG contrast ratios instead of
guessing, and used a real authenticated browser session (via Chrome
DevTools Protocol, injecting a live NextAuth session cookie) to screenshot
the real app at mobile and desktop widths, not just isolated mockups.

## Color Contrast — Real Numbers, Real Fixes

Wrote a small contrast-ratio calculator (WCAG relative luminance formula)
and checked every color pairing introduced or touched by this rebrand:

| Pairing | Ratio | Result |
| --- | --- | --- |
| `brand-300`/`400` as AI-accent icon/text foreground on white/light backgrounds | 1.99–2.98 | **Failed** — confirmed the exact risk flagged (and never checked) in Phase E |
| Sidebar group labels (`ink-600`, 11px text) on the sidebar background | 3.83 | **Failed** — needs 4.5:1 for small text, not just the 3:1 large-text/UI threshold |
| `AdminSearch`'s custom focus ring (`ring-brand-100`) | 1.23 | **Failed**, and — worse — it was silently winning over the app's solid global focus ring via CSS specificity |
| Tailwind's default `slate-400` on white | 2.56 | Fails, but pre-existing and used in 50+ places across the whole app predating this rebrand — flagged, not fixed; out of scope for a rebrand-specific sweep |

**Fixed:**
- Every AI-accent icon/text foreground (`SettingsClient.tsx`'s "AI
  Evaluation" section icon, `StatCard.tsx`'s "AI Evaluations" KPI icon, the
  "Preliminary AI Assessment" tag icon, both "AI-Likeness Estimate" panel
  icons, the AI Checker's percentage-gauge fill) moved from `brand-300`/
  `400` to `brand-500`/`600` — still visually distinct from the app's
  primary-action color where there was room to keep that distinction, but
  never at the cost of failing contrast.
- Sidebar group labels: `ink-600` → `ink-500` (clears 4.5:1 comfortably).
- `AdminSearch`'s input: removed the custom `focus:ring-brand-100` entirely
  so the app's actual global focus-visible ring (defined once in
  `globals.css`, already proven solid) applies instead of being silently
  overridden.

## Keyboard Focus — Mostly Already Solid

Found a single global rule in `globals.css` (`*:focus-visible { ring-2
ring-brand-500 ring-offset-2 }`) already covers every focusable element
app-wide, including ones with no explicit focus styling of their own
(Sidebar buttons, NotificationBell, the collapse toggle). Verified this is
genuinely visible even on the dark sidebar by rendering a faithful mockup
with `autofocus` and screenshotting it — the white `ring-offset` layer
makes simple two-color contrast math misleading here; the real rendered
result is a clearly visible halo. No `<div onClick>` keyboard traps found
anywhere in the codebase — every interactive element is a real `<button>`
or `<a>`. The only real bug was the `AdminSearch` override above.

## Responsive — Verified Live, Authenticated, Not Just Isolated Mockups

Logged into the running dev stack as the real Super Admin account via
curl, extracted the session cookie, and drove a headless Chrome instance
via the DevTools Protocol (`Network.setCookie` + `Page.navigate` +
`Page.captureScreenshot`) to screenshot the **actual authenticated app** —
not an isolated HTML mockup — at a 390px mobile viewport and at desktop
width. Checked: the mobile header (hamburger, logo, search, bell, avatar),
the mobile sidebar drawer (nav groups, "Soon" tags, Super-Admin-only Users
item, role label, sign-out), the Dashboard's KPI/Needs-Attention grid
collapsing to one column, and the Settings page's tab grid collapsing to a
stacked list. Everything renders correctly with no overflow or broken
layout.

## Bonus Find: A Real Bug Caught Mid-Screenshot

While reviewing the Settings screenshot, noticed the Database and Redis
health rows said **"check has not run yet"** despite showing a real
latency value (`1.91ms`) right next to an `OK` badge — clear proof the
check *had* run. Root cause: most health checks only set a `detail` string
on their warning/error paths (confirmed against the live
`/api/v1/health/ready` response); the happy path just returns
`status`/`latency_ms`, and `HealthCheckRow`'s naive `check?.detail ??
fallbackDetail` fell through to the generic "never ran" string whenever a
healthy check simply didn't bother setting `detail`. This is the same bug
class fixed for the Ollama row specifically in Phase E
(`ollamaDetail()`), just never generalized to the other six checks.

Added a `resolveDetail()` helper in `SettingsClient.tsx`: if the check
object exists and reports `status === "ok"` with no `detail`, it now shows
"Responding normally (Xms)." instead of the misleading fallback. Applied
to Database, Redis, Worker queue, Storage, Email, Magic links, and Allowed
origins. Verified live, before/after, via screenshot:

```
Before: Database  OK  1.56ms   "Database check has not run yet."
After:  Database  OK  1.27ms   "Responding normally (1.27ms)."
```

## Verification

- `npm run type-check`, `npm run lint` (0 errors, 62-warning baseline),
  `npm run build` all pass.
- Real authenticated screenshots at mobile (390×844) and desktop (800×1600)
  widths, before and after the health-check fix, viewed directly with the
  Read tool.
- Contrast ratios computed programmatically, not eyeballed.

## Still Not Done

This sweep covered what the rebrand itself introduced. It did not attempt
a full WCAG audit of the entire pre-existing app (e.g. the widespread
`slate-400` contrast gap noted above), and didn't check every single page
at every breakpoint — Dashboard, Settings, and the sidebar/drawer were the
representative samples checked live.
