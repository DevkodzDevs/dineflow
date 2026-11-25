/**
 * One email and one phone per person across DineFlow (0196, 2026-11-25 — the owner: "phone, email and user id must never
 * repeat"). The database refuses a repeat in two ways: the RPCs check first and raise a sentence ("… is already used by
 * another DineFlow account …"), and three unique indexes on profiles catch anything else — whose raw Postgres message
 * ("duplicate key value violates unique constraint "profiles_phone_uniq"") is turned into the same sentence here, so every
 * screen that saves a phone or an email says it the same way.
 */
const BY_INDEX: [RegExp, string][] = [
  [/profiles_phone_uniq/, "This phone number is already used by another DineFlow account. Use a different number."],
  [/profiles_contact_email_uniq|profiles_login_email_uniq/, "This email is already used by another DineFlow account. Use a different email."],
];

export function friendlyContactError(message: string | null | undefined): string {
  const m = message ?? "";
  for (const [re, say] of BY_INDEX) if (re.test(m)) return say;
  return m;
}
