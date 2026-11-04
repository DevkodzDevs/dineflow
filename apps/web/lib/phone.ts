/**
 * Phone numbers are Indian mobiles (2026-11-04, the owner: "all phone number fields must allow 10 digits only, like the
 * Indian mobile format"). Ten digits, the first 6–9. Whatever is typed or pasted is cut to that: spaces, dashes and
 * brackets go, a pasted +91 / 91 in front of ten digits goes, and so does a trunk 0 in front of ten digits.
 */
export const MOBILE_RE = /^[6-9]\d{9}$/;
export const MOBILE_PATTERN = "[6-9][0-9]{9}";
export const MOBILE_HINT = "10-digit mobile number";

/** What a phone box keeps of what was typed: at most ten digits. */
export function phone10(raw: string | null | undefined): string {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);   // +91 98400 12345
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);   // 098400 12345
  return d.slice(0, 10);
}

/** A complete Indian mobile number. */
export const isMobile = (v: string | null | undefined) => MOBILE_RE.test(phone10(v));

/** Optional field: empty is fine, anything else must be a whole mobile number. */
export const okPhone = (v: string | null | undefined) => !String(v ?? "").trim() || isMobile(v);
