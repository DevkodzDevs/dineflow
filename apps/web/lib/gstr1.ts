/**
 * GSTR-1 as the GST portal's offline tool imports it (Returns → GSTR-1 → Import → JSON), built from the month the
 * Tax → Returns tab already shows. Pure: the server action (`tax/actions.ts` gstr1Month) gathers the rows and this file
 * shapes them, so the figures can be tested without a database.
 *
 * One date basis per section, the same one `gst_summary` (0146) uses for the figures on the screen, so the file and the
 * screen never disagree:
 *   · dining bills — the business day the bill was **paid** (`paid_at`, Asia/Kolkata). A dining bill is the tax invoice
 *     and is issued when it is settled; the till numbers it then. gst_summary's dining rows use the same day.
 *   · stay, facility and B2B tax invoices — the day the invoice was **issued** (`issued_at`, IST): time of supply for a
 *     tax invoice is its date (CGST Act s.13(2)); gst_summary's stay and B2B rows use it.
 *   · credit notes — the day they were **issued** (`created_at`, IST); gst_summary's credit_notes row too.
 * The caller hands over dates already turned into IST calendar days (`istDate`); the builder keeps only the month's.
 *
 * Where each rupee goes:
 *   b2b     every tax invoice carrying a buyer's GSTIN (table 4), grouped by that GSTIN, one `inv` each, its items one
 *           per GST rate. A dining bill that has such an invoice is reported here and not again in b2cs.
 *   b2cs    the rest, summed per rate (table 7, intra-state — a restaurant's or hotel's place of supply is the property
 *           itself, so every supply is CGST + SGST, 0146). Credit notes to unregistered guests are netted here, which is
 *           how table 7 is meant to be filled; there is no `cdnur` for an intra-state B2C note.
 *   cdnr    credit notes whose bill had a B2B invoice (table 9B), `ntty` "C", grouped by the buyer's GSTIN.
 *   nil     value charged at 0% (table 8) — a composition or unregistered property, or a 0% dish.
 *   hsn     table 12: each dish's HSN (menu_items.hsn, 0146; 996331 when none) at its rate, quantities summed; a stay's
 *           lines by their SAC. Each bill's per-rate taxable value is shared across its items of that rate in proportion
 *           to price × quantity, so the HSN table adds up to the b2b + b2cs value to the paisa.
 *   doc_issue  table 13: the month's bill series (BILL-), tax-invoice series (INV-) and credit-note series (CN-), with
 *           from, to, how many, how many cancelled.
 *   supeco  Swiggy / Zomato / ONDC bills (section 9(5), `gst_by_operator`): the operator paid the GST, so the value is
 *           **kept out** of b2cs and hsn, as gst_summary keeps it out. Table 14(b) (`supeco.paytx`) wants the operator's
 *           GSTIN; DineFlow does not hold one, so the entry is written only when the caller supplies it, and the total is
 *           always reported in `summary.eco` for the CA.
 */

export type TaxPart = { rate: number; taxable: number; cgst: number; sgst: number };
export type Gstr1Item = { hsn: string | null; name: string; qty: number; value: number; rate: number | null };
/** A paid dining bill. `parts` is its tax per rate (bills.tax_lines; one part for an older bill). */
export type Gstr1Bill = { id: string; no: number; date: string; total: number; parts: TaxPart[]; byOperator: boolean; operator?: string | null; items: Gstr1Item[] };
export type Gstr1Line = { sac: string | null; description: string; qty: number; taxable: number; rate: number; gst: number };
/** A stay or facility invoice, or a dining tax invoice that names a buyer's GSTIN. */
export type Gstr1Invoice = { id: string; no: number; kind: "stay" | "facility" | "dining"; date: string; billId: string | null; buyerGstin: string | null; buyerName: string | null;
  lines: Gstr1Line[]; taxable: number; cgst: number; sgst: number; total: number };
