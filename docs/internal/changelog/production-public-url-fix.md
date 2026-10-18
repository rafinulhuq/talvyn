# Production Public URL Fix: Sign-Out Redirecting to ngrok Instead of Vercel

Date: 2026-06-22

User-reported: the sign-out button (and other app-issued redirects) sent
the browser to `https://citadel-apache-bonelike.ngrok-free.dev` instead of
the clean `https://acmeTalvyn.vercel.app` domain — visible directly in
the address bar after clicking sign-out. This is the production
URL/auth-redirect cleanup item flagged in the very first system audit of
this project and never actually finished.

## Architecture (confirmed live, not assumed)

```
Browser → https://acmeTalvyn.vercel.app
            (Vercel project, vercel-proxy/vercel.json — a pure rewrite
             proxy, not a real Next.js deployment)
          → rewrites every path to →
            https://citadel-apache-bonelike.ngrok-free.dev
            (ngrok static domain, tunneling to the production VPS)
          → nginx :8080 on 116.204.228.250
          → docker-compose.prod.yml's frontend/backend containers
```

The Vercel rewrite is transparent for the *initial* page load — the
address bar stays on the Vercel domain. But any *redirect the app itself
issues* (NextAuth sign-in/sign-out, magic links) is an absolute URL the
browser follows directly, bypassing the rewrite layer entirely. If that
absolute URL is the bare ngrok domain, the address bar visibly jumps to it
— which is what was happening.

## Root cause

`deploy-ngrok.sh` (the script that starts the tunnel and points
`NEXTAUTH_URL`/`MAGIC_LINK_BASE_URL`/etc. at the public-facing URL)
supports exactly this case via `PUBLIC_APP_URL=https://your-vercel-domain
./deploy-ngrok.sh` — but whoever started the tunnel on the production
server ran it without that variable set, so
`APP_PUBLIC_URL="${PUBLIC_APP_URL:-$NGROK_URL}"` fell back to the bare
ngrok URL. `frontend/src/lib/auth.ts`'s `canonicalAuthBaseUrl()` resolves
redirect targets in order — `NEXT_PUBLIC_APP_URL` → `PUBLIC_APP_URL` →
`VERCEL_URL` → `NEXTAUTH_URL` → `baseUrl` — and with the first three
unset/inapplicable on this server, every redirect fell through to
`NEXTAUTH_URL`, which was the raw ngrok domain.

## Fix

Applied directly on the production server (confirmed via SSH, with the
user's explicit go-ahead before touching anything):

- `backend/.env`: `MAGIC_LINK_BASE_URL` and `ALLOWED_ORIGINS` updated to
  `https://acmeTalvyn.vercel.app` (kept the ngrok origin in
  `ALLOWED_ORIGINS` too, harmless to leave and avoids needing to know
  whether anything still calls the API via the bare ngrok URL directly).
- `frontend/.env.local`: `NEXTAUTH_URL`, `NEXT_PUBLIC_APP_URL`, and
  `NEXT_PUBLIC_API_URL` all updated to the same Vercel domain — safe for
  `NEXT_PUBLIC_API_URL` too, since the Vercel rewrite covers every path,
  not just pages, so browser-side API calls to the Vercel domain get
  transparently forwarded the same way.
- Did **not** touch the ngrok tunnel itself, nginx config, or run the
  full `deploy-ngrok.sh` (it also does dev-oriented setup — installing
  nginx via `apt-get`, an unconditional `docker compose up -d` with no
  `-f` flag — not worth the risk for a 5-line env change).

## A second bug found applying the fix: `restart` doesn't reload `env_file`

First attempt used `docker compose -f docker-compose.prod.yml restart
backend frontend` — containers came back up healthy, but the backend's
own health check still reported the *old* ngrok URL. `restart` only
stops and starts the existing container process; it doesn't reread
`env_file`/`environment` values, which are only applied when a container
is *created*. Needed `docker compose -f docker-compose.prod.yml up -d
--no-deps backend frontend` instead (recreates just those two services,
`--no-deps` to avoid touching postgres/redis unnecessarily) — confirmed
the health check then showed the correct URL.

## Verification

All against the real public domain, not just the server's internals:

- `GET https://acmeTalvyn.vercel.app/dashboard` (unauthenticated) →
  redirects to `https://acmeTalvyn.vercel.app/login?callbackUrl=...` —
  stays on the Vercel domain.
- Logged in via a real NextAuth credentials POST against the public
  domain → returned `{"url": "https://acmeTalvyn.vercel.app"}`.
- Signed out via a real NextAuth signout POST → returned
  `{"url": "https://acmeTalvyn.vercel.app"}`, session subsequently
  empty — this is the exact action the user reported as broken.
- Backend health check's `magic_links.base_url` →
  `https://acmeTalvyn.vercel.app`.
- `backend`/`frontend` containers: `RestartCount: 0`, `Status: running`
  after the fix — no crash-loop introduced.

## Still Not Done

This fixes the *redirect* URL, not the underlying ngrok-tunnel
architecture itself — production still depends on a single ngrok process
on the VPS staying up, and a free/low-tier ngrok plan's connection limits
still apply even behind the Vercel rewrite. That's a separate,
larger decision (e.g. a real domain + TLS cert directly on the VPS,
removing the ngrok hop entirely) than this URL-correctness fix.
