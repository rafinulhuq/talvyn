import assert from "node:assert";
import { newPasswordSchema, passwordConfirmationSchema } from "./passwordPolicy";
import { hashResetToken, RESET_TOKEN_PATTERN } from "./passwordReset";
import { takePasswordResetAttempt } from "./passwordResetRateLimit";

// 1. Password policy
assert.strictEqual(newPasswordSchema.safeParse("short").success, false, "Passwords under 8 chars must fail");
assert.strictEqual(newPasswordSchema.safeParse("12345678").success, true, "8 character password must pass");
assert.strictEqual(newPasswordSchema.safeParse("a".repeat(73)).success, false, "Passwords over 72 bytes must fail");

assert.strictEqual(
  passwordConfirmationSchema.safeParse({ password: "ValidPassword123", confirmPassword: "ValidPassword123" }).success,
  true,
  "Matching passwords must pass"
);
assert.strictEqual(
  passwordConfirmationSchema.safeParse({ password: "ValidPassword123", confirmPassword: "MismatchPassword123" }).success,
  false,
  "Mismatched passwords must fail"
);

// 2. Token hashing and regex
const sampleToken = "a".repeat(64);
assert.strictEqual(RESET_TOKEN_PATTERN.test(sampleToken), true, "64 hex chars must match token pattern");
assert.strictEqual(RESET_TOKEN_PATTERN.test("a".repeat(63)), false, "63 chars must not match");
assert.strictEqual(RESET_TOKEN_PATTERN.test("z".repeat(64)), false, "Non-hex characters must not match");

const hash = hashResetToken("sample-token");
assert.strictEqual(hash.length, 64, "SHA-256 hash must be 64 characters");
assert.strictEqual(/^[0-9a-f]{64}$/.test(hash), true, "Hash must be lowercase hex");

// 3. Rate limiting
const testKey = `test-key-${Date.now()}`;
assert.strictEqual(takePasswordResetAttempt(testKey, 3), true, "First attempt within limit must succeed");
assert.strictEqual(takePasswordResetAttempt(testKey, 3), true, "Second attempt within limit must succeed");
assert.strictEqual(takePasswordResetAttempt(testKey, 3), true, "Third attempt at limit must succeed");
assert.strictEqual(takePasswordResetAttempt(testKey, 3), false, "Fourth attempt exceeding limit must fail");

console.log("passwordReset.selfcheck: all assertions passed");