export type Gstr1CreditNote = { id: string; no: number; date: string; amount: number; taxable: number; cgst: number; sgst: number; parts: TaxPart[] | null; buyerGstin: string | null };
export type Gstr1Documents = { bills: { no: number; cancelled: boolean }[]; invoices: number[]; creditNotes: number[] };
export type Gstr1Input = {
  gstin: string; stateCode: string; month: string; defaultRate: number;
  bills: Gstr1Bill[]; invoices: Gstr1Invoice[]; creditNotes: Gstr1CreditNote[]; documents: Gstr1Documents;
  /** operator label → the operator's GSTIN, for table 14(b); none are known today */
  operatorGstins?: Record<string, string>;
};

export type ItemDet = { txval: number; rt: number; iamt: number; camt: number; samt: number; csamt: number };
export type B2bInv = { inum: string; idt: string; val: number; pos: string; rchrg: "N"; inv_typ: "R"; itms: { num: number; itm_det: ItemDet }[] };
export type Gstr1Json = {
  gstin: string; fp: string; version: string; hash: "hash";
  b2b: { ctin: string; inv: B2bInv[] }[];
  b2cs: { sply_ty: "INTRA"; rt: number; typ: "OE"; pos: string; txval: number; iamt: number; camt: number; samt: number; csamt: number }[];
  cdnr: { ctin: string; nt: { ntty: "C"; nt_num: string; nt_dt: string; val: number; pos: string; rchrg: "N"; inv_typ: "R"; itms: { num: number; itm_det: ItemDet }[] }[] }[];
  nil?: { inv: { sply_ty: "INTRAB2B" | "INTRAB2C"; expt_amt: number; nil_amt: number; ngsup_amt: number }[] };
  hsn: { data: { num: number; hsn_sc: string; desc: string; uqc: string; qty: number; txval: number; rt: number; iamt: number; camt: number; samt: number; csamt: number }[] };
  doc_issue: { doc_det: { doc_num: number; docs: { num: number; from: string; to: string; totnum: number; cancel: number; net_issue: number }[] }[] };
  supeco?: { paytx: { etin: string; suppval: number; igst: number; cgst: number; sgst: number; cess: number }[] };
};
type Sum = { count: number; taxable: number; cgst: number; sgst: number };
export type Gstr1Summary = {
  b2b: Sum; b2cs: Sum; cdnr: Sum; netted: Sum; nil: number; eco: { count: number; value: number; operators: string[] };
  totals: { taxable: number; cgst: number; sgst: number }; hsnRows: number;
};

/** The version string the offline tool writes in its own files; it accepts older ones. */
export const GSTR1_VERSION = "GST3.1.6";
const DEFAULT_SAC = "996331";   // restaurant service
const BILL = (n: number) => `BILL-${String(n).padStart(4, "0")}`;
const INV = (n: number) => `INV-${String(n).padStart(5, "0")}`;
const CN = (n: number) => `CN-${String(n).padStart(4, "0")}`;
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
/** A timestamp's calendar day in Asia/Kolkata (IST has no daylight saving: a fixed +05:30). */
export const istDate = (ts: string | Date) => new Date(new Date(ts).getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
/** The month's window in absolute time: [first midnight IST, next month's first midnight IST). */
export const monthWindow = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return { from: `${month}-01`, to: `${next}-01`, fromTs: `${month}-01T00:00:00+05:30`, toTs: `${next}-01T00:00:00+05:30` };
};
/** DD-MM-YYYY, as the portal writes a date. */
export const ddmmyyyy = (ymd: string) => `${ymd.slice(8, 10)}-${ymd.slice(5, 7)}-${ymd.slice(0, 4)}`;
/** MMYYYY, the portal's filing period. */
export const fp = (month: string) => `${month.slice(5, 7)}${month.slice(0, 4)}`;
export const gstr1FileName = (gstin: string, month: string) => `GSTR1-${(gstin || "NOGSTIN").replace(/\W+/g, "")}-${fp(month)}.json`;

/** `target` shared out in proportion to `weights`, every share two decimals and the paise of rounding on the largest, so
 *  the shares add up to the target exactly. All-zero weights share equally. */
