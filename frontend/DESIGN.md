# Talvyn design system: "Quiet precision"

Talvyn is sold to international hiring teams. The interface should read like
infrastructure they can trust with a hiring decision: calm, exact, and
document-grade. One element carries the personality: **the score scale**.
Everything around it stays quiet.

Live reference: `/dev/design` (dev builds only; set `ENABLE_DESIGN_PAGE=true`
to view it in a production build).

## Tokens

All colour comes from semantic roles in `src/app/globals.css`. Components
never use raw hex or Tailwind's default palette (`blue-500` and so on).

| Role | Tailwind | Use |
|---|---|---|
| canvas | `bg-canvas` | App background |
| surface | `bg-surface` | Panels, tables, inputs, dialogs |
| sunken | `bg-sunken` | Wells, table header, hover rows, skeletons |
| ink / ink-muted | `text-ink`, `text-ink-muted` | Primary / secondary text (both AA) |
| ink-faint | `text-ink-faint` | **Placeholders, disabled and icons only.** 3:1, so never body text |
| line / line-strong | `border-line`, `border-line-strong` | Hairlines / control borders |
| accent | `bg-accent`, `text-accent` | Primary action, focus ring, selection. Nothing decorative |
| accent-soft | `bg-accent-soft` | Selected rows, accent badges |
| success / warning / danger (+ `-soft`) | | Status meaning only |

Dark mode swaps the variables under `.dark`, so components need no `dark:`
variants except in rare cases. Every text/background pair was checked for
WCAG AA in both themes.

## Type

- **IBM Plex Sans** for all product UI. Weights 400 / 500 / 600. Tabular numerals are on globally.
- **IBM Plex Mono** only for real code, tokens and IDs. Never as a label style.
- **Instrument Serif** only for marketing headlines (`font-serif`). Never inside the app.
- Scale (px): 12 `xs`, 13 `sm`, **14 `base` (app body)**, 16 `md` (reading),
  20 `lg`, 24 `xl`, 32 `2xl`, 44 `3xl`, 64 `display`.
- Sentence case everywhere. No ALL-CAPS labels and no tracked-out eyebrows.

## Shape, depth, motion

- Radius follows hierarchy: `rounded-control` 4px (buttons, inputs) <
  `rounded-menu` 6px (menus, popovers) < `rounded-panel` 8px (panels, dialogs).
- Depth comes from hairlines and surface tone. `shadow-float` is only for
  things that float: menus, dialogs, sheets, toasts.
- Motion runs 150–220ms on `--ease-out-quiet`, and only in answer to an action
  (open, select, confirm). Nothing animates on page load. Reduced motion
  disables it all.

## Components (`src/components/ui`)

`Button`, `Input` / `Textarea`, `Field` (label, hint, error and aria wiring),
`Select`, `Checkbox`, `Switch`, `Badge`, `Tabs`, `Dialog`, `Sheet`
(right-hand detail panel), `DropdownMenu`, `Tooltip`, `toast()` + `Toaster`,
`Table` primitives + `DataTable` (TanStack Table v9: sorting, selection, bulk
actions), `Command` (cmdk), `ScoreMeter`, `EmptyState`, `Skeleton`, `Kbd`,
`ThemeToggle`.

`DataTable` row checkboxes are native inputs on purpose, because TanStack's
handler reads `event.target.checked` and Shift for range selection.

## Writing

- Name things by what users do: "Invite candidates", not "Create invitation entity".
- A button says exactly what happens, and its toast uses the same verb
  ("Revoke invitation" leads to "Invitation revoked").
- Errors say what happened and how to fix it. No apologies.
- Empty states invite the next action.
- Use realistic sample data in every demo or story. No lorem ipsum.

## Never

Glassmorphism, gradient washes or blobs, glow shadows, emoji icons, rows of
identical rounded cards with soft grey shadows, `→` appended to buttons,
`A · B` meta strings, one italicised or coloured word in a headline, or
numbered markers on content that isn't a sequence.
