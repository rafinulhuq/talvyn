# Proxy Trailing-Slash Redirect Fix (Admin Search and Friends)

Date: 2026-06-21

The user reported "Search failed." in the admin global search — the same
symptom reported once before, much earlier, against a production
deployment (at the time attributed to a stale backend deploy, never
confirmed). This time it was reproduced against the current build, so it
was actually debugged end-to-end instead of inferred.

## Root Cause

`frontend/src/lib/api/search.ts` called the proxy at
`/api/v1/search/?query=...` — **with** a trailing slash before the query
string, matching how the FastAPI route happens to be registered
(`@router.get("/")`).

But the client-side request doesn't go to FastAPI directly — it goes
through `frontend/src/app/api/proxy/[...path]/route.ts`, a catch-all proxy
route. Next.js's catch-all dynacmic segments (`[...path]`) never preserve a
trailing slash from the incoming URL, and — separately — Next.js's own
`trailingSlash: false` default normalizes any incoming request URL that
has a trailing slash on its last segment, **redirecting it (308) before
the request ever reaches the proxy handler at all**.

Confirmed by driving headless Chrome via the DevTools Protocol (injecting
a real authenticated session cookie, typing into the actual search box,
and capturing the real Network panel events) — not by reading code and
guessing:

```
Request:  GET /api/proxy/api/v1/search/?query=teacher&limit_per_group=5
Redirect: 308 -> /api/proxy/api/v1/search?query=teacher&limit_per_group=5
Response: 200 (on the redirected URL)
```

The redirect *was* being followed successfully in this environment, so
the search worked when tested directly — but this is an unnecessary,
fragile extra hop: an additional browser-level round trip that depends on
redirect-following behavior holding up consistently across browsers,
proxies, and network conditions, for literally no reason, since the
trailing slash never survives the journey to the actual backend anyway.

## The Fix

Removed the trailing slash from every client-side API call that had one —
found by grepping the whole `lib/api/` directory, not just the one file
that was reported broken:

| File | Before | After |
| --- | --- | --- |
| `lib/api/search.ts` | `/api/v1/search/?...` | `/api/v1/search?...` |
| `lib/api/candidates.ts` (`list()`) | `/api/v1/candidates/?...` | `/api/v1/candidates?...` |
| `lib/api/webhooks.ts` (`list()`, `create()`) | `/api/v1/admin/webhooks/` | `/api/v1/admin/webhooks` |

The proxy still forwards to FastAPI's `/api/v1/.../` (with slash) form
correctly — FastAPI's own `redirect_slashes` default handles the no-slash
→ with-slash redirect **server-side**, inside the proxy's own `axios`
call (which follows redirects by default, same as any Node HTTP client),
entirely invisible to the browser. The browser now makes exactly one
request and gets back exactly one response — no redirect at all.

## Verification

Re-tested the identical live, authenticated, real-browser reproduction
after the fix:

```
Request:  GET /api/proxy/api/v1/search?query=teacher&limit_per_group=5
Response: 200 (directly, no redirect)
```

Screenshotted the result: "No matches" (the dev database is empty, so this
is a correct, successful zero-result search, not an error) with no
"Search failed." message.

- `npm run type-check`, `npm run lint` (0 errors, 62-warning baseline),
  `npm run build` all pass.
- Grepped `lib/api/` afterward for the same pattern (trailing slash before
  a query string or string end) — zero remaining matches.

## Still Open

This doesn't explain with certainty why the *original*, much earlier
report (against a production Vercel deployment) showed the same symptom —
that one was tentatively attributed to a stale backend deploy at the time
and never independently confirmed. It's plausible the underlying cause was
this exact redirect dependency behaving differently under a real
production reverse-proxy/CDN than in this local Docker Compose setup,
where redirect-following, cookie forwarding, or method preservation across
a 308 can be less consistent than on `localhost`. This fix removes that
dependency either way, but the original incident's root cause was never
separately confirmed.
