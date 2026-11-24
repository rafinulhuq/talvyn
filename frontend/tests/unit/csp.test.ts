import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCsp, dsnOrigin, newNonce } from "../../src/lib/csp";

const directive = (csp: string, name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `) || d === name);

test("scripts need the nonce; no unsafe-inline or unsafe-eval in production", () => {
  const csp = buildCsp("abc123");
  const script = directive(csp, "script-src")!;
  assert.match(script, /'nonce-abc123'/);
  assert.match(script, /'strict-dynamic'/);
  assert.match(script, /'wasm-unsafe-eval'/);
  assert.doesNotMatch(script, /'unsafe-inline'|'unsafe-eval'/);
  assert.equal(directive(csp, "object-src"), "object-src 'none'");
  assert.equal(directive(csp, "frame-ancestors"), "frame-ancestors 'none'");
});

test("dev adds unsafe-eval; https adds upgrade-insecure-requests", () => {
  assert.match(directive(buildCsp("n", { dev: true }), "script-src")!, /'unsafe-eval'/);
  assert.equal(directive(buildCsp("n"), "upgrade-insecure-requests"), undefined);
  assert.equal(directive(buildCsp("n", { https: true }), "upgrade-insecure-requests"), "upgrade-insecure-requests");
});

test("a Sentry DSN origin is allowed for connect-src, and only its origin", () => {
  assert.equal(dsnOrigin("https://key@glitch.example.net/3"), "https://glitch.example.net");
  assert.equal(dsnOrigin("not a url"), null);
  assert.equal(dsnOrigin(undefined), null);
  assert.equal(directive(buildCsp("n", { sentryOrigin: "https://glitch.example.net" }), "connect-src"), "connect-src 'self' https://glitch.example.net");
});

test("nonces are random and base64", () => {
  const a = newNonce();
  assert.notEqual(a, newNonce());
  assert.match(a, /^[A-Za-z0-9+/]{22}==$/);
});
