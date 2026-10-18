/**
 * Tally Prime / ERP 9 import files (Gateway of Tally → Import → Vouchers / Masters), built from `tally_days`
 * (0105). One Sales voucher a business day for the paid dining bills — debit each way they were paid, credit sales
 * (taxable value), service charge, CGST, SGST, round-off — and one Payment voucher for each expense. Every voucher
 * balances to the paisa; anything that does not fit a named ledger (a promise fee, an over-payment) goes to
 * "Other income" so the voucher still balances rather than being refused.
 *
 * Tally's sign rule: a debit line has ISDEEMEDPOSITIVE Yes and a negative AMOUNT; a credit line No and positive.
 */
export type Ledgers = { sales: string; service: string; cgst: string; sgst: string; round_off: string; other_income: string; cash: string; upi: string; card: string; other: string; bank: string; expense_prefix: string; input_gst: string; room_sales: string; guest_services: string; discount: string; debtors: string };
export const DEFAULT_LEDGERS: Ledgers = {
  sales: "Food Sales", service: "Service Charge", cgst: "Output CGST", sgst: "Output SGST", round_off: "Round Off",
  other_income: "Other Income", cash: "Cash", upi: "UPI Collections", card: "Card Collections", other: "Other Collections",
  bank: "Bank Account", expense_prefix: "", input_gst: "Input GST",
  room_sales: "Room Revenue", guest_services: "Guest Services", discount: "Discount Allowed", debtors: "Sundry Debtors",
};
/** Which Tally group each default ledger belongs in, for the masters file. */
const GROUP: Record<keyof Omit<Ledgers, "expense_prefix">, string> = {
  sales: "Sales Accounts", service: "Indirect Incomes", cgst: "Duties & Taxes", sgst: "Duties & Taxes", round_off: "Indirect Expenses",
  other_income: "Indirect Incomes", cash: "Cash-in-Hand", upi: "Bank Accounts", card: "Bank Accounts", other: "Bank Accounts", bank: "Bank Accounts", input_gst: "Duties & Taxes",
  room_sales: "Sales Accounts", guest_services: "Sales Accounts", discount: "Indirect Expenses", debtors: "Sundry Debtors",
};

export type SaleDay = { day: string; bills: number; first: number; last: number; taxable: number; service: number; cgst: number; sgst: number; round_off: number; total: number; paid: Record<string, number> };
export type Expense = { id: string; day: string; category: string; payee: string | null; amount: number; gst: number; method: string; ref: string | null };
type Line = { ledger: string; amount: number };   // + credit, − debit

const r2 = (n: number) => Math.round(Number(n) * 100) / 100;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);
const ymd = (d: string) => d.slice(0, 10).replace(/-/g, "");
export const withDefaults = (l: Partial<Ledgers> | null | undefined): Ledgers => ({ ...DEFAULT_LEDGERS, ...Object.fromEntries(Object.entries(l ?? {}).filter(([, v]) => typeof v === "string" && v.trim())) });

/** A day's Sales voucher lines, balanced. */
export function saleLines(d: SaleDay, L: Ledgers): Line[] {
  const lines: Line[] = [];
  const pay: Record<string, string> = { cash: L.cash, upi: L.upi, card: L.card, other: L.other };
  for (const [m, a] of Object.entries(d.paid ?? {})) if (r2(a)) lines.push({ ledger: pay[m] ?? L.other, amount: -r2(a) });
  const credit = (ledger: string, a: number) => { if (r2(a)) lines.push({ ledger, amount: r2(a) }); };
  credit(L.sales, d.taxable); credit(L.service, d.service); credit(L.cgst, d.cgst); credit(L.sgst, d.sgst); credit(L.round_off, d.round_off);
  credit(L.other_income, r2(d.total) - r2(d.taxable) - r2(d.service) - r2(d.cgst) - r2(d.sgst) - r2(d.round_off));
  const off = r2(lines.reduce((a, l) => a + l.amount, 0));
  if (off) lines.push({ ledger: L.other_income, amount: -off });   // paid ≠ billed: the gap, so it balances
  return merge(lines);
}

