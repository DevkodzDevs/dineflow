/**
 * Indian indirect-tax and compliance reference, shared by the web app, the print pipeline and
 * Master control. Everything here is data, not opinion: GST state codes, SAC codes, the current
 * rate schedule for hospitality, what a tax invoice must carry, and the statutory due-date rules.
 *
 * Rates and dates change by notification. The figures below follow the 56th GST Council decisions
 * in force from 22 September 2025 and the income-tax calendar as it stands; the Guide screen says
 * so in plain words and every screen that prints these tells the owner to confirm with their CA.
 */

export type GstScheme = "regular" | "composition" | "unregistered";

/** GST state codes (the first two digits of a GSTIN). `ut` marks a Union Territory without its own
 *  legislature, where the state half of the tax is called UTGST rather than SGST. `qrmp22` marks the
 *  states whose quarterly GSTR-3B falls due on the 22nd rather than the 24th. */
export const GST_STATES: Record<string, { name: string; ut?: boolean; qrmp22?: boolean }> = {
  "01": { name: "Jammu & Kashmir" }, "02": { name: "Himachal Pradesh" }, "03": { name: "Punjab" }, "04": { name: "Chandigarh", ut: true },
  "05": { name: "Uttarakhand" }, "06": { name: "Haryana" }, "07": { name: "Delhi" }, "08": { name: "Rajasthan" }, "09": { name: "Uttar Pradesh" },
  "10": { name: "Bihar" }, "11": { name: "Sikkim" }, "12": { name: "Arunachal Pradesh" }, "13": { name: "Nagaland" }, "14": { name: "Manipur" },
  "15": { name: "Mizoram" }, "16": { name: "Tripura" }, "17": { name: "Meghalaya" }, "18": { name: "Assam" }, "19": { name: "West Bengal" },
  "20": { name: "Jharkhand" }, "21": { name: "Odisha" }, "22": { name: "Chhattisgarh", qrmp22: true }, "23": { name: "Madhya Pradesh", qrmp22: true },
  "24": { name: "Gujarat", qrmp22: true }, "26": { name: "Dadra & Nagar Haveli and Daman & Diu", ut: true, qrmp22: true }, "27": { name: "Maharashtra", qrmp22: true },
  "29": { name: "Karnataka", qrmp22: true }, "30": { name: "Goa", qrmp22: true }, "31": { name: "Lakshadweep", ut: true, qrmp22: true }, "32": { name: "Kerala", qrmp22: true },
  "33": { name: "Tamil Nadu", qrmp22: true }, "34": { name: "Puducherry", qrmp22: true }, "35": { name: "Andaman & Nicobar Islands", ut: true, qrmp22: true },
  "36": { name: "Telangana", qrmp22: true }, "37": { name: "Andhra Pradesh", qrmp22: true }, "38": { name: "Ladakh", ut: true }, "97": { name: "Other Territory" },
};

/** Services Accounting Codes hospitality bills carry. */
export const SAC = {
  restaurant: "996331",     // restaurant, café, canteen, cloud kitchen — food and drink served
  catering: "996334",       // outdoor catering
  accommodation: "996311",  // hotel, resort, guest-house room
  facilities: "999721",     // spa, wellness and similar on-site services (used by resort facilities)
} as const;

/** The rate schedule for hospitality. `itc` says whether input tax credit may be claimed. */
export const GST_RATES: { sac: string; what: string; rate: number | null; itc: boolean; note?: string }[] = [
  { sac: SAC.restaurant, what: "Restaurant, café, cloud kitchen, canteen", rate: 5, itc: false, note: "2.5% CGST + 2.5% SGST/UTGST. No input tax credit on purchases." },
  { sac: SAC.restaurant, what: "Restaurant inside a hotel where any room is above ₹7,500 a night", rate: 18, itc: true, note: "The hotel's tariff decides the restaurant's rate." },
  { sac: SAC.catering, what: "Outdoor catering", rate: 5, itc: false },
  { sac: SAC.accommodation, what: "Hotel or resort room up to ₹7,500 a night", rate: 5, itc: false, note: "Was 12% before 22 September 2025." },
  { sac: SAC.accommodation, what: "Hotel or resort room above ₹7,500 a night", rate: 18, itc: true },
  { sac: "", what: "Alcohol for human consumption", rate: null, itc: false, note: "Outside GST altogether; state VAT and excise apply instead." },
];