export function spread(target: number, weights: number[]): number[] {
  const t = r2(target); if (weights.length === 0) return [];
  const w = weights.map((x) => Math.max(0, Number(x) || 0)); const tot = w.reduce((a, b) => a + b, 0);
  const out = w.map((x) => r2(tot > 0 ? (t * x) / tot : t / w.length));
  const given = r2(out.reduce((a, b) => a + b, 0));
  if (given !== t) { let big = 0; for (let i = 1; i < w.length; i++) if (w[i] > w[big]) big = i; out[big] = r2(out[big] + t - given); }
  return out;
}

const blendedRate = (taxable: number, cgst: number, sgst: number) => (taxable > 0 ? Math.round(((cgst + sgst) / taxable) * 1000) / 10 : 0);
const cleanGstin = (g: string | null | undefined) => { const s = (g ?? "").trim().toUpperCase(); return GSTIN_RE.test(s) ? s : null; };
const key = (rate: number) => String(r2(rate));

/** An invoice's items per rate: the lines grouped by their rate, then held to the invoice's own header (taxable, CGST,
 *  SGST) so the items add up to the invoice to the paisa even where the lines carry a discount only the header knows. */
function invoiceParts(inv: Gstr1Invoice): TaxPart[] {
  const g = new Map<string, TaxPart>();
  for (const l of inv.lines ?? []) {
    const rate = r2(l.rate ?? 0); const k = key(rate); const p = g.get(k) ?? { rate, taxable: 0, cgst: 0, sgst: 0 };
    p.taxable += Number(l.taxable) || 0; p.cgst += (Number(l.gst) || 0) / 2; p.sgst += (Number(l.gst) || 0) / 2; g.set(k, p);
  }
  let parts = [...g.values()];
  if (parts.length === 0) parts = [{ rate: blendedRate(inv.taxable, inv.cgst, inv.sgst), taxable: inv.taxable, cgst: inv.cgst, sgst: inv.sgst }];
  const tx = spread(inv.taxable, parts.map((p) => p.taxable));
  const cg = spread(inv.cgst, parts.map((p) => p.cgst || p.taxable * p.rate));
  const sg = spread(inv.sgst, parts.map((p) => p.sgst || p.taxable * p.rate));
  return parts.map((p, i) => ({ rate: p.rate, taxable: tx[i], cgst: cg[i], sgst: sg[i] })).filter((p) => p.taxable || p.cgst || p.sgst).sort((a, b) => a.rate - b.rate);
}
const items = (parts: TaxPart[]) => parts.map((p, i) => ({ num: i + 1, itm_det: { txval: r2(p.taxable), rt: r2(p.rate), iamt: 0, camt: r2(p.cgst), samt: r2(p.sgst), csamt: 0 } }));
const creditParts = (c: Gstr1CreditNote): TaxPart[] => {
  const raw = (c.parts ?? []).filter((p) => p && (Number(p.taxable) || Number(p.cgst) || Number(p.sgst)));
  const base = raw.length ? raw.map((p) => ({ rate: r2(p.rate), taxable: Number(p.taxable) || 0, cgst: Number(p.cgst) || 0, sgst: Number(p.sgst) || 0 }))
    : [{ rate: blendedRate(c.taxable, c.cgst, c.sgst), taxable: c.taxable, cgst: c.cgst, sgst: c.sgst }];
  const tx = spread(c.taxable, base.map((p) => p.taxable)), cg = spread(c.cgst, base.map((p) => p.cgst || p.taxable * p.rate)), sg = spread(c.sgst, base.map((p) => p.sgst || p.taxable * p.rate));
  return base.map((p, i) => ({ rate: p.rate, taxable: tx[i], cgst: cg[i], sgst: sg[i] })).filter((p) => p.taxable || p.cgst || p.sgst);
};
const sum0 = (): Sum => ({ count: 0, taxable: 0, cgst: 0, sgst: 0 });
const add = (s: Sum, p: TaxPart) => { s.taxable = r2(s.taxable + p.taxable); s.cgst = r2(s.cgst + p.cgst); s.sgst = r2(s.sgst + p.sgst); };