/** A stay or facility invoice (tally_days.stays, 0109). Lines carry their SAC: rooms (9963 11) go to Room revenue, food
 *  served to a room (9963 3x) to Food sales, everything else to Guest services. Payments are a list of {amount,
 *  description}; the way it was paid is read from the words ("UPI", "card", "cash"), anything else is Other. */
export type StayInvoice = { id: string; no: number; kind: string; day: string; guest: string | null; gstin: string | null;
  lines: { sac?: string | null; taxable?: number; amount?: number; description?: string }[];
  subtotal: number; discount: number; cgst: number; sgst: number; round_off: number; total: number; paid: number;
  payments: { amount: number; description?: string | null; at?: string }[] };
export const payMethodOf = (desc: string | null | undefined): "cash" | "upi" | "card" | "other" => {
  const d = (desc ?? "").toLowerCase();
  return /\bupi\b|gpay|phonepe|paytm/.test(d) ? "upi" : /\bcard\b|credit|debit/.test(d) ? "card" : /\bcash\b/.test(d) ? "cash" : "other";
};
const stayLedger = (sac: string | null | undefined, L: Ledgers) => { const c = String(sac ?? "").replace(/\D/g, ""); return c === "996311" ? L.room_sales : /^99633/.test(c) ? L.sales : L.guest_services; };

/** A stay invoice's Sales voucher lines, balanced: each way it was paid debited, what is still owed to Sundry
 *  debtors, a discount debited; room, food and services credited at their taxable value, CGST, SGST, round-off. */
export function stayLines(v: StayInvoice, L: Ledgers): Line[] {
  const lines: Line[] = [];
  const pay: Record<string, string> = { cash: L.cash, upi: L.upi, card: L.card, other: L.other };
  let paid = 0;
  for (const p of v.payments ?? []) { const a = r2(p.amount); if (!a) continue; paid = r2(paid + a); lines.push({ ledger: pay[payMethodOf(p.description)], amount: -a }); }
  const owed = r2(r2(v.total) - paid); if (owed > 0) lines.push({ ledger: L.debtors, amount: -owed });
  if (r2(v.discount)) lines.push({ ledger: L.discount, amount: -r2(v.discount) });
  let credited = 0;
  for (const l of v.lines ?? []) { const a = r2(l.taxable ?? l.amount ?? 0); if (!a) continue; credited = r2(credited + a); lines.push({ ledger: stayLedger(l.sac, L), amount: a }); }
  // lines that do not add up to the subtotal (an old invoice): the difference is Guest services, so the voucher balances
  if (r2(v.subtotal) !== credited) lines.push({ ledger: L.guest_services, amount: r2(r2(v.subtotal) - credited) });
  if (r2(v.cgst)) lines.push({ ledger: L.cgst, amount: r2(v.cgst) });
  if (r2(v.sgst)) lines.push({ ledger: L.sgst, amount: r2(v.sgst) });
  if (r2(v.round_off)) lines.push({ ledger: L.round_off, amount: r2(v.round_off) });
  const off = r2(lines.reduce((a, l) => a + l.amount, 0));
  if (off) lines.push({ ledger: off > 0 ? L.debtors : L.other_income, amount: -off });   // over-paid or a rounding gap
  return merge(lines);
}

/** An expense's Payment voucher lines: the expense (and input GST) debited, cash or bank credited. */
export function expenseLines(e: Expense, L: Ledgers): Line[] {
  const net = r2(e.amount - e.gst);
  const lines: Line[] = [{ ledger: `${L.expense_prefix}${e.category}`.trim(), amount: -net }];
  if (r2(e.gst)) lines.push({ ledger: L.input_gst, amount: -r2(e.gst) });
  lines.push({ ledger: e.method === "cash" ? L.cash : L.bank, amount: r2(e.amount) });
  return lines;
}

