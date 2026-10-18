# Talvyn landing page — WordPress HTML

Start with `landing-page.html` for a complete local preview. Keep `landing.css`,
`landing.js`, and `assets/` next to it. No React, Next.js, Tailwind CDN, npm install,
or build step is needed to use the exported files.

## CSS showing as text on the published page

**Cause:** WordPress ran the pasted block through KSES, which deletes `<style>` and
`<script>` tags but keeps the text that was inside them. That is why the stylesheet
prints at the top of the page and nothing is styled. KSES applies to any user
without the `unfiltered_html` capability — Author/Contributor roles, every role on a
multisite except Super Admin, installs with `DISALLOW_UNFILTERED_HTML` in wp-config.php,
and some security plugins (Wordfence, iThemes) that revoke it.

Confirm it in 30 seconds: put `<style>body{background:red}</style>` in a Custom HTML
block, save, reload the editor. If the tags are gone, KSES is stripping them.

**Fix:** keep CSS and JS out of the page body entirely.

1. Page content: one Custom HTML block containing all of `wordpress-html-only.html`.
   Delete the old pasted block first. Do not use `wordpress-paste.html` on this install.
2. CSS and JS: load once, site-wide, by one of the routes below.

### Route A — child theme (preferred, needs file access)

Copy `landing.min.css` and `landing.js` into the child theme, then in `functions.php`:

```php
add_action('wp_enqueue_scripts', function () {
    if (!is_page('landing')) return;            // slug of the landing page
    $dir = get_stylesheet_directory_uri();
    wp_enqueue_style('talvyn-landing', $dir . '/landing.min.css', [], '1');
    wp_enqueue_script('talvyn-landing', $dir . '/landing.js', [], '1', true);
});
```

Cacheable, no size limit, no linter, and JS works. Bump the version string on updates.

### Route B — free plugin (no file access)

WPCode or Simple Custom CSS and JS. Paste raw `landing.min.css` into a CSS snippet
and raw `landing.js` into a JS snippet — no `<style>`/`<script>` wrappers. Scope both
snippets to the landing page if the plugin allows it.

### Route C — Additional CSS (CSS only, last resort)

Appearance → Customize → Additional CSS, paste `landing.min.css`, Publish.
Two caveats: the panel's CSS linter can refuse to publish on syntax it does not
recognise (this file uses `@property`, `oklch()` and nested at-rules), and the CSS is
re-inlined on every page of the site. There is no equivalent field for JavaScript.

### Without JavaScript

The page still renders. The tab strips in the hero and assessment sections hide
themselves and every panel is shown stacked; the mobile menu stays open. Native
video controls are unaffected.

## Which file to paste

| File | Use it when |
| --- | --- |
| `wordpress-html-only.html` | **Default.** One Custom HTML block, CSS/JS loaded separately. Works on every install. |
| `wordpress-paste.html` | Only on an install where `<style>` and `<script>` survive (you are a single-site Administrator and no security plugin strips them). |
| `sections/01..12` + `00-styles.html` + `13-interactions.html` | Section-by-section editing, same `<style>`/`<script>` requirement as above. |

Never combine two of these: duplicate markup means duplicate element IDs.
`landing-page.html` is a local browser preview only — its relative `landing.css`
and `landing.js` links do not follow the HTML into WordPress.

If your Custom HTML block offers separate HTML / CSS / JavaScript panels, put
section markup in HTML, raw `landing.min.css` in CSS, and raw `landing.js` in
JavaScript — no `<style>`/`<script>` wrappers, and load each once per page.

## Paste into WordPress

1. Use a full-width page template. If using this export's navigation and footer,
   choose a template without the theme's duplicate header/footer.
2. Load `landing.min.css` once, site-wide, by Route A, B or C above. Paste the CSS
   only, without `<style>` tags.
3. Add one **Custom HTML** block per section, pasting the corresponding file's
   complete contents in the numbered order below. Keep each `.ov-landing` wrapper.
4. Add `landing.js` once through your theme's frontend script facility, with
   `defer` or after the page content. Alternatively, paste `13-interactions.html`
   after the sections if your installation permits inline scripts.
5. Upload `assets/talvyn.mp4` to your Media Library and replace every
   `assets/talvyn.mp4` occurrence in sections 05 and 09 with its actual media URL.
6. Replace application and blog links as described below, then preview the saved
   frontend page on desktop and mobile.

WordPress may remove scripts or other restricted markup depending on account
capabilities and installation configuration. If it does, load CSS/JS through the
site's theme or approved code facility instead of the block. Without JavaScript,
all seven demo panels are visible, the mobile links remain available, and the
native video controls still work.

