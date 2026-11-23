import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { newPasswordSchema, passwordConfirmationSchema, normalizeEmail } from "../../src/lib/auth/password-policy";
import { redeemTokenPath } from "../../src/lib/candidate-session";
import { canViewDocs, roleAtLeast } from "../../src/lib/roles";
import { createRateLimiter } from "../../src/server/rate-limit";
import { safeApiPath, slashRedirectTarget } from "../../src/server/upstream";

describe("safeApiPath", () => {
  it("joins normal segments", () => {
    assert.equal(safeApiPath(["api", "v1", "jd", "3f2a"]), "/api/v1/jd/3f2a");
  });
  it("rejects dot segments that would escape after normalization", () => {
    assert.equal(safeApiPath(["x", "..", "api", "v1", "internal", "emails", "send"]), null);
    assert.equal(safeApiPath(["api", ".", "v1"]), null);
  });
  it("rejects decoded slashes, backslashes, empties and leftover escapes", () => {
    assert.equal(safeApiPath(["api", "v1%2F..", "internal"]), null);
    assert.equal(safeApiPath(["api/v1/internal"]), null);
    assert.equal(safeApiPath(["api", "..\\internal"]), null);
    assert.equal(safeApiPath(["api", "", "v1"]), null);
    assert.equal(safeApiPath([]), null);
  });
});

describe("createRateLimiter", () => {
  it("limits after max hits within the window, then resets", () => {
    const l = createRateLimiter({ max: 2, windowMs: 1000 });
    assert.equal(l.hit("k", 0), true);
    assert.equal(l.hit("k", 10), true);
    assert.equal(l.isLimited("k", 20), true);
    assert.equal(l.hit("k", 30), false);
    assert.equal(l.isLimited("k", 2000), false); // window expired
  });
  it("reject mode refuses new keys when full instead of evicting live ones", () => {
    const l = createRateLimiter({ max: 1, windowMs: 1000, maxKeys: 2, whenFull: "reject" });
    assert.equal(l.hit("a", 0), true);
    assert.equal(l.hit("b", 0), true);
    assert.equal(l.hit("c", 0), false);
    assert.equal(l.isLimited("a", 1), true); // still enforced
  });
  it("evict mode keeps accepting new keys", () => {
    const l = createRateLimiter({ max: 1, windowMs: 1000, maxKeys: 2 });
    l.hit("a", 0);
    l.hit("b", 0);
    assert.equal(l.hit("c", 0), true);
  });
});

describe("redeemTokenPath", () => {
  it("maps each token URL family to its tokenless route", () => {
    assert.deepEqual(redeemTokenPath("/test/abc"), { token: "abc", redirectTo: "/tests/session" });
    assert.deepEqual(redeemTokenPath("/tests/abc/exam"), { token: "abc", redirectTo: "/tests/session/exam" });
    assert.deepEqual(redeemTokenPath("/exam/abc/section"), { token: "abc", redirectTo: "/exam/session/section" });
  });
  it("ignores reserved segments and malformed escapes", () => {
    assert.equal(redeemTokenPath("/tests/session"), null);
    assert.equal(redeemTokenPath("/test/complete"), null);
    assert.equal(redeemTokenPath("/exam/%E0%A4%A"), null);
    assert.equal(redeemTokenPath("/dashboard"), null);
  });
});

describe("roles", () => {
  it("ranks USER < ADMIN < SUPER_ADMIN", () => {
    assert.equal(roleAtLeast("ADMIN", "ADMIN"), true);
    assert.equal(roleAtLeast("USER", "ADMIN"), false);
    assert.equal(roleAtLeast("SUPER_ADMIN", "ADMIN"), true);
  });
  it("never lets DEV or unknown roles satisfy a rank check, but DEV can read docs", () => {
    assert.equal(roleAtLeast("DEV", "USER"), false);
    assert.equal(roleAtLeast("WHATEVER", "USER"), false);
    assert.equal(roleAtLeast(undefined, "USER"), false);
    assert.equal(canViewDocs("DEV"), true);
    assert.equal(canViewDocs("USER"), false);
  });
});

describe("password policy", () => {
  it("enforces 8 chars minimum and 72 bytes maximum (bcrypt limit)", () => {
    assert.equal(newPasswordSchema.safeParse("short").success, false);
    assert.equal(newPasswordSchema.safeParse("12345678").success, true);
    assert.equal(newPasswordSchema.safeParse("a".repeat(73)).success, false);
    assert.equal(newPasswordSchema.safeParse("é".repeat(37)).success, false); // 74 bytes
  });
  it("requires matching confirmation", () => {
    assert.equal(passwordConfirmationSchema.safeParse({ password: "ValidPass123", confirmPassword: "ValidPass123" }).success, true);
    assert.equal(passwordConfirmationSchema.safeParse({ password: "ValidPass123", confirmPassword: "Other12345" }).success, false);
  });
  it("normalizes email case and whitespace", () => {
    assert.equal(normalizeEmail("  Admin@Talvyn.COM "), "admin@talvyn.com");
  });
});

import { parseApiDate } from "../../src/lib/format";
import { tidyExtractedText } from "../../src/lib/domain/jd";

describe("display helpers", () => {
  it("treats zone-less API timestamps as UTC", () => {
    assert.equal(parseApiDate("2026-11-23T10:43:58").toISOString(), "2026-11-23T10:43:58.000Z");
    assert.equal(parseApiDate("2026-11-23T10:43:58+06:00").toISOString(), "2026-11-23T04:43:58.000Z");
    assert.equal(parseApiDate("2026-11-23T10:43:58Z").toISOString(), "2026-11-23T10:43:58.000Z");
  });
  it("joins lone PDF bullets to their line", () => {
    assert.equal(tidyExtractedText("Education\n•\nBSc in CSE\n•\n  2 to 5 years"), "Education\n• BSc in CSE\n• 2 to 5 years");
    assert.equal(tidyExtractedText("Experience\r\n●\r\n2 to 5 years"), "Experience\n● 2 to 5 years");
    // Real PDF output: bullet + zero-width space before the newline.
    assert.equal(tidyExtractedText("Education\n●\u200b\nBachelor of Science"), "Education\n● Bachelor of Science");
  });
});

describe("slashRedirectTarget", () => {
  it("follows only the same path with a trailing slash", () => {
    assert.equal(slashRedirectTarget("http://backend:8000/api/v1/invitations/", "/api/v1/invitations"), "/api/v1/invitations/");
    assert.equal(slashRedirectTarget("/api/v1/invitations/", "/api/v1/invitations"), "/api/v1/invitations/");
  });
  it("refuses any other redirect", () => {
    assert.equal(slashRedirectTarget("http://evil.example/api/v1/internal/emails/", "/api/v1/invitations"), null);
    assert.equal(slashRedirectTarget("/api/v1/invitations/x", "/api/v1/invitations"), null);
    assert.equal(slashRedirectTarget(undefined, "/api/v1/invitations"), null);
  });
});
