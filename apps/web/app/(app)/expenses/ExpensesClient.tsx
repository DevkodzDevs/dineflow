"use client";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, FileSpreadsheet, Plus, Ban, Banknote, Smartphone, CreditCard, Landmark, Carrot, ShoppingBasket, Fish, Milk, Flame, Zap, Droplets, Building2, Users, UtensilsCrossed, Wrench, SprayCan, Package, Megaphone, Truck, Ellipsis, type LucideIcon } from "lucide-react";
import { Card, Empty, cn, useToast } from "@/components/ui";
import { formatINR, todayIST } from "@/lib/format";
import { addExpense, voidExpense } from "./actions";
import { Say } from "@/components/ui/Say";

export type Expense = { id: string; spent_on: string; category: string; payee: string | null; amount: number; gst_amount: number; method: "cash" | "upi" | "card" | "bank"; ref: string | null; note: string | null; created_by: string | null; created_at: string; voided_at: string | null; void_reason: string | null };

/** The usual heads for an Indian restaurant; anything else is typed in. */
export const CATEGORIES = ["Vegetables", "Groceries", "Meat & fish", "Dairy", "Gas", "Electricity", "Water", "Rent", "Salaries", "Staff food", "Repairs", "Cleaning", "Packaging", "Marketing", "Transport", "Other"];
/** each head its picture and its colour, so the one you want is found by eye before it is read */
const CAT_ICON: Record<string, [LucideIcon, string]> = { Vegetables: [Carrot, "green"], Groceries: [ShoppingBasket, "orange"], "Meat & fish": [Fish, "red"], Dairy: [Milk, "sky"], Gas: [Flame, "orange"], Electricity: [Zap, "saffron"], Water: [Droplets, "cyan"], Rent: [Building2, "violet"], Salaries: [Users, "blue"], "Staff food": [UtensilsCrossed, "green"], Repairs: [Wrench, "steel"], Cleaning: [SprayCan, "cyan"], Packaging: [Package, "orange"], Marketing: [Megaphone, "violet"], Transport: [Truck, "blue"], Other: [Ellipsis, "steel"] };
const METHODS = [["cash", "Cash", Banknote], ["upi", "UPI", Smartphone], ["card", "Card", CreditCard], ["bank", "Bank", Landmark]] as const;
const inr = (n: number) => formatINR(Number(n));
/** "Today", "Yesterday", else "Mon, 26 Oct" — the business day is IST */
const dayName = (d: string) => { const t = todayIST(); const y = new Date(Date.parse(t + "T00:00:00Z") - 86400000).toISOString().slice(0, 10); return d === t ? "Today" : d === y ? "Yesterday" : day(d); };
const day = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
const shift = (m: string, by: number) => { const [y, mo] = m.split("-").map(Number); const d = new Date(Date.UTC(y, mo - 1 + by, 1)); return d.toISOString().slice(0, 7); };
/** expense_add takes cash out of the drawer only for cash paid on the day it was entered (IST) — the same test here */
const fromDrawer = (e: Expense) => e.method === "cash" && new Date(Date.parse(e.created_at) + 5.5 * 3600e3).toISOString().slice(0, 10) === e.spent_on;
const monthName =(m: string) => new Date(m + "-01T00:00:00").toLocaleDateString("en-IN", { month: "long", year: "numeric" });

/**
 * The form first — category chips, amount, how it was paid — because entering one is what happens ten times a day.
 * Then the month: its total, today's, the heads it went on, and every entry (struck-out ones stay, crossed through,
 * with the reason). Excel downloads what is listed.
 */
