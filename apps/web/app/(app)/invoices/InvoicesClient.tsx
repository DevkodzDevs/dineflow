"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Printer, ArrowUpRight, ChevronRight, Receipt, TrendingUp, TrendingDown, LayoutGrid, Rows3 } from "lucide-react";
import { Pill, Sheet, cn, useToast } from "@/components/ui";
import { ViewSwitch, useViewPref } from "@/components/ui/ViewSwitch";
import { formatINR } from "@/lib/format";

export type Line = { description: string; qty: number; rate: number; amount: number; gst_rate: number; gst: number };
export type Invoice = {
  id: string; invoice_no: number; kind: string; guest_name: string | null; guest_phone: string | null;
  total: number; paid: number; subtotal: number; discount: number; cgst: number; sgst: number;
  status: string; issued_at: string; lines: Line[] | null;
};
export type Month = { key: string; label: string; total: number; count: number };

const no = (i: Invoice) => `INV-${String(i.invoice_no).padStart(5, "0")}`;
const due = (i: Invoice) => Math.max(0, Number(i.total) - Number(i.paid));
const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });

/** The detail pane only earns its keep where there is room for it beside the list. */
function useWide() {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = matchMedia("(min-width: 1280px)");
    const read = () => setWide(mq.matches);
    read(); mq.addEventListener("change", read);
    return () => mq.removeEventListener("change", read);
  }, []);
  return wide;
}

export function InvoicesClient({ invoices, months, property }: { invoices: Invoice[]; months: Month[]; property: string }) {
  const [sel, setSel] = useState<string | null>(null);
  const wide = useWide();
  const current = useMemo(() => invoices.find((i) => i.id === sel) ?? null, [sel, invoices]);
  /* Cards or the table (2026-10-25, the owner: "the Pantry switch, everywhere it is needed"): the table is 620px wide and
     a phone scrolled it sideways. Nothing chosen: cards below md, the table from md (CSS). The pin keeps a choice (df-view:invoices). */
  const lay = useViewPref("invoices", ["cards", "table"] as const); const toast = useToast();
  const shownAs = lay.chosen ?? (lay.wide === null ? null : lay.wide ? "table" : "cards");

  return (
    <>
      <MonthStrip months={months} />

      <div className="grid gap-4 items-start xl:grid-cols-[minmax(0,1fr)_minmax(360px,400px)]">
        <div className="min-w-0 space-y-3">
        <div className="flex items-center gap-3" data-invoices-bar>
          <span className="text-[13px] text-steel"><b className="num text-[var(--color-label)]">{invoices.length}</b> {invoices.length === 1 ? "invoice" : "invoices"}</span>
          <div className="ml-auto"><ViewSwitch label="Show invoices as" data="invoices" shown={shownAs} onPick={lay.pick} saved={lay.saved}
            onKeep={(v) => { lay.keep(v); toast(v === "table" ? "Table set as default" : "Cards set as default"); }}
            options={[{ v: "cards", label: "Cards", icon: LayoutGrid, word: "Cards" }, { v: "table", label: "Table", icon: Rows3, word: "Table" }]} /></div>
        </div>
        <div className={cn("grid gap-3 sm:grid-cols-2", lay.chosen === "table" ? "hidden" : lay.chosen === "cards" ? "" : "md:hidden")} data-invoice-cards>
          {invoices.map((i) => (
            <button key={i.id} type="button" onClick={() => setSel(i.id)} aria-label={`Open ${no(i)}`} data-invoice-card={i.id}
              className={cn("feather !rounded-[20px] p-4 min-w-0 text-left flex flex-col gap-2.5 transition hover:-translate-y-0.5 !min-h-0", sel === i.id && "!border-[var(--color-tint)]")}>
              <span className="flex items-center gap-2 min-w-0"><span className="num font-bold text-[15px]">{no(i)}</span><Pill tone={i.kind === "stay" ? "gold" : "preparing"}>{i.kind}</Pill><span className="ml-auto text-[12px] num text-steel whitespace-nowrap">{day(i.issued_at)}</span></span>
              <span className="text-[14px] truncate">{i.guest_name ?? "Walk-in"}</span>
              <span className="flex items-end gap-2 min-w-0"><span className="font-display num text-[22px] leading-none">{formatINR(Number(i.total))}</span><span className="ml-auto"><Pill tone={i.status === "paid" ? "ready" : "alert"}>{i.status}</Pill></span></span>
              {due(i) > 0 && <span className="text-[12px] font-semibold text-[var(--color-red)] num">{formatINR(due(i))} due</span>}
            </button>))}
        </div>
        <div className={cn("feather overflow-x-auto table-wrap", lay.chosen === "cards" ? "hidden" : lay.chosen === "table" ? "" : "hidden md:block")} data-invoice-table>
          <table className="w-full text-sm min-w-[620px]">
            <thead><tr>
              <th className="text-left px-4 py-3">No.</th>
              <th className="text-left px-4 py-3">Kind</th>
              <th className="text-left px-4 py-3">Guest</th>
              <th className="text-right px-4 py-3">Total</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-right px-4 py-3">Issued</th>
              <th className="px-2 py-3" />
            </tr></thead>
            <tbody>
              {invoices.map((i, k) => (
                <motion.tr key={i.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(k, 16) * 0.02 }}
                  onClick={() => setSel(i.id)} tabIndex={0} role="button" aria-label={`Open ${no(i)}`}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSel(i.id); } }}
                  className={cn("border-t border-line cursor-pointer transition-colors focus:outline-none relative", sel === i.id ? "bg-[var(--color-bg-3)] shadow-[inset_3px_0_0_0_var(--color-tint)]" : "hover:bg-porcelain/60 focus:bg-porcelain/60")}>
                  <td className="px-4 py-3 num font-semibold whitespace-nowrap">{no(i)}</td>
                  <td className="px-4 py-3"><Pill tone={i.kind === "stay" ? "gold" : "preparing"}>{i.kind}</Pill></td>
                  <td className="px-4 py-3"><span className="block truncate max-w-[180px]">{i.guest_name ?? "Walk-in"}</span></td>
                  <td className="px-4 py-3 text-right num font-semibold whitespace-nowrap">{formatINR(Number(i.total))}</td>
                  <td className="px-4 py-3"><Pill tone={i.status === "paid" ? "ready" : "alert"}>{i.status}</Pill></td>
                  <td className="px-4 py-3 text-right num text-steel whitespace-nowrap">{day(i.issued_at)}</td>
                  <td className="px-2 py-3 text-steel"><ChevronRight size={16} /></td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>

        {/* beside the list on a wide screen, so you can read one invoice after another without leaving */}
        <aside className="hidden xl:block sticky top-[92px]">
          {current
            ? <div className="feather p-5"><Detail inv={current} property={property} /></div>
            : <div className="feather p-8 text-center">
                <span className="h-11 w-11 rounded-2xl bg-fill grid place-items-center mx-auto text-steel"><Receipt size={18} /></span>
                <div className="mt-3 font-semibold">Pick an invoice</div>
              </div>}
        </aside>
      </div>

      {/* narrower than that, the same detail arrives as a sheet */}
      <Sheet open={!wide && !!current} onClose={() => setSel(null)} title={current ? no(current) : ""} wide>
        {current && <Detail inv={current} property={property} />}
      </Sheet>
    </>
  );
}

