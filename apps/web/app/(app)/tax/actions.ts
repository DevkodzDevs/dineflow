"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { GST_STATES, modulesFor } from "@dineflow/shared";
import { buildGstr1, istDate, monthWindow, type Gstr1Input, type Gstr1Item, type TaxPart } from "@/lib/gstr1";
import type { SaleDay, Expense, StayInvoice, CreditVoucher } from "@/lib/tally";

const bump = () => ["/tax", "/settings", "/billing", "/invoices", "/admin/compliance"].forEach((p) => revalidatePath(p));
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const dateOrNull = (v: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

/** The registration the property files under, and the CA who signs for it. */
export async function saveTaxProfile(fd: FormData) {
  // The screen says only the owner or a manager may change these; hold that here too, not just on the button.
  const session = await requireSession();
  if (!["owner", "manager"].includes(session.profile.role)) return { error: "Only the owner or a manager can change this." };
  const s = await createClient();
  const gstin = str(fd, "gstin").toUpperCase(), pan = str(fd, "pan").toUpperCase();
  // GSTIN: 2-digit state · 10-character PAN · entity number · Z · check character
  if (gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)) return { error: "GSTIN must be 15 characters, e.g. 33ABCDE1234F1Z5." };
  if (pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) return { error: "PAN must be 10 characters, e.g. ABCDE1234F." };
  if (gstin && pan && gstin.slice(2, 12) !== pan) return { error: "GSTIN and PAN don't match — GSTIN characters 3 to 12 are the PAN." };
  const scheme = str(fd, "gst_scheme");
  if (!["regular", "composition", "unregistered"].includes(scheme)) return { error: "Choose a GST scheme." };
  if (scheme !== "unregistered" && !gstin) return { error: "A registered business needs its GSTIN here." };
  const chosen = str(fd, "gst_state_code");
  if (chosen && !GST_STATES[chosen]) return { error: "Choose a state from the list." };
  if (chosen && gstin && gstin.slice(0, 2) !== chosen) return { error: `The GSTIN starts with ${gstin.slice(0, 2)} (${GST_STATES[gstin.slice(0, 2)]?.name ?? "unknown state"}) but the state chosen is ${chosen} (${GST_STATES[chosen].name}). Pick "From the GSTIN" or correct one of them.` };
  const state = chosen || (gstin ? gstin.slice(0, 2) : "");
  const { error } = await s.from("restaurants").update({
    gstin: gstin || null, legal_name: str(fd, "legal_name") || null, pan: pan || null, gst_scheme: scheme, gst_state_code: state || null,
    gst_monthly: str(fd, "gst_period") !== "quarterly", fssai_no: str(fd, "fssai_no") || null,
    ca_name: str(fd, "ca_name") || null, ca_firm: str(fd, "ca_firm") || null, ca_membership_no: str(fd, "ca_membership_no") || null,
    ca_email: str(fd, "ca_email") || null, ca_phone: str(fd, "ca_phone") || null,
  }).eq("id", session.restaurant.id);
  if (error) return { error: error.message };
  bump(); return { ok: true };
}

