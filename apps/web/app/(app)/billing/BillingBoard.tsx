"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Banknote, Smartphone, CreditCard, Receipt, Search, Clock3, ChevronRight, UserRound, Wallet, TrendingUp, AlertCircle, ShoppingBag, Bike, Armchair, BedDouble } from "lucide-react";
import { cn } from "@/components/ui";
import { formatINR, fmtTime } from "@/lib/format";

type Line = { qty: number; price_snapshot: number; status: string };
export type OpenOrder = { id: string; order_no: number; type: string; token_no: number | null; customer_name: string | null; created_at: string; dining_tables: { name: string } | null; order_items: Line[] };
type Pay = { method: string; amount: number; received_by: string | null };
export type TodayBill = { id: string; bill_no: number; total: number; status: string; created_at: string; paid_at: string | null; created_by: string | null;
  orders: { order_no: number; type: string; token_no: number | null; customer_name: string | null; dining_tables: { name: string } | null } | null; payments: Pay[] };

const KIND: Record<string, { label: string; Icon: typeof Armchair }> = {
  dine_in: { label: "Dine in", Icon: Armchair }, takeaway: { label: "Parcel", Icon: ShoppingBag }, delivery: { label: "Delivery", Icon: Bike }, room_service: { label: "Room", Icon: BedDouble },
};
const METHOD: Record<string, { label: string; Icon: typeof Banknote; hue: string }> = {
  cash: { label: "Cash", Icon: Banknote, hue: "var(--color-green)" }, upi: { label: "UPI", Icon: Smartphone, hue: "var(--color-blue)" }, card: { label: "Card", Icon: CreditCard, hue: "var(--color-violet)" },
};
const mins = (iso: string) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
const age = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`);
const whereOf = (o: { type: string; token_no: number | null; customer_name: string | null; dining_tables: { name: string } | null } | null) =>
  o?.dining_tables?.name ?? (o?.token_no ? `Token ${o.token_no}` : o?.customer_name || (o ? KIND[o.type]?.label : "") || "—");
const first = (n?: string | null) => (n ?? "").split(" ")[0] || "—";

/**
 * The counter, at a glance and at a tap (2026-10-24). The person at the counter (from the login) heads it; the day in six
 * figures with the payment mix as one bar; then the two lists side by side from lg — Ready to bill (filter by kind, oldest
 * or biggest first, the wait coloured as it grows) and Today's bills (search, filter by state; each bill says who billed it
 * and who took the money). Money through formatINR; a bill keeps its paise.
 */
export function BillingBoard({ open, bills, names, cashier, me }: { open: OpenOrder[]; bills: TodayBill[]; names: Record<string, string>; cashier: string; me: string }) {
  const [kind, setKind] = useState<string>("all"); const [sort, setSort] = useState<"oldest" | "biggest">("oldest");
  const [q, setQ] = useState(""); const [state, setState] = useState<"all" | "paid" | "unpaid" | "void">("all");

  const paid = bills.filter((b) => b.status === "paid");
  const sales = paid.reduce((t, b) => t + Number(b.total), 0);
  const unpaid = bills.filter((b) => b.status === "unpaid");
  const byMethod = (m: string) => paid.flatMap((b) => b.payments).filter((p) => p.method === m).reduce((t, p) => t + Number(p.amount), 0);
  const mix = (["cash", "upi", "card"] as const).map((m) => ({ m, v: byMethod(m) }));
  const mixTotal = mix.reduce((t, x) => t + x.v, 0);
  const myBills = paid.filter((b) => b.payments.some((p) => p.received_by === me)).length;

  const totalOf = (o: OpenOrder) => o.order_items.filter((i) => i.status !== "cancelled").reduce((t, i) => t + i.qty * Number(i.price_snapshot), 0);
  const kinds = useMemo(() => { const c: Record<string, number> = {}; for (const o of open) c[o.type] = (c[o.type] ?? 0) + 1; return c; }, [open]);
  const ready = open.filter((o) => kind === "all" || o.type === kind).sort((a, b) => sort === "biggest" ? totalOf(b) - totalOf(a) : +new Date(a.created_at) - +new Date(b.created_at));
  const needle = q.trim().toLowerCase();
  const shown = bills.filter((b) => (state === "all" || b.status === state) && (!needle || [`#${b.bill_no}`, String(b.bill_no), `${b.orders?.order_no ?? ""}`, whereOf(b.orders), b.orders?.customer_name ?? "", names[b.created_by ?? ""] ?? ""].some((x) => x.toLowerCase().includes(needle))));

  const chip = (on: boolean) => cn("h-9 px-3 rounded-full text-[12.5px] font-bold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap", on ? "bg-[var(--color-label)] text-[var(--color-on-label)]" : "bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)] text-[var(--color-label)]");

  return (
    <div className="space-y-5" data-billing-board>
      {/* who is at the counter */}
      <div className="flex flex-wrap items-center gap-2" data-cashier>
        <span className="inline-flex items-center gap-2 h-10 pl-1.5 pr-3.5 rounded-full bg-[var(--color-bg-2)] border border-[var(--color-separator)]">
          <span className="h-7 w-7 rounded-full grid place-items-center bg-[var(--color-tint)] text-[var(--color-on-tint)] font-display text-[14px]">{cashier.slice(0, 1)}</span>
          <span className="text-[13px]"><span className="text-steel">At the counter · </span><b>{cashier}</b></span>
        </span>
        <span className="inline-flex items-center gap-1.5 h-10 px-3.5 rounded-full bg-[var(--color-fill)] text-[13px] font-semibold num"><Receipt size={15} aria-hidden />{myBills} paid to you today</span>
      </div>

      {/* the day in figures, and the payment mix as one bar */}
      <section className="rounded-[24px] border border-[var(--color-separator)] bg-[var(--color-bg-2)] p-4 sm:p-5" data-billing-figures>
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
          {([
            ["Today's sales", formatINR(sales), `${paid.length} paid`, TrendingUp, "var(--color-tint)"],
            ["Average bill", formatINR(paid.length ? sales / paid.length : 0), "per paid bill", Wallet, "var(--color-blue)"],
            ["Unpaid", formatINR(unpaid.reduce((t, b) => t + Number(b.total), 0)), `${unpaid.length} waiting`, AlertCircle, unpaid.length ? "var(--color-orange)" : "var(--color-label-3)"],
            ...mix.map(({ m, v }) => [METHOD[m].label, formatINR(v), mixTotal ? `${Math.round((v / mixTotal) * 100)}%` : "—", METHOD[m].Icon, METHOD[m].hue] as const),
          ] as const).map(([k, v, sub, I, hue]) => (
            <div key={k} className="min-w-0 rounded-[18px] bg-[var(--color-fill)] p-3" data-figure={k}>
              <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--color-label-2)]"><span className="h-6 w-6 rounded-full grid place-items-center" style={{ background: `color-mix(in srgb, ${hue} 16%, transparent)`, color: hue }}><I size={13} aria-hidden /></span>{k}</div>
              <div className="font-display num text-[22px] sm:text-[24px] leading-tight mt-1.5 truncate">{v}</div>
              <div className="text-[11.5px] text-steel num">{sub}</div>
            </div>
          ))}
        </div>
        {mixTotal > 0 && (
          <div className="mt-4" data-pay-mix>
            <div className="flex h-2.5 rounded-full overflow-hidden bg-[var(--color-fill)]">
              {mix.filter((x) => x.v > 0).map(({ m, v }) => <span key={m} style={{ width: `${(v / mixTotal) * 100}%`, background: METHOD[m].hue }} title={`${METHOD[m].label} ${formatINR(v)}`} />)}
            </div>
          </div>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-2 items-start">
        {/* ready to bill */}
        <section className="min-w-0 rounded-[24px] border border-[var(--color-separator)] bg-[var(--color-bg-2)] overflow-hidden" data-ready-to-bill>
          <header className="px-4 pt-4 pb-3 border-b border-[var(--color-separator)]">
            <div className="flex items-center gap-2"><h2 className="text-[17px] font-extrabold flex-1">Ready to bill</h2><span className="num h-7 min-w-7 px-2 rounded-full bg-[var(--color-fill)] text-[13px] font-bold grid place-items-center">{open.length}</span></div>
            <div className="mt-3 flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] -mx-1 px-1">
              <button type="button" className={chip(kind === "all")} onClick={() => setKind("all")} aria-pressed={kind === "all"}>All</button>
              {Object.entries(kinds).map(([k, n]) => { const K = KIND[k] ?? KIND.dine_in; return <button key={k} type="button" className={chip(kind === k)} onClick={() => setKind(k)} aria-pressed={kind === k} data-kind={k}><K.Icon size={14} aria-hidden />{K.label}<span className="num opacity-70">{n}</span></button>; })}
              <span className="flex-1" />
              <button type="button" className={chip(false)} onClick={() => setSort(sort === "oldest" ? "biggest" : "oldest")} data-sort={sort}>{sort === "oldest" ? "Oldest first" : "Biggest first"}</button>
            </div>
          </header>
          {ready.length === 0 ? <p className="p-6 text-sm text-steel text-center">Nothing to bill.</p> : (
            <ul className="divide-y divide-[var(--color-separator)]">
              {ready.map((o) => { const m = mins(o.created_at); const t = totalOf(o); const K = KIND[o.type] ?? KIND.dine_in; const n = o.order_items.filter((i) => i.status !== "cancelled").reduce((a, i) => a + i.qty, 0); return (
                <li key={o.id}>
                  <Link href={`/billing/${o.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--color-fill)] transition-colors min-w-0" data-bill-order={o.order_no}>
                    <span className="h-12 min-w-12 px-2 shrink-0 rounded-[14px] grid place-items-center bg-[var(--color-fill)] font-display text-[18px] leading-none">{o.dining_tables?.name ?? (o.token_no ? `#${o.token_no}` : <K.Icon size={20} aria-hidden />)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold truncate">{whereOf(o)}{o.customer_name && o.dining_tables ? ` · ${o.customer_name}` : ""}</span>
                      <span className="mt-0.5 flex items-center gap-2 text-[12px] text-steel num"><span>#{o.order_no}</span><span>·</span><span>{n} item{n === 1 ? "" : "s"}</span><span>·</span>
                        <span className={cn("inline-flex items-center gap-1 font-semibold", m >= 90 ? "text-[var(--color-red)]" : m >= 45 ? "text-[var(--color-orange)]" : "")}><Clock3 size={12} aria-hidden />{age(m)}</span></span>
                    </span>
                    <span className="font-display num text-[19px] shrink-0">{formatINR(t)}</span>
                    <ChevronRight size={18} className="shrink-0 text-[var(--color-label-3)]" aria-hidden />
                  </Link>
                </li>); })}
            </ul>
          )}
        </section>

        {/* today's bills */}
        <section className="min-w-0 rounded-[24px] border border-[var(--color-separator)] bg-[var(--color-bg-2)] overflow-hidden" data-todays-bills>
          <header className="px-4 pt-4 pb-3 border-b border-[var(--color-separator)]">
            <div className="flex items-center gap-2"><h2 className="text-[17px] font-extrabold flex-1">Today&apos;s bills</h2><span className="num h-7 min-w-7 px-2 rounded-full bg-[var(--color-fill)] text-[13px] font-bold grid place-items-center">{bills.length}</span></div>
            <div className="mt-3 relative"><Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-steel pointer-events-none" aria-hidden />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Bill, order, table or name" aria-label="Find a bill" className="!h-11 !rounded-full !pl-10 w-full" data-bill-search /></div>
            <div className="mt-2.5 flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] -mx-1 px-1">
              {(["all", "paid", "unpaid", "void"] as const).map((k) => <button key={k} type="button" className={chip(state === k)} onClick={() => setState(k)} aria-pressed={state === k} data-bill-state={k}>{k === "all" ? "All" : k[0].toUpperCase() + k.slice(1)}<span className="num opacity-70">{k === "all" ? bills.length : bills.filter((b) => b.status === k).length}</span></button>)}
            </div>
          </header>
          {shown.length === 0 ? <p className="p-6 text-sm text-steel text-center">{bills.length ? "No bill matches." : "No bills yet today."}</p> : (
            <ul className="divide-y divide-[var(--color-separator)]">
              {shown.map((b) => { const took = [...new Set(b.payments.map((p) => p.received_by).filter(Boolean) as string[])].map((id) => first(names[id])); return (
                <li key={b.id}>
                  <Link href={`/billing/${b.id}?bill=1`} className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--color-fill)] transition-colors min-w-0" data-bill-row={b.bill_no}>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 min-w-0"><span className="num text-[12px] font-bold text-steel shrink-0">#{b.bill_no}</span><span className="font-semibold truncate">{whereOf(b.orders)}</span>
                        <span className={cn("shrink-0 h-5 px-2 rounded-full text-[10.5px] font-bold uppercase tracking-wide inline-flex items-center", b.status === "paid" ? "bg-[var(--color-green-2)] text-[var(--color-green)]" : b.status === "void" ? "bg-[var(--color-red-2)] text-[var(--color-red)]" : "bg-[var(--color-orange-2)] text-[var(--color-orange)]")}>{b.status}</span></span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-steel">
                        {b.payments.map((p, i) => { const M = METHOD[p.method]; return <span key={i} className="inline-flex items-center gap-1 num">{M ? <M.Icon size={12} aria-hidden style={{ color: M.hue }} /> : null}{M?.label ?? p.method} {formatINR(Number(p.amount))}</span>; })}
                        <span className="inline-flex items-center gap-1" data-billed-by><UserRound size={12} aria-hidden />Billed by {first(names[b.created_by ?? ""])}{took.length ? ` · paid to ${took.join(", ")}` : ""}</span>
                      </span>
                    </span>
                    <span className="text-right shrink-0"><span className="block font-display num text-[18px]">{formatINR(Number(b.total))}</span><span className="block text-[11.5px] text-steel num">{fmtTime(b.paid_at ?? b.created_at)}</span></span>
                  </Link>
                </li>); })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