/** Rule 46 of the CGST Rules: what a tax invoice must show. */
export const INVOICE_MUST_SHOW = [
  "Name, address and GSTIN of the supplier",
  "A consecutive serial number, unique for the financial year (letters, numerals, - and / only)",
  "Date of issue",
  "Name, address and GSTIN of the recipient, when the recipient is registered (a B2B supply)",
  "HSN code of goods or SAC of services — 996331 for restaurant service, 996311 for accommodation",
  "Description of the goods or services",
  "Quantity and unit for goods",
  "Taxable value after any discount",
  "Rate of tax — CGST and SGST/UTGST shown separately, or IGST for an inter-state supply",
  "Amount of tax — again, CGST and SGST/UTGST separately",
  "Place of supply, with the state name, when it differs from the supplier's state",
  "Whether tax is payable under reverse charge",
  "Signature or digital signature of the supplier or an authorised person",
];

/** Rule 49: a composition dealer issues a bill of supply, not a tax invoice, and must print this line. */
export const COMPOSITION_NOTE = "Composition taxable person, not eligible to collect tax on supplies";

export const taxLabels = (stateCode?: string | null) => {
  const st = stateCode ? GST_STATES[stateCode] : undefined;
  return { central: "CGST", state: st?.ut ? "UTGST" : "SGST", stateName: st?.name ?? null };
};

/** What the bill is called. A registered regular dealer issues a tax invoice; a composition dealer
 *  a bill of supply; an unregistered business simply a bill. Before payment it is always a bill. */
export const billTitle = (scheme: GstScheme | string | null | undefined, gstin: string | null | undefined, paid: boolean) => {
  if (!paid) return "Bill";
  if (scheme === "composition") return "Bill of supply";
  if (gstin && scheme !== "unregistered") return "Tax invoice";
  return "Bill";
};

/** Indian financial year for a date: April to March, written 2025-26. */
export const financialYear = (d: Date | string) => {
  const x = typeof d === "string" ? new Date(d) : d;
  const y = x.getMonth() >= 3 ? x.getFullYear() : x.getFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
};
export const fyStartYear = (fy: string) => Number(fy.slice(0, 4));

/** Statutory documents a hospitality business keeps, and whether each one expires. */
export const DOC_KINDS: { key: string; label: string; expires: boolean; hint: string }[] = [
  { key: "gst_reg", label: "GST registration certificate (REG-06)", expires: false, hint: "Download from gst.gov.in → Services → User Services → View/Download Certificate." },
  { key: "pan", label: "PAN card of the business", expires: false, hint: "Proprietor's PAN for a proprietorship; the firm's or company's PAN otherwise." },
  { key: "fssai", label: "FSSAI licence or registration", expires: true, hint: "Every food business needs one. Renew before it lapses; the number must be printed on bills." },
  { key: "trade_licence", label: "Trade licence (municipal)", expires: true, hint: "Issued by the corporation or municipality; renewed yearly." },
  { key: "shop_estab", label: "Shops & Establishments registration", expires: true, hint: "State labour department; needed once you employ anyone." },
  { key: "fire_noc", label: "Fire safety NOC", expires: true, hint: "Fire service certificate; hotels and larger restaurants need it renewed." },
  { key: "bar_licence", label: "Bar / liquor licence (FL-3 or equivalent)", expires: true, hint: "State excise. Only if you serve alcohol." },
  { key: "audit_3cd", label: "Tax audit report (Form 3CA/3CB with 3CD)", expires: false, hint: "Signed by your CA when the audit under section 44AB applies." },
  { key: "itr_ack", label: "Income-tax return acknowledgement (ITR-V)", expires: false, hint: "One per financial year." },
  { key: "gstr_filing", label: "GST return filing acknowledgement", expires: false, hint: "The ARN or acknowledgement for a GSTR-1, 3B, 4, 9 or CMP-08." },
  { key: "bank_stmt", label: "Bank statements", expires: false, hint: "Monthly, for the books and for the audit." },
  { key: "other", label: "Other", expires: false, hint: "Lease, partnership deed, PF/ESI registration, pollution consent, music licence…" },
];

export type CalendarItem = {
  form: string;          // GSTR-1, GSTR-3B, CMP-08, GSTR-4, GSTR-9, ADV-TAX, TAX-AUDIT, ITR, TDS, PF, ESI, PT
  period: string;        // 2026-08 | Q1 2026-27 | FY 2025-26
  due: string;           // ISO date
  title: string;
  what: string;
  portal: string;
  ref: string;           // the section or rule
  optional?: boolean;    // only applies to some businesses
};

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;   // m is 1-12
const monthKey = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;
const GST_PORTAL = "https://www.gst.gov.in", IT_PORTAL = "https://www.incometax.gov.in", EPFO = "https://unifiedportal-emp.epfindia.gov.in", ESIC = "https://www.esic.gov.in";

