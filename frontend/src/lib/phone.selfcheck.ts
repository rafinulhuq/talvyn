import assert from "node:assert";
import { toE164, isValidE164, normalizeE164, countryOptions } from "./phone";

const valid = toE164("US", "2133734253");
assert.strictEqual(valid, "+12133734253", "a valid US number must format to the expected E.164 string");

const invalid = toE164("US", "123");
assert.strictEqual(invalid, null, "a too-short number must be rejected");

assert.strictEqual(isValidE164("+12133734253"), true, "a valid E.164 string must pass re-validation");
assert.strictEqual(isValidE164("not-a-phone-number"), false, "garbage must fail re-validation");
assert.strictEqual(isValidE164(null as any), false, "null input must return false, not throw");
assert.strictEqual(isValidE164(undefined as any), false, "undefined input must return false, not throw");

assert.strictEqual(
  normalizeE164("+1 (213) 373-4253"),
  "+12133734253",
  "a loosely-formatted valid E.164-ish number must normalize to the canonical E.164 string"
);
assert.strictEqual(normalizeE164("not-a-phone-number"), null, "garbage must return null, not throw");

const options = countryOptions();
assert.ok(
  options.some((o) => o.code === "US" && o.callingCode === "+1"),
  "country list must include US with +1"
);
assert.ok(options.length > 100, "country list must include the full set of ISO countries");

console.log("phone.selfcheck: all assertions passed");
