import {
  getCountries,
  getCountryCallingCode,
  isValidPhoneNumber,
  parsePhoneNumber,
  type CountryCode,
} from "libphonenumber-js/core";
// /core + explicit metadata.min.json: same payload the default entry uses,
// but avoids a tsx CJS-loader bug where the default entry's nested
// require("./metadata.min.json") returns undefined when run (not bundled).
import metadata from "libphonenumber-js/metadata.min.json";

export type CountryOption = { code: CountryCode; callingCode: string };

/** Country + national number → E.164, or null if invalid for that country. */
export function toE164(country: CountryCode, nationalNumber: string): string | null {
  if (!isValidPhoneNumber(nationalNumber, country, metadata)) return null;
  return parsePhoneNumber(nationalNumber, country, metadata).number;
}

/** Server-side source of truth: re-validate a combined E.164 string. */
export function isValidE164(phoneNumber: unknown): phoneNumber is string {
  return typeof phoneNumber === "string" && isValidPhoneNumber(phoneNumber, metadata);
}

export function normalizeE164(phoneNumber: string): string | null {
  return isValidE164(phoneNumber) ? parsePhoneNumber(phoneNumber, metadata).number : null;
}

export function countryOptions(): CountryOption[] {
  return getCountries(metadata).map((code) => ({ code, callingCode: `+${getCountryCallingCode(code, metadata)}` }));
}