/** The file and, beside it, the figures it holds — for the screen to show and the tests to check. */
export function buildGstr1(input: Gstr1Input): { json: Gstr1Json; summary: Gstr1Summary; fileName: string } {
  const month = input.month; const inMonth = (d: string) => (d ?? "").slice(0, 7) === month;
  const pos = (input.stateCode || input.gstin.slice(0, 2) || "").padStart(2, "0").slice(0, 2);
  const summary: Gstr1Summary = { b2b: sum0(), b2cs: sum0(), cdnr: sum0(), netted: sum0(), nil: 0, eco: { count: 0, value: 0, operators: [] }, totals: { taxable: 0, cgst: 0, sgst: 0 }, hsnRows: 0 };

  // ── b2b: tax invoices with a buyer GSTIN, by that GSTIN ──
  const b2bByCtin = new Map<string, B2bInv[]>(); const b2bBills = new Set<string>();
  const nilB2b = { v: 0 };
  for (const inv of input.invoices.filter((i) => inMonth(i.date) && cleanGstin(i.buyerGstin)).sort((a, b) => a.no - b.no)) {
    const ctin = cleanGstin(inv.buyerGstin)!; const parts = invoiceParts(inv);
    if (inv.billId) b2bBills.add(inv.billId);
    const taxed = parts.filter((p) => p.rate > 0 || p.cgst || p.sgst); const nil = parts.filter((p) => !(p.rate > 0 || p.cgst || p.sgst));
    for (const p of nil) nilB2b.v = r2(nilB2b.v + p.taxable);
    summary.b2b.count++; for (const p of parts) add(summary.b2b, p);
    const list = b2bByCtin.get(ctin) ?? []; b2bByCtin.set(ctin, list);
    list.push({ inum: INV(inv.no), idt: ddmmyyyy(inv.date), val: r2(inv.total), pos: ctin.slice(0, 2), rchrg: "N", inv_typ: "R", itms: items(taxed.length ? taxed : parts) });
  }

  // ── b2cs: paid dining bills (not 9(5), not already a B2B invoice) and stay / facility invoices without a GSTIN, per rate ──
  const b2cs = new Map<string, TaxPart>(); let nilB2c = 0;
  const take = (p: TaxPart, s: Sum) => {
    if (!(p.rate > 0 || p.cgst || p.sgst)) { nilB2c = r2(nilB2c + p.taxable); add(s, p); return; }
    const k = key(p.rate); const cur = b2cs.get(k) ?? { rate: r2(p.rate), taxable: 0, cgst: 0, sgst: 0 };
    cur.taxable = r2(cur.taxable + p.taxable); cur.cgst = r2(cur.cgst + p.cgst); cur.sgst = r2(cur.sgst + p.sgst); b2cs.set(k, cur); add(s, p);
  };
  const dining = input.bills.filter((b) => inMonth(b.date) && !b.byOperator && !b2bBills.has(b.id));
  for (const b of dining) { summary.b2cs.count++; for (const p of b.parts) take({ rate: r2(p.rate), taxable: r2(p.taxable), cgst: r2(p.cgst), sgst: r2(p.sgst) }, summary.b2cs); }
  const stays = input.invoices.filter((i) => inMonth(i.date) && i.kind !== "dining" && !cleanGstin(i.buyerGstin));
  for (const inv of stays) { summary.b2cs.count++; for (const p of invoiceParts(inv)) take(p, summary.b2cs); }

  // ── 9(5): the operator paid the GST — value only, kept out of b2cs and hsn (0146) ──
  const ecoBy = new Map<string, number>();
  for (const b of input.bills.filter((x) => inMonth(x.date) && x.byOperator)) {
    summary.eco.count++; summary.eco.value = r2(summary.eco.value + b.total);
    const op = (b.operator ?? "operator").trim() || "operator"; ecoBy.set(op, r2((ecoBy.get(op) ?? 0) + b.total));
  }
  summary.eco.operators = [...ecoBy.keys()].sort();
  const paytx = [...ecoBy].filter(([op]) => cleanGstin(input.operatorGstins?.[op])).map(([op, v]) => ({ etin: cleanGstin(input.operatorGstins![op])!, suppval: v, igst: 0, cgst: 0, sgst: 0, cess: 0 }));

  // ── credit notes: to a registered buyer → cdnr; to anyone else → netted in b2cs (table 7 is net of notes) ──
  const cdnrBy = new Map<string, Gstr1Json["cdnr"][number]["nt"]>();
  for (const c of input.creditNotes.filter((x) => inMonth(x.date)).sort((a, b) => a.no - b.no)) {
    const ctin = cleanGstin(c.buyerGstin) ?? null; const parts = creditParts(c);
    if (ctin) {
      summary.cdnr.count++; for (const p of parts) add(summary.cdnr, p);
      const list = cdnrBy.get(ctin) ?? []; cdnrBy.set(ctin, list);
      list.push({ ntty: "C", nt_num: CN(c.no), nt_dt: ddmmyyyy(c.date), val: r2(c.amount), pos: ctin.slice(0, 2), rchrg: "N", inv_typ: "R", itms: items(parts) });
    } else {
      summary.netted.count++;
      for (const p of parts) { add(summary.netted, p); take({ rate: p.rate, taxable: -p.taxable, cgst: -p.cgst, sgst: -p.sgst }, sum0()); }
    }
  }

  // ── hsn (table 12): dishes by HSN and rate, each bill's per-rate value shared across its dishes of that rate ──
  const hsn = new Map<string, { hsn_sc: string; desc: string; uqc: string; qty: number; txval: number; rt: number; camt: number; samt: number }>();
  const putHsn = (code: string, desc: string, rate: number, qty: number, txval: number, cgst: number, sgst: number) => {
    const sc = (code || DEFAULT_SAC).replace(/\D/g, "") || DEFAULT_SAC; const k = `${sc}|${key(rate)}`;
    const row = hsn.get(k) ?? { hsn_sc: sc, desc: desc.slice(0, 30), uqc: sc.startsWith("99") ? "OTH" : "NOS", qty: 0, txval: 0, rt: r2(rate), camt: 0, samt: 0 };
    row.qty = r2(row.qty + qty); row.txval = r2(row.txval + txval); row.camt = r2(row.camt + cgst); row.samt = r2(row.samt + sgst); if (!row.desc && desc) row.desc = desc.slice(0, 30); hsn.set(k, row);
  };
  const hsnBills = input.bills.filter((b) => inMonth(b.date) && !b.byOperator);
  for (const b of hsnBills) {
    for (const p of b.parts) {
      const rate = r2(p.rate);
      const its = (b.items ?? []).filter((it) => r2(it.rate ?? input.defaultRate) === rate && (Number(it.value) || 0) > 0);
      if (its.length === 0) { putHsn(DEFAULT_SAC, "Restaurant service", rate, 0, r2(p.taxable), r2(p.cgst), r2(p.sgst)); continue; }
      const tx = spread(p.taxable, its.map((it) => it.value)), cg = spread(p.cgst, its.map((it) => it.value)), sg = spread(p.sgst, its.map((it) => it.value));
      its.forEach((it, i) => putHsn(it.hsn ?? DEFAULT_SAC, it.hsn ? it.name : "Restaurant service", rate, Number(it.qty) || 0, tx[i], cg[i], sg[i]));
    }
  }
  for (const inv of input.invoices.filter((i) => inMonth(i.date) && (i.kind !== "dining" || cleanGstin(i.buyerGstin)))) {
    if (inv.kind === "dining" && inv.billId && hsnBills.some((b) => b.id === inv.billId)) continue;   // its bill's dishes are already counted
    const parts = invoiceParts(inv); const lines = inv.lines ?? [];
    for (const p of parts) {
      const ls = lines.filter((l) => r2(l.rate ?? 0) === p.rate && (Number(l.taxable) || 0) > 0);
      if (ls.length === 0) { putHsn(DEFAULT_SAC, "Accommodation", p.rate, 0, p.taxable, p.cgst, p.sgst); continue; }
      const tx = spread(p.taxable, ls.map((l) => l.taxable)), cg = spread(p.cgst, ls.map((l) => l.taxable)), sg = spread(p.sgst, ls.map((l) => l.taxable));
      ls.forEach((l, i) => putHsn(l.sac ?? DEFAULT_SAC, l.sac === "996311" ? "Accommodation" : l.sac === "999721" ? "Guest services" : "Restaurant service", p.rate, Number(l.qty) || 0, tx[i], cg[i], sg[i]));
    }
  }

  // ── doc_issue (table 13): the series issued this month ──
  const series = (nos: number[], cancelled: number, label: (n: number) => string) => {
    if (nos.length === 0) return null; const lo = Math.min(...nos), hi = Math.max(...nos); const tot = hi - lo + 1;
    return { from: label(lo), to: label(hi), totnum: tot, cancel: cancelled + (tot - nos.length), net_issue: tot - cancelled - (tot - nos.length) };
  };
  const bills = input.documents.bills ?? [];
  const outward = [series(bills.map((b) => b.no), bills.filter((b) => b.cancelled).length, BILL), series(input.documents.invoices ?? [], 0, INV)].filter((x) => x !== null);
  const credits = [series(input.documents.creditNotes ?? [], 0, CN)].filter((x) => x !== null);
  const doc_det: Gstr1Json["doc_issue"]["doc_det"] = [];
  if (outward.length) doc_det.push({ doc_num: 1, docs: outward.map((d, i) => ({ num: i + 1, ...d })) });
  if (credits.length) doc_det.push({ doc_num: 5, docs: credits.map((d, i) => ({ num: i + 1, ...d })) });

  // ── assemble ──
  const json: Gstr1Json = {
    gstin: input.gstin, fp: fp(month), version: GSTR1_VERSION, hash: "hash",
    b2b: [...b2bByCtin].sort(([a], [b]) => a.localeCompare(b)).map(([ctin, inv]) => ({ ctin, inv })),
    b2cs: [...b2cs.values()].filter((p) => p.taxable || p.cgst || p.sgst).sort((a, b) => a.rate - b.rate)
      .map((p) => ({ sply_ty: "INTRA" as const, rt: p.rate, typ: "OE" as const, pos, txval: r2(p.taxable), iamt: 0, camt: r2(p.cgst), samt: r2(p.sgst), csamt: 0 })),
    cdnr: [...cdnrBy].sort(([a], [b]) => a.localeCompare(b)).map(([ctin, nt]) => ({ ctin, nt })),
    hsn: { data: [...hsn.values()].filter((r) => r.txval || r.camt || r.samt).sort((a, b) => a.hsn_sc.localeCompare(b.hsn_sc) || a.rt - b.rt).map((r, i) => ({ num: i + 1, ...r, iamt: 0, csamt: 0 })) },
    doc_issue: { doc_det },
  };
  const nilRows: NonNullable<Gstr1Json["nil"]>["inv"] = [];
  if (nilB2b.v) nilRows.push({ sply_ty: "INTRAB2B", expt_amt: 0, nil_amt: r2(nilB2b.v), ngsup_amt: 0 });
  if (nilB2c) nilRows.push({ sply_ty: "INTRAB2C", expt_amt: 0, nil_amt: r2(nilB2c), ngsup_amt: 0 });
  if (nilRows.length) json.nil = { inv: nilRows };
  if (paytx.length) json.supeco = { paytx };
  summary.nil = r2(nilB2b.v + nilB2c); summary.hsnRows = json.hsn.data.length;
  summary.totals = {
    taxable: r2(summary.b2b.taxable + summary.b2cs.taxable - summary.cdnr.taxable - summary.netted.taxable),
    cgst: r2(summary.b2b.cgst + summary.b2cs.cgst - summary.cdnr.cgst - summary.netted.cgst),
    sgst: r2(summary.b2b.sgst + summary.b2cs.sgst - summary.cdnr.sgst - summary.netted.sgst),
  };
  return { json, summary, fileName: gstr1FileName(input.gstin, month) };
}