/**
 * Invoiced by month, as a column chart with a readout.
 *
 * It was a 3×2 grid of thin progress bars, each with a full ₹ amount and a count — twelve numbers
 * of equal weight that read as noise on a phone. Now: one series, one hue — bars from a common
 * baseline, the chosen month solid and the rest light — and the chosen month's figures in a
 * readout above them, with the change on the month before. Tap or hover a bar to read it. The
 * figures for every month are still there for a screen reader, in a table.
 */
function MonthStrip({ months }: { months: Month[] }) {
  const peak = Math.max(1, ...months.map((m) => m.total));
  const last = months[months.length - 1]?.key;
  const latestWithData = [...months].reverse().find((m) => m.total > 0)?.key ?? last;
  const [selKey, setSelKey] = useState<string | undefined>(latestWithData);
  const idx = Math.max(0, months.findIndex((m) => m.key === selKey));
  const sel = months[idx];
  const prev = idx > 0 ? months[idx - 1] : null;
  const change = prev && prev.total > 0 && sel ? Math.round(((sel.total - prev.total) / prev.total) * 100) : null;
  const sum = months.reduce((t, m) => t + m.total, 0);
  if (!sel) return null;
  return (
    <div className="feather p-4 sm:p-5 mb-4">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <span className="eyebrow">Invoiced by month</span>
        <span className="text-xs text-steel text-right">last {months.length} months · <span className="num text-[var(--color-label-2)]">{formatINR(sum, { whole: true })}</span></span>
      </div>
      {/* the readout: the chosen month, its total, its invoices, and how it moved */}
      <div className="flex flex-wrap items-end gap-x-4 gap-y-1 mb-4" aria-live="polite">
        <div className="min-w-0">
          <div className="text-[12.5px] text-[var(--color-label-2)]">{sel.label}{sel.key === last ? " · this month" : ""}</div>
          <div className="font-display num text-[30px] sm:text-[36px] leading-none mt-1">{sel.total ? formatINR(sel.total) : "—"}</div>
        </div>
        <div className="flex items-center gap-2 pb-1 text-[12.5px]">
          <span className="text-[var(--color-label-2)]">{sel.count ? `${sel.count} invoice${sel.count === 1 ? "" : "s"}` : "no invoices"}</span>
          {change !== null && (
            <span className={`inline-flex items-center gap-0.5 h-6 px-2 rounded-full font-semibold num ${change >= 0 ? "bg-[var(--color-green-2)] text-[var(--color-green)]" : "bg-[color-mix(in_srgb,var(--color-orange)_15%,transparent)] text-[var(--color-orange)]"}`}>
              {change >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}{change >= 0 ? "+" : ""}{change}% vs {prev!.label}
            </span>
          )}
        </div>
      </div>
      {/* the bars: thin, rounded at the data end, anchored to one baseline, a recessive guide at half */}
      <div className="relative h-[132px] sm:h-[168px] border-b border-[var(--color-separator)]">
        <div aria-hidden className="absolute inset-x-0 top-1/2 border-t border-dashed border-[color-mix(in_srgb,var(--color-separator)_70%,transparent)]" />
        <div className="relative h-full grid gap-1.5 sm:gap-3" style={{ gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))` }}>
          {months.map((m, i) => {
            const on = m.key === sel.key;
            const h = m.total > 0 ? Math.max(4, (m.total / peak) * 100) : 0;
            return (
              <button key={m.key} type="button" aria-pressed={on} onClick={() => setSelKey(m.key)} onMouseEnter={() => setSelKey(m.key)} onFocus={() => setSelKey(m.key)}
                aria-label={`${m.label}: ${m.total ? formatINR(m.total) : "nothing invoiced"}, ${m.count} invoice${m.count === 1 ? "" : "s"}`}
                className="group relative h-full min-w-0 !min-h-0 !p-0 !border-0 !bg-transparent !shadow-none flex items-end justify-center rounded-t-lg focus-visible:outline-2 focus-visible:outline-[var(--color-tint)]">
                <span aria-hidden className={`absolute inset-x-0 bottom-0 top-0 rounded-t-lg transition-colors ${on ? "bg-[color-mix(in_srgb,var(--color-tint)_7%,transparent)]" : "group-hover:bg-[var(--color-fill)]"}`} />
                {m.total > 0
                  ? <motion.span aria-hidden initial={{ height: 0 }} animate={{ height: `${h}%` }} transition={{ delay: 0.04 * i, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                      className={`relative w-full max-w-[44px] rounded-t-[4px] transition-colors ${on ? "bg-[var(--color-tint)]" : "bg-[color-mix(in_srgb,var(--color-tint)_32%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--color-tint)_50%,transparent)]"}`} />
                  : <span aria-hidden className="relative w-full max-w-[44px] h-[3px] rounded-full bg-[var(--color-fill-2)]" />}
              </button>
            );
          })}
        </div>
      </div>
      {/* the axis: month names, the chosen one in full ink */}
      <div className="grid gap-1.5 sm:gap-3 mt-2" style={{ gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))` }} aria-hidden>
        {months.map((m) => (
          <span key={m.key} className={`text-center text-[11.5px] sm:text-[12.5px] truncate ${m.key === sel.key ? "font-semibold text-[var(--color-label)]" : "text-[var(--color-label-2)]"}`}>{m.label}</span>
        ))}
      </div>
      <table className="sr-only">
        <caption>Invoiced by month</caption>
        <thead><tr><th>Month</th><th>Invoiced</th><th>Invoices</th></tr></thead>
        <tbody>{months.map((m) => <tr key={m.key}><td>{m.label}</td><td>{formatINR(m.total)}</td><td>{m.count}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

/**
 * One invoice, read the way a guest would read it: what it comes to and whether it is settled, who it
 * is for, what it is made of as a receipt, then the sums. Shared by the pane beside the list (wide
 * screens) and the dialog (everything narrower). Its two actions are real buttons: "Open invoice"
 * used `btn-primary`, which this app does not have, and rendered as plain text.
 */
function Detail({ inv, property }: { inv: Invoice; property: string }) {
  const lines = inv.lines ?? [];
  const balance = due(inv);
  const gst = Number(inv.cgst) + Number(inv.sgst);
  const guest = inv.guest_name ?? "Walk-in guest";
  const settled = balance <= 0.01;
  const when = new Date(inv.issued_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
  return (
    <div className="space-y-4" data-invoice={no(inv)}>
      {/* the headline: the total, and whether anything is still owed */}
      <div className="rounded-[20px] p-4" style={{ background: `color-mix(in srgb, var(${settled ? "--color-green" : "--color-red"}) 10%, transparent)` }} data-head>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="num text-[12px] font-semibold text-steel">{no(inv)}</span>
          <Pill tone={inv.kind === "stay" ? "gold" : "preparing"}>{inv.kind}</Pill>
          <span className="ml-auto inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-[11px] font-semibold"
            style={{ background: `color-mix(in srgb, var(${settled ? "--color-green" : "--color-red"}) 18%, transparent)`, color: `var(${settled ? "--color-green" : "--color-red"})` }}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" />{settled ? "Paid in full" : `${formatINR(balance)} due`}</span>
        </div>
        <div className="num text-[34px] font-bold leading-none tracking-tight mt-3">{formatINR(Number(inv.total))}</div>
        <div className="text-[12px] text-steel mt-1.5">Issued {when} · {property}</div>
      </div>

      {/* who it is for */}
      <div className="flex items-center gap-3 min-w-0" data-guest>
        <span className="h-10 w-10 rounded-full bg-[var(--color-fill)] grid place-items-center font-display text-base shrink-0">{guest.slice(0, 1).toUpperCase()}</span>
        <div className="min-w-0">
          <div className="text-[11px] text-steel">Billed to</div>
          <div className="text-[15px] font-semibold truncate">{guest}</div>
        </div>
        {inv.guest_phone && <a href={`tel:${inv.guest_phone}`} className="ml-auto num text-[12px] text-steel hover:text-[var(--color-label)] shrink-0 min-h-11 inline-flex items-center">{inv.guest_phone}</a>}
      </div>

      {/* what it is made of, as a receipt */}
      <div>
        <div className="eyebrow mb-1.5">Items</div>
        {lines.length === 0 ? <p className="text-sm text-steel">No lines</p> : (
          <ul className="divide-y divide-[var(--color-separator)] max-h-[32vh] overflow-y-auto" data-lines>
            {lines.map((l, i) => (
              <li key={i} className="py-2.5 flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-medium leading-snug">{l.description}</div>
                  <div className="text-[11px] text-steel num mt-0.5">{Number(l.qty)} × {formatINR(Number(l.rate))} · GST {Number(l.gst_rate)}%</div>
                </div>
                <div className="num text-[14px] font-semibold shrink-0">{formatINR(Number(l.amount))}</div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* the sums, in the order an invoice adds them up */}
      <div className="rounded-[16px] bg-[var(--color-fill)] p-3.5 space-y-1.5 text-[13px]" data-sums>
        <Row k="Subtotal" v={Number(inv.subtotal)} />
        {Number(inv.discount) > 0 && <Row k="Discount" v={-Number(inv.discount)} />}
        {gst > 0 && <Row k={`GST (CGST ${formatINR(Number(inv.cgst))} + SGST ${formatINR(Number(inv.sgst))})`} v={gst} />}
        <div className="pt-1.5 mt-1.5 border-t border-[var(--color-separator)]"><Row k="Total" v={Number(inv.total)} strong /></div>
        <Row k="Paid" v={Number(inv.paid)} />
        <Row k={settled ? "Balance" : "Balance due"} v={balance} tone={settled ? "good" : "bad"} />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <Link href={`/invoices/${inv.id}`} className="btn btn-filled justify-center"><ArrowUpRight size={16} /> Open invoice</Link>
        <Link href={`/invoices/${inv.id}?print=1`} className="btn btn-gray justify-center"><Printer size={16} /> Print</Link>
      </div>
    </div>
  );
}

const Row = ({ k, v, strong, tone }: { k: string; v: number; strong?: boolean; tone?: "good" | "bad" }) => (
  <div className="flex items-baseline justify-between gap-3">
    <span className={cn("min-w-0 truncate", strong ? "font-semibold text-[var(--color-label)]" : "text-steel")}>{k}</span>
    <span className={cn("num shrink-0", strong ? "text-[18px] font-bold" : "font-semibold", tone === "bad" && "text-[var(--color-red)]", tone === "good" && "text-[var(--color-green)]")}>{v < 0 ? `− ${formatINR(-v)}` : formatINR(v)}</span>
  </div>
);
