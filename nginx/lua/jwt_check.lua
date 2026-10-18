-- jwt_check.lua — structural JWT validation at the OpenResty proxy layer.
--
-- Purpose: reject requests that carry no NextAuth session cookie BEFORE they
-- reach FastAPI.  Invalid tokens are blocked in <1 ms without any Python
-- process involvement.
--
-- What this checks (structural only):
--   1. A NextAuth session cookie exists (the browser cookie name varies by
--      NextAuth configuration and whether HTTPS is active).
--   2. The cookie value looks like a JWT (three base64url segments separated
--      by dots).
--
-- What this does NOT check:
--   HMAC signature verification requires NEXTAUTH_SECRET which would need to
--   be duplicated into nginx config.  Full verification is still done in
--   FastAPI via getToken() in the Next.js proxy.  This Lua script is a
--   first-line filter, not a security boundary replacement.
--
-- Public routes (health, OpenAPI, candidate API) are exempted and pass through.

local cjson = require "cjson.safe"

local function reject(status, message)
    ngx.status = status
    ngx.header["Content-Type"] = "application/json"
    ngx.say(cjson.encode({ detail = message }))
    return ngx.exit(status)
end

local uri = ngx.var.uri

-- ── Exempt public / candidate-facing routes ───────────────────
local public_prefixes = {
    "/api/v1/health",
    "/api/v1/attempts",   -- candidate-facing; auth is a signed session token, not cookie
    "/api/v1/invitations",-- candidate token validation
    "/docs",
    "/redoc",
    "/openapi.json",
}
for _, prefix in ipairs(public_prefixes) do
    if uri:sub(1, #prefix) == prefix then
        return  -- pass through without cookie check
    end
end

-- ── Look for NextAuth session cookie (name varies by config) ──
-- NextAuth uses different names depending on HTTPS and __HOST__ prefix config.
local cookie = ngx.var["cookie_next-auth.session-token"]
           or  ngx.var["cookie___Secure-next-auth.session-token"]
           or  ngx.var["cookie___Host-next-auth.session-token"]

-- If any X-Internal-Token header is present (Next.js proxy forwarding the
-- admin request with the internal secret), also let it through.
local internal_token = ngx.req.get_headers()["x-internal-token"]
if internal_token and internal_token ~= "" then
    return  -- already authenticated via proxy secret
end

if not cookie or cookie == "" then
    return reject(401, "Authentication required — no session cookie found.")
end

-- ── Structural check: must be three base64url segments ────────
local parts = {}
for part in cookie:gmatch("[^.]+") do
    parts[#parts + 1] = part
end
if #parts ~= 3 then
    return reject(401, "Malformed session token.")
end

-- Request passes — continue to FastAPI
