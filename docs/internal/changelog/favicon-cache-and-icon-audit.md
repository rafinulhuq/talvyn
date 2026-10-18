# Favicon Cache Fix + Full Icon/Branding Audit

Date: 2026-06-21

The user reported the home page favicon still showed the old icon despite
the redesign in
[transparent-logo-redesign.md](transparent-logo-redesign.md), and asked for
every icon in the app to be checked and aligned with the new design.

## Root Cause: The Favicon Was Never Cache-Busted

`frontend/src/app/layout.tsx` declared `metadata.icons = { icon: "/icon.svg",
shortcut: "/icon.svg" }` explicitly. That renders a literal, unversioned
`<link rel="icon" href="/icon.svg">` — the same URL every time, regardless
of how many times the file's content changes. Browsers cache favicons very
aggressively, often for the life of the tab/profile, so once a browser had
fetched the old icon once, it had no signal that anything changed and kept
showing it indefinitely.

Next.js's App Router has a file-based icon convention (just placing
`icon.svg` under `app/`) that's *separate* from the `metadata.icons` API and
auto-generates a **content-hashed** URL. The explicit metadata override was
bypassing that entirely.

**Fix:** removed the explicit `icons` block from `layout.tsx` and let
Next.js's file convention take over. Confirmed via the actual rendered HTML:

```
Before: <link rel="icon" href="/icon.svg"/>
After:  <link rel="icon" href="/icon.svg?icon.a541fde7.svg" sizes="any" type="image/svg+xml"/>
```

Verified on two different routes (`/` and `/login`) — both render the
hashed URL. Any future edit to `icon.svg` will produce a new hash
automatically, so this class of "I changed it but nothing updated" bug
can't recur. Existing visitors' browsers will still need one fetch of the
new URL (unavoidable — there's no way to remotely evict another browser's
cache), but every new visit and every reload-after-update now works.

## Full Icon/Branding Audit

Searched the whole repo (frontend + backend) for anything still using the
old pre-rebrand branding, not just files I remembered touching:

| Found | Where | Status |
| --- | --- | --- |
| `TalvynIcon` usages | Sidebar, AdminShell, candidate header, login, marketing nav/footer | All already consistent — no missed call sites, nothing added a logo without going through the component since the last pass. |
| `BrainCircuit` (generic AI-indicator icon, not the logo) | Sidebar's AI Checker nav item, AI Checker page header, Settings "AI Evaluation" section, the JD "AI extracted" tag, `AiCheckerClient.tsx` | Correctly left alone — these were already deliberately scoped as "not the logo" in earlier passes. |
| PWA manifest / `apple-icon` / OG image | — | None exist in the project. Nothing to align. |
| **Candidate invitation email** (`backend/app/services/email_service.py`) | Header bar, CTA button, and raw-link text color all hardcoded to the old sky-blue `#0ea5e9` | **Real leftover, fixed** — none of the prior rebrand passes had ever reviewed this file for branding (it was only previously touched for SMTP functionality, in an unrelated earlier session). Changed all three to `#6366f1` (the app's actual `brand-500`/Accent color). |

The email's light-blue "What's included" info box (`#f0f9ff`/`#bae6fd`/
`#0369a1`) was deliberately left as-is — that's a separate informational
callout color, not the brand-action color, consistent with how the app
itself still uses a distinct cyan/`info` token elsewhere (e.g. the AI
Checker) rather than forcing every blue-ish thing to indigo.

## Verification

- Rendered the actual invitation email HTML (calling
  `_build_invitation_html()` directly with realistic arguments) and
  screenshotted it with `google-chrome --headless` — confirmed the header
  bar and CTA button are now indigo, not sky-blue.
- `ruff check` and a direct Python import both pass on
  `email_service.py`.
- Grepped the entire repo (backend + frontend, not just `src/`) for the old
  hex value (`0ea5e9`) — zero remaining matches.
- `npm run type-check`, `npm run lint` (0 errors, 62-warning baseline),
  `npm run build` all pass after the `layout.tsx` metadata change.
- Confirmed the hashed favicon URL renders on two live routes via curl
  against the running dev server.

## Still Not Done

Resend/SMTP delivery of the actual email through Mailpit wasn't exercised
end-to-end in this pass — only the HTML generation function was rendered
directly and screenshotted. The color fix is in the same code path
`send_invitation_email()` already uses, so it should apply automatically,
but a real send-and-view-in-Mailpit check would be the more complete
confirmation.