Official references: [Custom HTML block](https://wordpress.org/documentation/article/custom-html/)
and [custom CSS](https://developer.wordpress.org/advanced-administration/wordpress/css/).

## Section files, in page order

1. `sections/01-navigation.html` — logo, navigation, login/CTA, mobile menu
2. `sections/02-hero.html` — headline, CTAs, three dashboard preview tabs
3. `sections/03-trusted-by.html` — company names
4. `sections/04-statistics.html` — four metrics
5. `sections/05-how-it-works.html` — walkthrough video and four steps
6. `sections/06-assessment-types.html` — four role examples and three assessment cards
7. `sections/07-features.html` — six features
8. `sections/08-comparison.html` — traditional screening versus Talvyn
9. `sections/09-testimonials.html` — three customer stories
10. `sections/10-blog.html` — three default blog cards
11. `sections/11-final-cta.html` — closing call to action
12. `sections/12-footer.html` — brand, footer links, copyright

These are HTML fragments, not complete documents: do not add `<html>`, `<head>`,
or `<body>` around individual WordPress blocks. Use each numbered section only
once on a page because anchors and tab IDs must remain unique.

## Editing

- Edit text directly between HTML tags in the Custom HTML block. These are not
  native Gutenberg heading/card blocks or Elementor widgets with visual fields.
- Change `href="..."` to edit a button/link destination; change `src="..."` for media.
- `/login` and `/dashboard/jds/upload` currently point to the same host as the
  WordPress page. Replace them with your actual Talvyn application URLs.
- `/blog` and `/blog/<slug>` must point to your actual WordPress posts or the
  existing Talvyn blog. Blog pages themselves are not part of this export.
- `href="/"` on the logo points to the WordPress site's root; change it if the
  landing page is on another path. `#...` links point to sections on this page.
- Keep IDs and `data-ov-*` attributes to retain tabs, mobile navigation, and anchors.
  If you remove a section, remove links pointing to its anchor too.
- Edit role-example text in section 06's four `data-ov-panel` blocks. The JavaScript
  controls visibility only; it contains no marketing copy.
- Icons and logos are inline SVG. Avatar images retain the source's external
  Unsplash URLs; replace them with Media Library URLs for your own images.
- Fonts default to system fonts unless Inter and Plus Jakarta Sans are loaded by
  your WordPress theme. The final `.ov-landing` rule in `landing.css` sets the font
  families. Load those fonts through your theme for closer typography matching.
- The copyright year is a static snapshot; edit it in section 12 as needed.
- Adjust brand colors and spacing in `landing.css`. Existing utility class names
  are retained, but their CSS is already compiled. Adding an arbitrary new
  Tailwind class in the HTML will not generate a new rule; write CSS for it.

## Source and conversion notes

Source composition: `frontend/src/app/page.tsx`. Its ten CMS-ordered sections
are rendered between `LandingNav` and `LandingFooter`. Layouts come from
`frontend/src/components/landing/`, default text from `src/lib/cms/content.ts`,
and default blog entries from `src/lib/cms/defaultBlogPosts.ts`.

This is a snapshot of the checked-out code's defaults, not an export of the live
CMS database. Published CMS text, hidden sections, section order, or blog posts
may differ. Statistics, company names, testimonials, and product claims were
copied from those defaults and have not been verified as real customer evidence.

The existing source has inconsistent walkthrough duration labels (20 seconds
and 1:20); the export retains its copy for you to edit.

React state is replaced by dependency-free JavaScript for the four role examples,
three dashboard tabs, and mobile navigation. Native video controls replace the
custom tour overlay. Testimonial video buttons become normal video links. Scroll
entrance wrappers and the hidden developer-signature interaction are omitted.
Static demo assessments do not create tests or evaluate candidates; those actions
require the original app through the CTA links.

CSS selectors are scoped to `.ov-landing` and compiled from the project's teal /
coral theme. Theme-specific margins, container widths, aggressive CSS, or HTML
sanitization can still affect the result; verify on your actual WordPress site.

## Validation

Chromium checks passed at 320, 390, 768, and 1440px widths with no horizontal page
overflow. Checked section count, unique IDs, local anchor targets, role/dashboard
tab switching, keyboard arrow navigation, mobile-menu opening/Escape closing,
JavaScript-disabled demo visibility, and absence of browser JavaScript errors.

Not tested inside a WordPress installation. Remote image availability, destination
pages, and real playback in your WordPress media environment were not verified.

## Regenerating (optional, developer use)

From the repository root, with existing frontend dependencies installed:

```sh
node wordpress-landing/export.cjs
```

This overwrites the generated HTML and CSS; preserve any manual edits first.
`export.cjs` uses existing frontend packages only and is not uploaded to WordPress.
The original application source files are unchanged.