/**
 * Every statutory date for one financial year, for this property's scheme.
 * `monthlyGst` is false for a small taxpayer on the QRMP scheme (turnover up to ₹5 crore may opt in).
 */
export function statutoryCalendar(o: { fy: string; scheme: GstScheme | string; stateCode?: string | null; monthlyGst?: boolean; hasStaff?: boolean }): CalendarItem[] {
  const y0 = fyStartYear(o.fy), y1 = y0 + 1;
  const out: CalendarItem[] = [];
  const months = Array.from({ length: 12 }, (_, i) => { const m = ((i + 3) % 12) + 1; return { y: m >= 4 ? y0 : y1, m }; });   // Apr y0 … Mar y1
  const next = (y: number, m: number) => (m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 });
  const quarters = [{ q: "Q1", months: [4, 5, 6], endY: y0, endM: 6 }, { q: "Q2", months: [7, 8, 9], endY: y0, endM: 9 }, { q: "Q3", months: [10, 11, 12], endY: y0, endM: 12 }, { q: "Q4", months: [1, 2, 3], endY: y1, endM: 3 }];
  const qrmp3b = o.stateCode && GST_STATES[o.stateCode]?.qrmp22 ? 22 : 24;

  if (o.scheme === "regular") {
    if (o.monthlyGst !== false) {
      for (const { y, m } of months) {
        const n = next(y, m);
        out.push({ form: "GSTR-1", period: monthKey(y, m), due: iso(n.y, n.m, 11), title: "GSTR-1 · outward supplies", what: "Every sale of the month, B2B invoice by invoice, B2C in total.", portal: GST_PORTAL, ref: "Sec 37 CGST Act · Rule 59" });
        out.push({ form: "GSTR-3B", period: monthKey(y, m), due: iso(n.y, n.m, 20), title: "GSTR-3B · summary return and payment", what: "Tax on the month's sales, less input credit if any, paid with the return.", portal: GST_PORTAL, ref: "Sec 39 · Rule 61" });
      }
    } else {
      for (const q of quarters) {
        const n = next(q.endY, q.endM);
        out.push({ form: "GSTR-1", period: `${q.q} ${o.fy}`, due: iso(n.y, n.m, 13), title: "GSTR-1 · quarterly (QRMP)", what: "The quarter's sales. B2B invoices may be pushed monthly through the IFF.", portal: GST_PORTAL, ref: "Rule 59(2)" });
        out.push({ form: "GSTR-3B", period: `${q.q} ${o.fy}`, due: iso(n.y, n.m, qrmp3b), title: "GSTR-3B · quarterly (QRMP)", what: "Tax for months 1 and 2 goes by challan PMT-06 by the 25th; the return settles the quarter.", portal: GST_PORTAL, ref: "Rule 61" });
      }
    }
    out.push({ form: "GSTR-9", period: `FY ${o.fy}`, due: iso(y1, 12, 31), title: "GSTR-9 · annual return", what: "Reconciles the year's monthly returns. Optional below ₹2 crore turnover.", portal: GST_PORTAL, ref: "Sec 44 · Rule 80", optional: true });
    out.push({ form: "GSTR-9C", period: `FY ${o.fy}`, due: iso(y1, 12, 31), title: "GSTR-9C · reconciliation statement", what: "Self-certified reconciliation with the audited accounts. Only above ₹5 crore turnover.", portal: GST_PORTAL, ref: "Sec 44 · Rule 80(3)", optional: true });
  }
  if (o.scheme === "composition") {
    for (const q of quarters) {
      const n = next(q.endY, q.endM);
      out.push({ form: "CMP-08", period: `${q.q} ${o.fy}`, due: iso(n.y, n.m, 18), title: "CMP-08 · quarterly statement and payment", what: "5% of the quarter's turnover (2.5% CGST + 2.5% SGST), paid with the statement.", portal: GST_PORTAL, ref: "Sec 10 · Rule 62" });
    }
    out.push({ form: "GSTR-4", period: `FY ${o.fy}`, due: iso(y1, 6, 30), title: "GSTR-4 · annual return (composition)", what: "The year's turnover and tax, after the four CMP-08 statements.", portal: GST_PORTAL, ref: "Sec 39(2) · Rule 62" });
  }

  // income tax applies to every business, registered for GST or not
  out.push({ form: "ADV-TAX", period: `Q1 ${o.fy}`, due: iso(y0, 6, 15), title: "Advance tax · 1st instalment (15%)", what: "If the year's income-tax liability exceeds ₹10,000.", portal: IT_PORTAL, ref: "Sec 208, 211 Income-tax Act" });
  out.push({ form: "ADV-TAX", period: `Q2 ${o.fy}`, due: iso(y0, 9, 15), title: "Advance tax · 2nd instalment (45% cumulative)", what: "Cumulative to 45% of the estimated year.", portal: IT_PORTAL, ref: "Sec 211" });
  out.push({ form: "ADV-TAX", period: `Q3 ${o.fy}`, due: iso(y0, 12, 15), title: "Advance tax · 3rd instalment (75% cumulative)", what: "Cumulative to 75%.", portal: IT_PORTAL, ref: "Sec 211" });
  out.push({ form: "ADV-TAX", period: `Q4 ${o.fy}`, due: iso(y1, 3, 15), title: "Advance tax · 4th instalment (100%)", what: "The balance of the year's estimate.", portal: IT_PORTAL, ref: "Sec 211" });
  out.push({ form: "TAX-AUDIT", period: `FY ${o.fy}`, due: iso(y1, 9, 30), title: "Tax audit report · Form 3CA/3CB with 3CD", what: "Mandatory above ₹1 crore turnover (₹10 crore where cash receipts and payments are each within 5%). Filed by your CA.", portal: IT_PORTAL, ref: "Sec 44AB", optional: true });
  out.push({ form: "ITR", period: `FY ${o.fy}`, due: iso(y1, 10, 31), title: "Income-tax return · audited business", what: "31 October when a tax audit applies; 31 July otherwise.", portal: IT_PORTAL, ref: "Sec 139(1)" });

  // people: TDS, provident fund, state insurance, professional tax
  const tds = [{ p: `Q1 ${o.fy}`, y: y0, m: 7, d: 31 }, { p: `Q2 ${o.fy}`, y: y0, m: 10, d: 31 }, { p: `Q3 ${o.fy}`, y: y1, m: 1, d: 31 }, { p: `Q4 ${o.fy}`, y: y1, m: 5, d: 31 }];
  for (const t of tds) out.push({ form: "TDS", period: t.p, due: iso(t.y, t.m, t.d), title: "TDS return · 24Q (salary) / 26Q (rent, contractors)", what: "Only if you deduct tax at source — on rent above ₹50,000 a month, contractor bills, or salaries above the slab. Monthly deposits by the 7th.", portal: IT_PORTAL, ref: "Sec 192, 194C, 194I · Rule 31A", optional: true });
  if (o.hasStaff !== false) {
    for (const { y, m } of months) {
      const n = next(y, m);
      out.push({ form: "PF", period: monthKey(y, m), due: iso(n.y, n.m, 15), title: "EPF contribution and ECR", what: "Applies from 20 employees. 12% employee + 12% employer on basic pay.", portal: EPFO, ref: "EPF Act 1952", optional: true });
      out.push({ form: "ESI", period: monthKey(y, m), due: iso(n.y, n.m, 15), title: "ESI contribution", what: "Applies from 10 employees where wages are up to ₹21,000 a month. 0.75% employee + 3.25% employer.", portal: ESIC, ref: "ESI Act 1948", optional: true });
    }
  }
  if (o.stateCode === "33") {
    out.push({ form: "PT", period: `H1 ${o.fy}`, due: iso(y0, 9, 30), title: "Professional tax · first half (Tamil Nadu)", what: "Half-yearly, to the local body, for the business and each employee above the slab.", portal: "https://tnurbanepay.tn.gov.in", ref: "TN Tax on Professions Act 1992", optional: true });
    out.push({ form: "PT", period: `H2 ${o.fy}`, due: iso(y1, 3, 31), title: "Professional tax · second half (Tamil Nadu)", what: "Half-yearly, to the local body.", portal: "https://tnurbanepay.tn.gov.in", ref: "TN Tax on Professions Act 1992", optional: true });
  }
  return out.sort((a, b) => a.due.localeCompare(b.due) || a.form.localeCompare(b.form));
}

/** Records the CGST Act requires a registered business to keep, and for how long. */
export const RECORD_KEEPING = {
  years: "72 months from the due date of the annual return for that year — in practice six years, longer if any notice or appeal is open",
  ref: "Sec 35 and 36 CGST Act · Rule 56",
  keep: ["Sales register — every bill and invoice, in serial order", "Purchase register with supplier GSTINs, for input credit and for GSTR-2B matching", "Stock register: opening, receipts, issues, closing, wastage (the Pantry does this)", "Cash book and bank statements", "Tax paid: challans, and the returns with their acknowledgements", "Advance receipts and their adjustments", "Credit and debit notes"],
};