export function ExpensesClient({ month, today, rows, names, canVoid, property }: { month: string; today: string; rows: Expense[]; names: Record<string, string>; canVoid: boolean; property: string }) {
  const toast = useToast(); const [pending, start] = useTransition();
  const [f, setF] = useState({ spent_on: today, category: "", payee: "", amount: "", gst: "", method: "cash", ref: "", note: "" });
  const [err, setErr] = useState<string | null>(null);
  const [only, setOnly] = useState<string | null>(null);
  const live = rows.filter((r) => !r.voided_at);
  const total = live.reduce((a, r) => a + Number(r.amount), 0);
  const todayTotal = live.filter((r) => r.spent_on === today).reduce((a, r) => a + Number(r.amount), 0);
  const gst = live.reduce((a, r) => a + Number(r.gst_amount), 0);
  const heads = useMemo(() => { const m = new Map<string, number>(); for (const r of live) m.set(r.category, (m.get(r.category) ?? 0) + Number(r.amount)); return [...m].sort((a, b) => b[1] - a[1]); }, [live]);
  const max = Math.max(1, ...heads.map(([, v]) => v));
  const list = only ? rows.filter((r) => r.category === only) : rows;
  /* the phone's day groups, in the list's own order (newest first) */
  const byDay = list.reduce<[string, typeof list][]>((g, e) => { const last = g[g.length - 1]; if (last && last[0] === e.spent_on) last[1].push(e); else g.push([e.spent_on, [e]]); return g; }, []);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));

  const save = () => start(async () => {
    setErr(null);
    const amount = Number(f.amount); const g = Number(f.gst || 0);
    if (f.category.trim().length < 2) return setErr("Choose what it was for");
    if (!(amount > 0)) return setErr("Enter the amount");
    if (g < 0 || g > amount) return setErr("The GST cannot be more than the amount");
    const r = await addExpense({ ...f, category: f.category.trim(), amount, gst: g });
    if ("error" in r) return setErr(r.error!);
    toast(`${f.category} · ${inr(amount)} saved${f.method === "cash" && f.spent_on === today ? " · from drawer" : ""}`);
    setF((x) => ({ ...x, payee: "", amount: "", gst: "", ref: "", note: "" }));
  });
  const strike = (e: Expense) => {
    const reason = prompt(`Strike out ${e.category} · ${inr(e.amount)}? Say why:`); if (!reason) return;
    start(async () => { const r = await voidExpense(e.id, reason); if ("error" in r) toast(r.error!, "err"); else toast(fromDrawer(e) ? "Struck out, cash returned" : "Struck out"); });
  };
  const excel = async () => {
    const { xlsx, download, XLSX_TYPE } = await import("@/lib/xlsx");
    const sheet = [["Date", "Category", "Paid to", "Amount", "GST in it", "Paid by", "Ref", "Note", "Entered by", "Struck out"],
      ...list.map((r) => [r.spent_on, r.category, r.payee ?? "", Number(r.amount), Number(r.gst_amount), r.method.toUpperCase(), r.ref ?? "", r.note ?? "", r.created_by ? names[r.created_by] ?? "" : "", r.voided_at ? `yes — ${r.void_reason ?? ""}` : ""])];
    download(`${property.replace(/[^\w]+/g, "-").toLowerCase()}-expenses-${month}.xlsx`, xlsx([{ name: `Expenses ${month}`, rows: sheet }]), XLSX_TYPE);
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        {/* ── the form ── */}
        <Card data-expense-form>
          <div className="text-[17px] font-extrabold mb-3">Add an expense</div>
          <div className="text-[12.5px] font-bold uppercase tracking-wide text-steel mb-2">For</div>
          {/* icon tiles, as many across as fit (four on a phone, three on the narrowest) — not 16 pills wrapping raggedly */}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(4.6rem,1fr))] gap-2" role="group" aria-label="Category" data-cat-grid>
            {CATEGORIES.map((c) => { const [I, hue] = CAT_ICON[c]; const on = f.category === c || (c === "Other" && !!f.category && !CATEGORIES.includes(f.category)); return (
              <button key={c} type="button" aria-pressed={on} onClick={() => set("category", c)} data-cat-chip
                className={cn("min-w-0 !min-h-[4.5rem] rounded-2xl px-1 py-2 flex flex-col items-center justify-center gap-1.5 ring-inset transition-[background-color,transform] duration-150 active:scale-[0.97]",
                  on ? "ring-2 ring-[var(--color-tint)] bg-[color-mix(in_srgb,var(--color-tint)_14%,transparent)]" : "ring-1 ring-[var(--color-separator)] bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)]")}>
                <span className="h-8 w-8 rounded-[10px] grid place-items-center" style={{ background: `color-mix(in srgb, var(--color-${hue}) ${on ? 28 : 16}%, transparent)`, color: `var(--color-${hue})` }} aria-hidden><I size={17} strokeWidth={2.2} /></span>
                <span className={cn("max-w-full text-center text-[12px] leading-[1.15] font-bold [text-wrap:balance]", on ? "text-[var(--color-label)]" : "text-[var(--color-label-2)]")}>{c}</span>
              </button>); })}
          </div>
          {f.category === "Other" || (f.category && !CATEGORIES.includes(f.category)) ? <input className="mt-2" placeholder="What was it for?" value={f.category === "Other" ? "" : f.category} onChange={(e) => set("category", e.target.value || "Other")} maxLength={40} /> : null}
          <div className="mt-4 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
            <label className="min-w-0"><span className="text-[13px] font-semibold text-steel">Amount (₹)</span><input className="mt-1 num !text-[20px] !h-14 font-bold" inputMode="decimal" value={f.amount} onChange={(e) => set("amount", e.target.value.replace(/[^\d.]/g, ""))} placeholder="0" data-expense-amount /></label>
            <label className="min-w-0"><span className="text-[13px] font-semibold text-steel">GST in it (if any)</span><input className="mt-1 num !h-14" inputMode="decimal" value={f.gst} onChange={(e) => set("gst", e.target.value.replace(/[^\d.]/g, ""))} placeholder="0" /></label>
          </div>
          <div className="mt-3 text-[13px] font-semibold text-steel mb-1.5">Paid by</div>
          <div className="grid grid-cols-4 gap-2" role="group" aria-label="Paid by">
            {METHODS.map(([k, label, I]) => <button key={k} type="button" aria-pressed={f.method === k} onClick={() => set("method", k)} data-method={k}
              className={cn("!min-h-12 rounded-2xl flex items-center justify-center gap-1.5 text-[14px] font-bold", f.method === k ? "bg-[var(--color-label)] text-[var(--color-on-label)]" : "bg-[var(--color-fill)]")}><I size={16} aria-hidden />{label}</button>)}
          </div>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-3">
            <label className="min-w-0"><span className="text-[13px] font-semibold text-steel">Paid to</span><input className="mt-1" value={f.payee} onChange={(e) => set("payee", e.target.value)} placeholder="Murugan stores" maxLength={80} /></label>
            <label className="min-w-0"><span className="text-[13px] font-semibold text-steel">Date</span><input type="date" className="mt-1" value={f.spent_on} max={today} onChange={(e) => set("spent_on", e.target.value)} /></label>
          </div>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-3">
            <label className="min-w-0"><span className="text-[13px] font-semibold text-steel">Bill / UTR no.</span><input className="mt-1" value={f.ref} onChange={(e) => set("ref", e.target.value)} maxLength={60} /></label>
            <label className="min-w-0"><span className="text-[13px] font-semibold text-steel">Note</span><input className="mt-1" value={f.note} onChange={(e) => set("note", e.target.value)} maxLength={300} /></label>
          </div>
          {err && <p className="mt-3 text-[14px] font-semibold text-chili" role="alert">{err}</p>}
          <button type="button" disabled={pending} onClick={save} className="svc-btn go w-full mt-4" data-save-expense><Plus size={19} aria-hidden /><Say w="save_expense" /></button>
        </Card>

        {/* ── the month ── */}
        <div className="space-y-4 min-w-0">
          <div className="flex items-center gap-2">
            <Link href={`/expenses?m=${shift(month, -1)}`} className="h-11 w-11 grid place-items-center rounded-xl bg-[var(--color-fill)]" aria-label="Previous month"><ChevronLeft size={18} /></Link>
            <div className="flex-1 text-center text-[17px] font-extrabold" data-month>{monthName(month)}</div>
            <Link href={`/expenses?m=${shift(month, 1)}`} aria-disabled={month >= today.slice(0, 7)} className={cn("h-11 w-11 grid place-items-center rounded-xl bg-[var(--color-fill)]", month >= today.slice(0, 7) && "pointer-events-none opacity-40")} aria-label="Next month"><ChevronRight size={18} /></Link>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[["This month", total], ["Today", month === today.slice(0, 7) ? todayTotal : 0], ["GST in it", gst]].map(([k, v]) => (
              <div key={k as string} className="feather !rounded-[18px] px-3.5 py-3 min-w-0"><div className="text-[12px] font-bold text-steel">{k}</div><div className="font-display num text-[22px] leading-tight truncate" title={inr(v as number)} data-expense-total={k}>{formatINR(Number(v), { whole: true })}</div></div>))}
          </div>
          <Card>
            <div className="text-[15px] font-extrabold mb-2.5">Where it went</div>
            {heads.length === 0 ? <p className="text-sm text-steel">Nothing spent yet</p> : <div className="space-y-2">
              {heads.map(([c, v]) => (
                <button key={c} type="button" onClick={() => setOnly(only === c ? null : c)} aria-pressed={only === c} className={cn("!min-h-11 w-full text-left rounded-xl px-2 -mx-2 py-1.5", only === c ? "bg-[var(--color-fill)]" : "hover:bg-[var(--color-fill)]")}>
                  <div className="flex justify-between gap-2 text-[14px]"><span className="font-bold truncate">{c}</span><span className="num font-bold shrink-0">{inr(v)}</span></div>
                  <div className="mt-1 h-2 rounded-full bg-[var(--color-fill)] overflow-hidden"><div className="h-full rounded-full bg-[var(--color-orange)]" style={{ width: `${(v / max) * 100}%` }} /></div>
                </button>))}
            </div>}
          </Card>
        </div>
      </div>

      <Card data-expense-list>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <div className="text-[17px] font-extrabold">{only ? only : "Every expense"} <span className="text-steel text-[13px] font-semibold num">{list.length}</span></div>
          {only && <button type="button" className="!min-h-11 rounded-full px-3 text-[13px] font-bold bg-[var(--color-fill)]" onClick={() => setOnly(null)}>Show all</button>}
          <span className="flex-1" />
          <button type="button" disabled={!list.length} onClick={() => void excel()} className="svc-btn quiet sm !px-4" data-expense-xlsx><FileSpreadsheet size={16} aria-hidden /> Excel</button>
        </div>
        {list.length === 0 ? <Empty title="No expenses this month" hint="Add one above" /> : (
          <>
          {/* A phone (2026-10-27, the owner, of the first pass: "not looking good — ultra modern"): the day is a heading with its
              total, as a bank's app lists money; each expense is a soft card — its category's icon in its colour, what and who
              to, the amount large with the paise small — and its details are chips (how it was paid, the bill, the GST, who
              wrote it), with Strike out a round key at the end of them instead of a labelled button under every card. */}
          <div className="sm:hidden space-y-5" data-expense-days>
            {byDay.map(([d, items]) => (
              <section key={d} data-expense-day={d}>
                <div className="flex items-baseline justify-between gap-3 px-1 mb-2">
                  <span className="text-[11.5px] font-extrabold uppercase tracking-[.12em] text-steel">{dayName(d)}</span>
                  <span className="text-[12.5px] font-bold num text-[var(--color-label-2)]">{inr(items.filter((x) => !x.voided_at).reduce((t, x) => t + Number(x.amount), 0))}</span>
                </div>
                <div className="space-y-2.5">
                  {items.map((e) => { const [CI, hue] = CAT_ICON[e.category] ?? CAT_ICON.Other; const M = METHODS.find(([m]) => m === e.method); const MI = M?.[2];
                    const [whole, paise] = inr(e.amount).split("."); const by = e.created_by ? names[e.created_by] : null; return (
                    <div key={e.id} data-expense-card={e.id} style={{ ["--hue" as string]: `var(--color-${hue})` }}
                      className={cn("relative overflow-hidden rounded-[22px] bg-[var(--color-bg-2)] ring-1 ring-[var(--color-separator)] p-3.5 shadow-[0_8px_22px_-18px_rgb(0_0_0/0.6)]", e.voided_at && "opacity-60")}>
                      <span aria-hidden className="absolute inset-y-4 left-0 w-[3px] rounded-r-full bg-[var(--hue)] opacity-80" />
                      <div className="flex items-start gap-3">
                        <span className="h-11 w-11 shrink-0 rounded-[15px] grid place-items-center bg-[color-mix(in_srgb,var(--hue)_16%,transparent)] text-[var(--hue)]" aria-hidden><CI size={20} strokeWidth={2.2} /></span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start gap-2 min-w-0">
                            <span className={cn("min-w-0 flex-1 text-[15.5px] font-bold leading-snug truncate", e.voided_at && "line-through")}>{e.category}</span>
                            <span className={cn("shrink-0 font-display num leading-none text-[21px] pt-0.5", e.voided_at && "line-through")} data-expense-amount>{whole}<span className="text-[13px] text-steel">.{paise}</span></span>
                          </div>
                          <div className="mt-1 text-[13px] text-[var(--color-label-2)] truncate">{e.payee || "No payee"}{by ? <span className="text-steel"> · by {by}</span> : null}</div>
                        </div>
                      </div>
                      {e.note && <p className="mt-2.5 ml-14 text-[12.5px] leading-snug text-steel line-clamp-2 border-l-2 border-[var(--color-separator)] pl-2.5">{e.note}</p>}
                      <div className="mt-3 ml-14 flex items-center gap-1.5 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 min-w-0 flex-1">
                          <span className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-[var(--color-fill)] text-[11.5px] font-bold text-[var(--color-label-2)]">{MI && <MI size={13} aria-hidden />}{M ? M[1] : e.method.toUpperCase()}</span>
                          {e.ref && <span className="inline-flex items-center h-7 px-2.5 rounded-full bg-[var(--color-fill)] text-[11.5px] font-semibold text-steel num max-w-[9.5rem] truncate">#{e.ref}</span>}
                          {Number(e.gst_amount) > 0 && <span className="inline-flex items-center h-7 px-2.5 rounded-full bg-[color-mix(in_srgb,var(--color-blue)_14%,transparent)] text-[11.5px] font-bold text-[var(--color-blue)] num">GST {inr(e.gst_amount)}</span>}
                          {e.voided_at && <span className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-[var(--color-red-2)] text-[11.5px] font-bold text-[var(--color-red)] max-w-full truncate"><Ban size={12} aria-hidden />Struck out{e.void_reason ? ` · ${e.void_reason}` : ""}</span>}
                        </div>
                        {canVoid && !e.voided_at && <button type="button" disabled={pending} onClick={() => strike(e)} className="shrink-0 h-11 w-11 -my-1 -mr-1 rounded-full grid place-items-center text-steel bg-[var(--color-fill)] hover:text-chili active:scale-95 transition" aria-label={`Strike out ${e.category}`} title="Strike out" data-strike-phone><Ban size={17} /></button>}
                      </div>
                    </div>); })}
                </div>
              </section>))}
          </div>
          <div className="max-sm:hidden divide-y divide-[var(--color-separator)]">
            {list.map((e) => (<div key={e.id} className="contents">
              <div data-expense={e.id} className={cn("max-sm:hidden py-3 flex items-center gap-3 min-w-0", e.voided_at && "opacity-55")}>
                <div className="w-14 shrink-0 text-[12px] font-bold text-steel leading-tight">{day(e.spent_on)}</div>
                <div className="min-w-0 flex-1">
                  <div className={cn("text-[15px] font-bold truncate", e.voided_at && "line-through")}>{e.category}{e.payee && <span className="font-normal text-steel"> · {e.payee}</span>}</div>
                  <div className="text-[12.5px] text-steel truncate">{e.method.toUpperCase()}{e.ref ? ` · ${e.ref}` : ""}{Number(e.gst_amount) > 0 ? ` · GST ${inr(e.gst_amount)}` : ""}{e.created_by && names[e.created_by] ? ` · ${names[e.created_by]}` : ""}{e.note ? ` · ${e.note}` : ""}{e.voided_at ? ` · struck out: ${e.void_reason ?? ""}` : ""}</div>
                </div>
                <div className={cn("shrink-0 num font-extrabold text-[16px]", e.voided_at && "line-through")}>{inr(e.amount)}</div>
                {canVoid && !e.voided_at && <button type="button" disabled={pending} onClick={() => strike(e)} className="shrink-0 h-11 w-11 grid place-items-center rounded-xl text-steel hover:text-chili hover:bg-[var(--color-fill)]" aria-label={`Strike out ${e.category}`} data-strike><Ban size={17} /></button>}
              </div></div>))}
          </div>
          </>)}
      </Card>
    </div>
  );
}
