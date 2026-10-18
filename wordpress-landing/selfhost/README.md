# Self-hosted WordPress on the prod box

## Why

`talvyn7.wordpress.com` is a free WordPress.com plan. On that tier:

- plugins require the Business plan
- custom CSS requires a paid plan
- custom JavaScript is unavailable below Business
- `<style>` and `<script>` are stripped from Custom HTML blocks

That last one is the original bug — the stylesheet printed as text on the page.
It is a platform limit, not something to fix in the export. The Stage 1 files
work correctly on self-hosted WordPress and cannot work on that account.

Self-hosted WordPress is free software. This stack runs it on the box already
running the app.

## Deliberately not in docker-compose.prod.yml

Deploy is push-to-main with a runner on the prod box. Adding services to the
prod compose file ships them the moment you push. This stack is separate and
brought up by hand, shares no network or database with the app, and can be torn
down without touching anything else.

## 1. Run it locally first

```sh
cd wordpress-landing/selfhost
cp .env.example .env
openssl rand -base64 32   # paste into WORDPRESS_DB_PASSWORD
openssl rand -base64 32   # paste into WORDPRESS_DB_ROOT_PASSWORD
docker compose -f docker-compose.wordpress.yml up -d
```

Open <http://localhost:8080> and run the WordPress installer.

Then do Stage 1 for real — plugins and custom CSS now work:

1. Plugins → Add New → `Simple Custom CSS and JS` → Install → Activate
2. Paste `../stage1/child-theme/landing.min.css` into Add Custom CSS
3. Paste `../stage1/child-theme/landing.js` into Add Custom JS
4. Pages → Add New → ⋮ → Code editor → paste `../stage1/page-blocks.html`
5. Media → Add New → upload `../assets/talvyn.mp4`

## 2. Move the existing content across

If there are posts on `talvyn7.wordpress.com`:

- On WordPress.com: Tools → Export → Export all → download the XML
- On the new site: Plugins → Add New → `WordPress Importer` → Tools → Import →
  WordPress → upload the XML → tick "Download and import file attachments"

Do this before you cancel anything on WordPress.com.

## 3. Point www at it

Only after the page looks right locally.

1. Edit `.env`: `WORDPRESS_SITE_URL=https://www.talvyn.com`
2. `docker compose -f docker-compose.wordpress.yml up -d` on the prod box
3. Cloudflare Zero Trust → Networks → Tunnels → `talvyn-tunnel-prod` →
   Public Hostnames → change `www.talvyn.com` from `http://localhost:3003`
   to `http://localhost:8080`

`app.talvyn.com` keeps pointing at `localhost:3003`. Nothing about the Next.js
app changes — [middleware.ts:108](../../frontend/src/middleware.ts#L108) already
redirects `app.talvyn.com/` and `/blog` to `www`, which will now land on
WordPress. That is the behaviour you want.

`WORDPRESS_SITE_URL` is the one that locks you out if it is wrong: WordPress
rewrites its own URLs from it, so setting it to the live domain before the
tunnel points here makes the admin unreachable. Change it last.

## Left over after cutover

- `sitemap.ts` and `robots.ts` still emit `www.talvyn.com/`, `/blog` and
  `/blog/<slug>` off `getSiteUrl()`. Once WordPress owns `www`, two systems
  publish a sitemap for the same host. Pick one owner.
- The Next.js landing page and its `/blog` routes become unreachable at `www`,
  along with the CMS editor at `/dashboard/cms` that feeds them.

## Not verified

Docker is not installed on the machine these files were written on. The compose
YAML parses, but the stack has never been started. Both image tags
(`wordpress:php8.3-apache`, `mariadb:11`) are official but unpinned and were not
checked against Docker Hub — confirm they resolve before relying on this.
