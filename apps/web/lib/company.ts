/**
 * Who DineFlow is, in law.
 *
 * Every legal page reads from here, so the entity name, the address and the grievance officer are
 * written once and are the same on all four. Anything set to null is a fact only the owner of the
 * business can supply — this file will not invent a registered address or a GSTIN, and the pages
 * render a visible gap where one is missing rather than quietly printing a placeholder that a
 * payment gateway or a court would read as a statement of fact.
 *
 * Fill these in before the legal pages go in front of Razorpay's onboarding team. `missingFacts()`
 * below lists what is still blank; /legal shows that list to signed-in owners.
 */
export const COMPANY = {
  /** The trading name people know. */
  product: "DineFlow",

  /** ── FILL THESE IN ────────────────────────────────────────────────────
   *  The registered name of the company or LLP that actually contracts with
   *  customers, exactly as it appears on the certificate of incorporation. */
  legalName: null as string | null,
  /** "Private Limited Company", "Limited Liability Partnership", "Sole Proprietorship"… */
  entityType: null as string | null,
  /** CIN for a company, LLPIN for an LLP. Leave null for a proprietorship. */
  registrationNo: null as string | null,
  /** The registered office, as filed. Street on one line, then city, state and PIN. */
  registeredAddress: null as string | null,
  /** GSTIN of the entity that raises the subscription invoice. */
  gstin: null as string | null,
  /** A number a customer can actually ring during support hours. */
  phone: null as string | null,

  /** ── Already true ─────────────────────────────────────────────────── */
  site: "dineflow.cloud",
  supportEmail: "support@dineflow.cloud",
  /** Reaches a person, not a queue: required by the IT Rules 2021 and the DPDP Act 2023. */
  grievanceEmail: "grievance@dineflow.cloud",
  privacyEmail: "privacy@dineflow.cloud",
  /** The named Grievance Officer. A role title alone does not satisfy the rules — a name is required. */
  grievanceOfficer: null as string | null,

  /** Where a dispute is heard. Change if the registered office is elsewhere. */
  jurisdiction: "Chennai, Tamil Nadu",
  governingLaw: "India",

  /** The date the current wording took effect. Update whenever the text changes materially. */
  effective: "2026-09-30",

  /** Working hours for support, in the only timezone this product runs in. */
  supportHours: "Monday to Saturday, 9:00 to 21:00 IST",
  /** What the grievance officer promises. The IT Rules give 15 days as the outer limit. */
  grievanceDays: 15,
} as const;

type Fact = { key: string; label: string; why: string };

/** The blanks that must be filled before these pages are fit to publish. */
export function missingFacts(): Fact[] {
  const need: Fact[] = [];
  const add = (key: keyof typeof COMPANY, label: string, why: string) => {
    if (!COMPANY[key]) need.push({ key, label, why });
  };
  add("legalName", "Registered name", "Every page names the party a customer is contracting with.");
  add("entityType", "Entity type", "Company, LLP or proprietorship — it changes who is liable.");
  add("registeredAddress", "Registered office address", "Razorpay will not approve a merchant without one, and the IT Rules require it.");
  add("gstin", "GSTIN", "Subscription invoices are not valid tax invoices without it.");
  add("phone", "Support telephone", "A contact page with no telephone number fails Razorpay's review.");
  add("grievanceOfficer", "Grievance Officer name", "The IT Rules 2021 and the DPDP Act 2023 both require a named person.");
  add("registrationNo", "CIN / LLPIN", "Required for a company or LLP; leave blank for a proprietorship.");
  return need;
}

/** True when the pages are safe to show a payment gateway or a regulator. */
export const legalPagesReady = () => missingFacts().filter((f) => f.key !== "registrationNo").length === 0;

/** The address as a block, or a marker that says plainly it is not set. */
export const addressLines = () => (COMPANY.registeredAddress ?? "").split("\n").filter(Boolean);
