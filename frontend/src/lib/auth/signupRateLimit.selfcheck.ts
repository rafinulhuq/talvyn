import assert from "node:assert";
import { isSignupRateLimited, recordSignupAttempt } from "./signupRateLimit";

const key = "203.0.113.7";
assert.strictEqual(isSignupRateLimited(key), false, "a fresh key must not be rate-limited");

for (let i = 0; i < 4; i++) recordSignupAttempt(key);
assert.strictEqual(isSignupRateLimited(key), false, "4 attempts must still be under the limit");

recordSignupAttempt(key);
assert.strictEqual(isSignupRateLimited(key), true, "the 5th attempt must trip the limit");

const otherKey = "198.51.100.9";
assert.strictEqual(isSignupRateLimited(otherKey), false, "a different key must be tracked independently");

console.log("signupRateLimit.selfcheck: all assertions passed");