/** One statutory document: what it is, its number, when it expires, and where the signed copy lives. */
export async function saveDoc(fd: FormData) {
  const s = await createClient(); const id = str(fd, "id");
  const row = {
    kind: str(fd, "kind") || "other", title: str(fd, "title"), number: str(fd, "number") || null, issuer: str(fd, "issuer") || null,
    issued_on: dateOrNull(str(fd, "issued_on")), expires_on: dateOrNull(str(fd, "expires_on")), period: str(fd, "period") || null,
    url: str(fd, "url") || null, notes: str(fd, "notes") || null,
  };
  if (!row.title) return { error: "Give the document a title." };
  if (row.url && !/^https?:\/\//i.test(row.url)) return { error: "The link should start with http:// or https://." };
  const { error } = await (id ? s.from("compliance_docs").update(row).eq("id", id) : s.from("compliance_docs").insert(row));
  if (error) return { error: error.message };
  bump(); return { ok: true };
}
export async function deleteDoc(id: string) {
  const s = await createClient(); const { error } = await s.from("compliance_docs").delete().eq("id", id);
  if (error) return { error: error.message }; bump(); return { ok: true };
}

/** Records that a return was filed: the date and the acknowledgement number from the portal. */
export async function markFiled(form: string, period: string, dueOn: string, filedOn: string, ack: string) {
  const s = await createClient(); const session = await requireSession();
  const filed = dateOrNull(filedOn); if (!filed) return { error: "Enter the date it was filed." };
  if (!dateOrNull(dueOn) || !form || !period) return { error: "That return could not be identified." };
  // restaurant_id is part of the conflict key, so it is set here rather than left to the insert trigger.
  const { error } = await s.from("compliance_filings").upsert(
    { restaurant_id: session.restaurant.id, form, period, due_on: dueOn, filed_on: filed, ack_no: ack.trim() || null, updated_at: new Date().toISOString() },
    { onConflict: "restaurant_id,form,period" });
  if (error) return { error: error.message };
  bump(); return { ok: true };
}
export async function unmarkFiled(form: string, period: string) {
  const s = await createClient(); const { error } = await s.from("compliance_filings").delete().eq("form", form).eq("period", period);
  if (error) return { error: error.message }; bump(); return { ok: true };
}

/** A period's paid dining bills a day and its expenses, for the Tally file (0105 tally_days; owner or manager).
 *  Since 2026-11-09 also the period's credit notes (a Credit Note voucher each) and each day's packing & delivery
 *  charges (0146 bills.charges), which go to the sales ledger — tally_days carries neither, so they are read here,
 *  pinned to the property for the master. */
export async function tallyDays(from: string, to: string) {
  const s = await createClient();
  const { data, error } = await s.rpc("tally_days", { p_from: from, p_to: to });
  if (error) return { error: error.message };
  const session = await requireSession(); const rid = session.restaurant.id;
  const pin = pinTo(session.isAdmin, rid);
  const out = data as { sales: SaleDay[]; expenses: Expense[]; stays: StayInvoice[]; credits?: CreditVoucher[] };
  const [{ data: cns }, { data: charged }] = await Promise.all([
    pin(s.from("credit_notes").select("id, cn_no, amount, taxable, cgst, sgst, refund_method, created_at, bills(bill_no)"))
      .gte("created_at", `${from}T00:00:00+05:30`).lt("created_at", `${nextDay(to)}T00:00:00+05:30`).order("created_at").limit(1000),
    pin(s.from("bills").select("paid_at, charges")).eq("status", "paid").gt("charges", 0)
      .gte("paid_at", `${from}T00:00:00+05:30`).lt("paid_at", `${nextDay(to)}T00:00:00+05:30`).limit(1000),
  ]);
  out.credits = ((cns ?? []) as unknown as { id: string; cn_no: number; amount: number; taxable: number; cgst: number; sgst: number; refund_method: string; created_at: string; bills: { bill_no: number } | null }[])
    .map((c) => ({ id: c.id, no: c.cn_no, day: istDate(c.created_at), amount: Number(c.amount), taxable: Number(c.taxable), cgst: Number(c.cgst), sgst: Number(c.sgst), method: c.refund_method, bill_no: c.bills?.bill_no ?? null }));
  const byDay = new Map<string, number>();
  for (const b of (charged ?? []) as { paid_at: string; charges: number }[]) { const d = istDate(b.paid_at); byDay.set(d, Math.round(((byDay.get(d) ?? 0) + Number(b.charges)) * 100) / 100); }
  for (const d of out.sales ?? []) d.charges = byDay.get(String(d.day).slice(0, 10)) ?? 0;
  return { ok: true as const, data: out as { sales: SaleDay[]; expenses: Expense[]; stays: StayInvoice[]; credits: CreditVoucher[] } };
}
/** The master's read, pinned to the property it is standing in (lib/scoped.ts); anyone else's rows are already only theirs (RLS). */
const pinTo = (isAdmin: boolean, rid: string) => <Q>(q: Q): Q => (isAdmin ? (q as unknown as { eq: (c: string, v: string) => Q }).eq("restaurant_id", rid) : q);
const nextDay = (ymd: string) => new Date(new Date(ymd + "T00:00:00Z").getTime() + 86400000).toISOString().slice(0, 10);

/* ── GSTR-1 (2026-11-09): the month's documents, shaped by lib/gstr1.ts ───────────────────────────────────────────────
   Who may ask is who may open Tax at all — the same `modulesFor` test the (app) layout applies to /tax (owner, manager,
   supervisor by their ceilings; nobody else holds "tax") — or the master. The master's reads are pinned to the property
   it is standing in (lib/scoped.ts): bills, invoices and credit notes are read through RLS, so every other login already
   sees only its own. PostgREST answers at most 1,000 rows a call; a busy month has more bills, so every list is paged. */
type Row = Record<string, unknown>;
const PAGE = 1000;
async function allRows<T extends Row>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; ; i += PAGE) {
    const { data, error } = await page(i, i + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? [])); if (!data || data.length < PAGE) return out;
  }
}
const num = (v: unknown) => Number(v ?? 0) || 0;
const parts = (tl: unknown): TaxPart[] | null => Array.isArray(tl) ? (tl as Row[]).map((l) => ({ rate: num(l.rate), taxable: num(l.base ?? l.taxable), cgst: num(l.cgst), sgst: num(l.sgst) })) : null;

