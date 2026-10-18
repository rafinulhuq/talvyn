import {
  parsePhoneNumber,
  isValidPhoneNumber,
  getCountries,
  getCountryCallingCode,
  type CountryCode,
} from "libphonenumber-js/core";
// ponytail: "libphonenumber-js/core" requires metadata to be passed explicitly.
// metadata.min.json is the SAME payload the plain top-level "libphonenumber-js"
// package uses internally (not metadata.max) — zero bundle-size difference,
// but it dodges a reproducible tsx/Node CJS-loader bug where the plain
// package's own nested `require("./metadata.min.json")` returns undefined
// when the package is executed (not bundled) via `tsx`. Confirmed via: plain
// `node -e` works, esbuild-bundled output works, `tsc --noEmit` passes — only
// raw `tsx`/`node -r tsx/cjs` execution of the plain package's CJS entry
// breaks, even on latest tsx. Since our own script (phone.selfcheck.ts) must
// run under tsx, importing metadata directly here avoids that trap without
// reintroducing the old metadata.max bloat or the `as any` unwrap hack.
import metadata from "libphonenumber-js/metadata.min.json";

export interface CountryOption {
  code: CountryCode;
  callingCode: string;
}

/** Combines a country + national number into an E.164 string, or null if invalid for that country. */
export function toE164(country: CountryCode, nationalNumber: string): string | null {
  if (!isValidPhoneNumber(nationalNumber, country, metadata)) return null;
  return parsePhoneNumber(nationalNumber, country, metadata).number;
}

/** Re-validates an already-combined E.164 string — the server-side source of truth. */
export function isValidE164(phoneNumber: string): boolean {
  if (typeof phoneNumber !== "string") return false;
  return isValidPhoneNumber(phoneNumber, metadata);
}

/** Re-parses an already E.164-ish string and returns its canonical E.164 form, or null if invalid. */
export function normalizeE164(phoneNumber: string): string | null {
  if (!isValidE164(phoneNumber)) return null;
  return parsePhoneNumber(phoneNumber, metadata).number;
}

export function countryOptions(): CountryOption[] {
  return getCountries(metadata).map((code) => ({
    code,
    callingCode: `+${getCountryCallingCode(code, metadata)}`,
  }));
}