/** Two lines to the same ledger become one (Tally accepts both, but one reads better). */
function merge(lines: Line[]) {
  const m = new Map<string, number>(); for (const l of lines) m.set(l.ledger, r2((m.get(l.ledger) ?? 0) + l.amount));
  return [...m].filter(([, a]) => a !== 0).map(([ledger, amount]) => ({ ledger, amount }));
}

const entry = (l: Line) => `<ALLLEDGERENTRIES.LIST><LEDGERNAME>${esc(l.ledger)}</LEDGERNAME><ISDEEMEDPOSITIVE>${l.amount < 0 ? "Yes" : "No"}</ISDEEMEDPOSITIVE><AMOUNT>${l.amount.toFixed(2)}</AMOUNT></ALLLEDGERENTRIES.LIST>`;
const voucher = (type: string, no: string, date: string, narration: string, lines: Line[]) =>
  `<TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER REMOTEID="dineflow-${esc(no)}" VCHTYPE="${type}" ACTION="Create"><DATE>${ymd(date)}</DATE><VOUCHERTYPENAME>${type}</VOUCHERTYPENAME><VOUCHERNUMBER>${esc(no)}</VOUCHERNUMBER><NARRATION>${esc(narration)}</NARRATION>${lines.map(entry).join("")}</VOUCHER></TALLYMESSAGE>`;
const envelope = (company: string, report: "Vouchers" | "All Masters", body: string) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>${report}</REPORTNAME>${company ? `<STATICVARIABLES><SVCURRENTCOMPANY>${esc(company)}</SVCURRENTCOMPANY></STATICVARIABLES>` : ""}</REQUESTDESC><REQUESTDATA>${body}</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>\n`;

/** The vouchers file. */
export function tallyVouchers(company: string, days: SaleDay[], expenses: Expense[], L: Ledgers, stays: StayInvoice[] = []) {
  const v = [
    ...days.filter((d) => r2(d.total)).map((d) => voucher("Sales", `DF-S-${ymd(d.day)}`, d.day, `DineFlow: ${d.bills} dining bill${d.bills === 1 ? "" : "s"}, #${d.first}–#${d.last}`, saleLines(d, L))),
    ...stays.filter((x) => r2(x.total)).map((x) => voucher("Sales", `DF-${x.kind === "facility" ? "F" : "R"}-${x.no}`, x.day, `DineFlow ${x.kind === "facility" ? "facility" : "stay"} invoice #${x.no}${x.guest ? ` · ${x.guest}` : ""}${x.gstin ? ` · GSTIN ${x.gstin}` : ""}`, stayLines(x, L))),
    ...expenses.map((e) => voucher("Payment", `DF-E-${e.id.slice(0, 8)}`, e.day, `DineFlow expense: ${e.category}${e.payee ? ` · ${e.payee}` : ""}${e.ref ? ` · ref ${e.ref}` : ""}`, expenseLines(e, L))),
  ];
  return { xml: envelope(company, "Vouchers", v.join("")), count: v.length };
}

/** The masters file: every ledger the vouchers use, under its usual group (import once, before the vouchers). */
export function tallyLedgers(company: string, expenses: Expense[], L: Ledgers) {
  const want = new Map<string, string>();
  for (const k of Object.keys(GROUP) as (keyof typeof GROUP)[]) want.set(L[k], GROUP[k]);
  for (const e of expenses) want.set(`${L.expense_prefix}${e.category}`.trim(), "Indirect Expenses");
  const body = [...want].map(([name, group]) => `<TALLYMESSAGE xmlns:UDF="TallyUDF"><LEDGER NAME="${esc(name)}" ACTION="Create"><NAME.LIST><NAME>${esc(name)}</NAME></NAME.LIST><PARENT>${esc(group)}</PARENT></LEDGER></TALLYMESSAGE>`).join("");
  return envelope(company, "All Masters", body);
}

/** For tests and the screen: does every voucher balance? */
export const balances = (lines: Line[]) => Math.abs(lines.reduce((a, l) => a + l.amount, 0)) < 0.005;