/** The month's GSTR-1 JSON for the portal's offline tool, and the figures in it. */
export async function gstr1Month(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) return { error: "Choose a month." };
  const session = await requireSession(); const r = session.restaurant;
  const mods = modulesFor(r.property_type, session.profile.role, r.enabled_modules ?? null, session.profile.allowed_modules ?? null);
  if (!mods.includes("tax") && !session.isAdmin) return { error: "Only the owner, a manager or a supervisor can build the return." };
  const s = await createClient(); const rid = r.id; const w = monthWindow(month);
  const pin = pinTo(session.isAdmin, rid);
  try {
    const [bills, invoices, credits, series, invoiceNos] = await Promise.all([
      allRows((a, b) => pin(s.from("bills").select("id, bill_no, order_id, paid_at, subtotal, discount_amount, service_charge, promise_fee, charges, cgst, sgst, total, tax_lines, gst_by_operator"))
        .eq("status", "paid").gte("paid_at", w.fromTs).lt("paid_at", w.toTs).order("bill_no").range(a, b)),
      allRows((a, b) => pin(s.from("invoices").select("id, invoice_no, kind, bill_id, guest_gstin, guest_name, lines, subtotal, discount, cgst, sgst, total, status, issued_at"))
        .or("kind.in.(stay,facility),guest_gstin.not.is.null").gte("issued_at", w.fromTs).lt("issued_at", w.toTs).order("invoice_no").range(a, b)),
      allRows((a, b) => pin(s.from("credit_notes").select("id, cn_no, bill_id, invoice_id, amount, taxable, cgst, sgst, tax_lines, created_at"))
        .gte("created_at", w.fromTs).lt("created_at", w.toTs).order("cn_no").range(a, b)),
      allRows((a, b) => pin(s.from("bills").select("bill_no, status")).gte("created_at", w.fromTs).lt("created_at", w.toTs).order("bill_no").range(a, b)),
      allRows((a, b) => pin(s.from("invoices").select("invoice_no, status")).gte("issued_at", w.fromTs).lt("issued_at", w.toTs).order("invoice_no").range(a, b)),
    ]);
    // the dishes on each bill's order, for the HSN table (order_items.hsn / gst_rate are the dish's at the time, 0146)
    const orderIds = [...new Set(bills.filter((b) => !b.gst_by_operator).map((b) => String(b.order_id)))];
    const items: Row[] = [];
    for (let i = 0; i < orderIds.length; i += 150) {
      items.push(...await allRows((a, b) => pin(s.from("order_items").select("order_id, qty, price_snapshot, hsn, gst_rate, status, name_snapshot, menu_items(hsn)"))
        .in("order_id", orderIds.slice(i, i + 150)).neq("status", "cancelled").range(a, b)));
    }
    const itemsByOrder = new Map<string, Gstr1Item[]>();
    for (const it of items) {
      const mi = it.menu_items as { hsn?: string | null } | null; const list = itemsByOrder.get(String(it.order_id)) ?? []; itemsByOrder.set(String(it.order_id), list);
      list.push({ hsn: (it.hsn as string | null) ?? mi?.hsn ?? null, name: String(it.name_snapshot ?? ""), qty: num(it.qty), value: Math.round(num(it.price_snapshot) * num(it.qty) * 100) / 100, rate: it.gst_rate == null ? null : num(it.gst_rate) });
    }
    // which operator a 9(5) bill came through — a label for the CA; the file needs the operator's GSTIN, which is not held
    const ecoIds = bills.filter((b) => b.gst_by_operator).map((b) => String(b.id)); const operatorOf = new Map<string, string>();
    if (ecoIds.length) {
      const { data: ops } = await s.from("bills").select("id, orders(order_channels(kind, label))").in("id", ecoIds.slice(0, 1000));
      for (const o of (ops ?? []) as unknown as { id: string; orders: { order_channels: { kind: string; label: string } | null } | null }[]) {
        const ch = o.orders?.order_channels; if (ch) operatorOf.set(o.id, ch.label || ch.kind);
      }
    }
    // a credit note's buyer is the buyer on its bill's tax invoice (which may have been issued in another month)
    const invGstin = new Map(invoices.map((i) => [String(i.id), (i.guest_gstin as string | null) ?? null]));
    const missing = [...new Set(credits.map((c) => c.invoice_id as string | null).filter((id): id is string => !!id && !invGstin.has(id)))];
    if (missing.length) {
      const { data: more } = await s.from("invoices").select("id, guest_gstin").in("id", missing.slice(0, 1000));
      for (const i of (more ?? []) as { id: string; guest_gstin: string | null }[]) invGstin.set(i.id, i.guest_gstin);
    }
    const defaultRate = num(r.gst_rate);
    const input: Gstr1Input = {
      gstin: r.gstin ?? "", stateCode: r.gst_state_code ?? (r.gstin ?? "").slice(0, 2), month, defaultRate,
      bills: bills.map((b) => {
        // 0146: the bill's tax per rate; an older bill as gst_summary reads it — one part at its blended rate
        const base = num(b.subtotal) - num(b.discount_amount) + num(b.service_charge);
        const tl = parts(b.tax_lines);
        return {
          id: String(b.id), no: num(b.bill_no), date: istDate(String(b.paid_at)), total: num(b.total), byOperator: !!b.gst_by_operator, operator: operatorOf.get(String(b.id)) ?? null,
          parts: tl && tl.length ? tl : [{ rate: base > 0 ? Math.round(((num(b.cgst) + num(b.sgst)) / base) * 1000) / 10 : 0, taxable: Math.round(base * 100) / 100, cgst: num(b.cgst), sgst: num(b.sgst) }],
          items: itemsByOrder.get(String(b.order_id)) ?? [],
        };
      }),
      invoices: invoices.filter((i) => String(i.status ?? "") !== "void").map((i) => ({
        id: String(i.id), no: num(i.invoice_no), kind: String(i.kind) as "stay" | "facility" | "dining", date: istDate(String(i.issued_at)), billId: (i.bill_id as string | null) ?? null,
        buyerGstin: (i.guest_gstin as string | null) ?? null, buyerName: (i.guest_name as string | null) ?? null,
        lines: (Array.isArray(i.lines) ? (i.lines as Row[]) : []).map((l) => ({ sac: (l.sac as string | null) ?? null, description: String(l.description ?? ""), qty: num(l.qty), taxable: num(l.taxable ?? l.amount), rate: num(l.gst_rate), gst: num(l.gst) })),
        taxable: Math.round((num(i.subtotal) - num(i.discount)) * 100) / 100, cgst: num(i.cgst), sgst: num(i.sgst), total: num(i.total),
      })),
      creditNotes: credits.map((c) => ({
        id: String(c.id), no: num(c.cn_no), date: istDate(String(c.created_at)), amount: num(c.amount), taxable: num(c.taxable), cgst: num(c.cgst), sgst: num(c.sgst),
        parts: parts(c.tax_lines), buyerGstin: c.invoice_id ? invGstin.get(String(c.invoice_id)) ?? null : null,
      })),
      documents: {
        bills: series.map((b) => ({ no: num(b.bill_no), cancelled: String(b.status) === "void" })),
        invoices: invoiceNos.filter((i) => String(i.status ?? "") !== "void").map((i) => num(i.invoice_no)),
        creditNotes: credits.map((c) => num(c.cn_no)),
      },
    };
    const built = buildGstr1(input);
    return { ok: true as const, ...built };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not read the month." };
  }
}
/** The company and ledger names the Tally file uses (0105 tally_settings_save; owner or manager). */
export async function saveTallyNames(company: string, ledgers: Record<string, string>) {
  const s = await createClient();
  const { error } = await s.rpc("tally_settings_save", { p_company: company, p_ledgers: ledgers });
  if (error) return { error: error.message };
  revalidatePath("/tax"); return { ok: true as const };
}
