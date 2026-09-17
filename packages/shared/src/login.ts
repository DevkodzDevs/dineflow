/**
 * Sign-in identifiers for a property.
 *
 * A property signs in with a DineFlow id rather than a mailbox: dine-htl-zeph-00007@dineflow.local.
 * Supabase authenticates by email, so the id has to be shaped like one, but nothing is ever posted
 * to it — the owner's real address is held separately and is where password codes go.
 *
 * The rules live here rather than in the form, because the database applies the same ones when a
 * value arrives from anywhere else. If the two ever disagree, the operator sees one address on
 * screen and a different one is created.
 */
import type { PropertyType } from "./constants";

export const DINEFLOW_DOMAIN = "dineflow.local";

/** res restaurant · htl hotel · rst resort — the segment inside a DineFlow code. */
export const TYPE_CODE: Record<PropertyType, string> = { restaurant: "res", hotel: "htl", resort: "rst" };

/** The four-letter stem of a DineFlow code: letters and digits only, padded with x when short. */
export const nameStem = (name: string) =>
  ((name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 4) || "prop").padEnd(4, "x");

/**
 * Everything a local part may contain. Anything else collapses to a hyphen. Repeated dots and
 * hyphens are squeezed to one, and neither may start or end the part: two dots in a row make an
 * address that some validators reject outright, and the owner would only discover it at sign-in.
 */
export const sanitiseLocalPart = (raw: string) =>
  (raw ?? "").trim().toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/^[-._]+|[-._]+$/g, "");

/**
 * A readable id suggested from the property name and the owner's name. No dashes, just lowercase
 * letters and digits run together, so it reads more like a username than a serial number:
 *
 *     "Tan Resort" + "Priya Kumar"  →  tanresortpriya
 *     "manoooo"    + ""             →  manoooo
 *
 * Leaving the field empty is still the better path: the database then issues the next numbered
 * DineFlow code, which is guaranteed unique. This is for an operator who wants something friendly.
 */
export const suggestLoginId = (name: string, _type: PropertyType, ownerName?: string) => {
  const clean = (s: string) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const propPart = clean(name).slice(0, 14);
  const ownerPart = clean(ownerName ?? "").slice(0, 10);
  const combined = propPart + ownerPart;
  return combined.length >= 3 ? combined : "";
};

/**
 * What will actually be created from what was typed.
 *
 * An entry that already carries an @ is treated as a complete address and left alone — that is how
 * an operator gives a property a real mailbox to sign in with, and appending the house domain to it
 * would produce nonsense like owner@gmail.com@dineflow.local. Anything else is a local part and
 * gets the house domain.
 *
 * Returns an empty string for empty input, which the caller should read as "let the database
 * assign the numbered code".
 */
export const toLoginAddress = (raw: string) => {
  const v = (raw ?? "").trim().toLowerCase();
  if (!v) return "";
  if (v.includes("@")) {
    const [local, ...rest] = v.split("@");
    const domain = rest.join("@").replace(/^@+/, "");
    return domain ? `${sanitiseLocalPart(local)}@${domain}` : `${sanitiseLocalPart(local)}@${DINEFLOW_DOMAIN}`;
  }
  return `${sanitiseLocalPart(v)}@${DINEFLOW_DOMAIN}`;
};

/** null when the value is usable, otherwise why it is not. Empty is usable: it means "assign one". */
export const loginAddressProblem = (raw: string): string | null => {
  const v = (raw ?? "").trim();
  if (!v) return null;
  if ((v.match(/@/g) ?? []).length > 1) return "That has more than one @ in it.";
  const address = toLoginAddress(v);
  const [local, domain] = address.split("@");
  if (!local) return "Add some letters before the @.";
  if (local.length < 3) return "Use at least three characters before the @.";
  if (!/^[^@\s]+\.[a-z]{2,}$/.test(domain ?? "")) return "That domain does not look right.";
  return null;
};
