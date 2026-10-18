# Talvyn landing page — WordPress Stage 1

Self-contained. Nothing here reads from or writes to `frontend/`.

Stage 1 goal: the landing page live in WordPress, correctly styled, so the
operator can start publishing posts today. The landing page itself is still
developer-edited at this stage — Stage 2 converts the high-churn sections to
native Gutenberg blocks.

```
stage1/
├── page-blocks.html          ← paste this ONCE into the WordPress code editor
├── blocks/01..12.html        ← the same 12 sections as individual files
├── child-theme/
│   ├── landing.min.css       ← copy into the child theme
│   ├── landing.js            ← copy into the child theme
│   └── functions-snippet.php ← append to the child theme's functions.php
├── preview.html              ← open in a browser to check before publishing
└── build-stage1.sh           ← regenerates everything from ../sections
```

## Check it locally first

```sh
xdg-open preview.html
```

This is the exact markup and stylesheet WordPress will get. If it looks right
here and wrong in WordPress, the theme is interfering — not the export.

## 1. Install the CSS and JavaScript

These must NOT go in the page body. WordPress strips `<style>` and `<script>`
from block content for any user without the `unfiltered_html` capability, which
leaves the stylesheet printed on the page as text.

1. Copy `child-theme/landing.min.css` and `child-theme/landing.js` into your
   child theme folder, next to `functions.php`.
2. Append the contents of `child-theme/functions-snippet.php` to that
   `functions.php` (omit its opening `<?php` if the file already has one).
3. Change `is_page('landing')` to your landing page's real slug.

No file access? Use the free WPCode or Simple Custom CSS and JS plugin instead:
paste the raw contents of `landing.min.css` into a CSS snippet and `landing.js`
into a JS snippet — no `<style>` or `<script>` wrappers.

## 2. Create the page content

1. Pages → Add New (or edit the existing landing page). Delete any previously
   pasted block first.
2. Top-right ⋮ (Options) → **Code editor**.
3. Paste all of `page-blocks.html`.
4. Switch back to **Visual editor**. You should now see 12 separate Custom HTML
   blocks in the list view, in order, not one giant block.
5. Publish, then open the page on the real frontend — not the editor preview.

Prefer inserting by hand? Add 12 Custom HTML blocks and paste `blocks/01..12.html`
into them in numerical order. Same result, more clicking.

## 3. Upload the video

`assets/talvyn.mp4` appears 3 times and will not resolve as a relative path.

1. Media → Add New → upload `../assets/talvyn.mp4`.
2. Copy its file URL.
3. Rebuild with that URL baked in, then re-paste `page-blocks.html`:

```sh
VIDEO_URL=https://www.talvyn.com/wp-content/uploads/2026/09/talvyn.mp4 sh build-stage1.sh
```

## What the blocks are locked against

Each block carries `{"lock":{"move":true,"remove":true}}`, so the operator
cannot delete or reorder a section by accident while editing. An administrator
lifts it per block from the block toolbar's ⋮ → Lock. Locking is a UI guard, not
a permission — it stops slips, not determined edits.

## Links

Already rewritten by the build script:

| Link | Points at |
| --- | --- |
| `/login`, `/dashboard/jds/upload` | `https://app.talvyn.com` — the app host |
| `/blog`, `/blog/<slug>`, `/` | relative — served by WordPress |
| `#how-it-works`, `#features`, … | in-page anchors |

Different app origin? `APP_ORIGIN=https://app.example.org sh build-stage1.sh`

The three `/blog/<slug>` links in section 10 point at posts that do not exist in
WordPress yet. They 404 until those posts are published, or until Stage 2
replaces that section with a Query Loop block that lists real posts
automatically. Until then, section 10 is hand-edited on every publish.

## Known gaps at Stage 1

- The landing page is not non-coder editable. That is Stage 2's job.
- Section 10 does not pick up new posts automatically.
- Section 04's stat figures and section 03's company names are hardcoded.
- `shadow-accent-glow` is used 3× in the markup but defined nowhere. It is dead
  in the Next.js app too, so this matches production — it is not an export bug.
