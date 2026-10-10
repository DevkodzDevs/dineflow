"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Printer, ArrowUpRight, ChevronRight, Receipt, TrendingUp, TrendingDown } from "lucide-react";
import { Pill, Sheet, cn } from "@/components/ui";
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

  return (
    <>
      <MonthStrip months={months} />

      <div className="grid gap-4 items-start xl:grid-cols-[minmax(0,1fr)_minmax(360px,400px)]">
        <div className="feather overflow-x-auto table-wrap">
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

        {/* beside the list on a wide screen, so you can read one invoice after another without leaving */}
        <aside className="hidden xl:block sticky top-4">
          {current
            ? <div className="feather p-5"><Detail inv={current} property={property} /></div>
            : <div className="feather p-8 text-center">
                <span className="h-11 w-11 rounded-2xl bg-fill grid place-items-center mx-auto text-steel"><Receipt size={18} /></span>
                <div className="mt-3 font-semibold">Pick an invoice</div>
                <p className="text-sm text-steel mt-1">Tap any row to read it here — what it is made of, what is paid, what is still owed.</p>
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

function Detail({ inv, property }: { inv: Invoice; property: string }) {
  const lines = inv.lines ?? [];
  const balance = due(inv);
  const gst = Number(inv.cgst) + Number(inv.sgst);
  const guest = inv.guest_name ?? "Walk-in guest";
  return (
    <div className="space-y-4">
      {/* three columns, the way an invoice is actually read: which one, who issued it, who owes it */}
      <div className="grid grid-cols-3 gap-3">
        <div className="min-w-0">
          <div className="text-[11px] text-steel mb-1.5">Invoice</div>
          <div className="num text-lg font-bold leading-none truncate">{no(inv)}</div>
          <div className="mt-2"><Pill tone={inv.status === "paid" ? "ready" : "alert"}>{inv.status}</Pill></div>
        </div>
        <div className="min-w-0">
          <div className="text-[11px] text-steel mb-1.5">From</div>
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="h-6 w-6 rounded-lg bg-ink text-on-label grid place-items-center font-display text-xs shrink-0">{property.slice(0, 1)}</span>
            <span className="text-sm font-semibold truncate">{property}</span>
          </div>
          <div className="mt-2"><Pill tone={inv.kind === "stay" ? "gold" : "preparing"}>{inv.kind}</Pill></div>
        </div>
        <div className="min-w-0">
          <div className="text-[11px] text-steel mb-1.5">Billed to</div>
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="h-6 w-6 rounded-full bg-[var(--color-fill)] grid place-items-center font-display text-xs shrink-0">{guest.slice(0, 1)}</span>
            <span className="text-sm font-semibold truncate">{guest}</span>
          </div>
          <div className="mt-2 text-[11px] text-steel num truncate">{inv.guest_phone ?? `issued ${day(inv.issued_at)}`}</div>
        </div>
      </div>

      {/* each line its own small card, so the shape of the bill is visible before the numbers are read */}
      <div>
        <div className="eyebrow mb-2">What it is made of</div>
        {lines.length === 0 ? <p className="text-sm text-steel">No lines recorded on this invoice.</p> : (
          <div className="grid grid-cols-2 gap-2 max-h-[34vh] overflow-y-auto pr-0.5">
            {lines.map((l, i) => (
              <div key={i} className="rounded-2xl bg-[var(--color-fill)] p-3">
                <div className="flex items-start gap-1.5">
                  <span className="text-[11px] text-steel leading-snug line-clamp-2 flex-1">{l.description}</span>
                  <ArrowUpRight size={12} className="text-steel shrink-0 mt-0.5" />
                </div>
                <div className="num text-base font-bold mt-1.5">{formatINR(Number(l.amount))}</div>
                <div className="text-[10px] text-steel num">{Number(l.qty)} × {Number(l.rate).toFixed(2)} · GST {Number(l.gst_rate)}%</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* subtotal, total, what is left — side by side, not stacked in a receipt column */}
      <div className="rounded-2xl border border-line p-3">
        <div className="grid grid-cols-3 gap-2">
          <Big k="Subtotal" v={Number(inv.subtotal)} />
          <Big k="Total" v={Number(inv.total)} strong />
          <Big k={balance > 0.01 ? "Balance due" : "Settled"} v={balance} tone={balance > 0.01 ? "bad" : "good"} />
        </div>
        {(Number(inv.discount) > 0 || gst > 0) && (
          <div className="mt-2.5 pt-2.5 border-t border-line flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-steel num">
            {Number(inv.discount) > 0 && <span>Discount {formatINR(Number(inv.discount))}</span>}
            {gst > 0 && <span>GST {formatINR(gst)}</span>}
            <span>Paid {formatINR(Number(inv.paid))}</span>
          </div>
        )}
        <div className="mt-3 flex gap-2">
          <Link href={`/invoices/${inv.id}`} className="btn btn-primary flex-1 justify-center !h-10 !text-sm"><ArrowUpRight size={15} /> Open invoice</Link>
          <Link href={`/invoices/${inv.id}?print=1`} className="btn btn-outline !h-10 !w-10 !px-0" aria-label="Print"><Printer size={15} /></Link>
        </div>
      </div>
    </div>
  );
}

const Big = ({ k, v, strong, tone }: { k: string; v: number; strong?: boolean; tone?: "good" | "bad" }) => (
  <div className="min-w-0">
    <div className="text-[10px] uppercase tracking-wide text-steel truncate">{k}</div>
    <div className={cn("num mt-0.5 leading-tight", strong ? "text-lg font-bold" : "text-sm font-semibold",
      tone === "bad" && "text-chili", tone === "good" && "text-mint")}>{formatINR(v)}</div>
  </div>
);
