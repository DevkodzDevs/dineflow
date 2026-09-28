"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Printer, ArrowUpRight, ChevronRight, Receipt } from "lucide-react";
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

function MonthStrip({ months }: { months: Month[] }) {
  const peak = Math.max(1, ...months.map((m) => m.total));
  const last = months[months.length - 1]?.key;
  return (
    <div className="feather p-4 sm:p-5 mb-4">
      <div className="flex items-baseline justify-between mb-3">
        <span className="eyebrow">Invoiced by month</span>
        <span className="text-xs text-steel">last {months.length} months</span>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 sm:gap-4">
        {months.map((m, i) => {
          const live = m.key === last;
          return (
            <div key={m.key}>
              <div className={`text-xs mb-1.5 ${live ? "text-ink font-semibold" : "text-steel"}`}>{m.label}</div>
              <div className="h-1.5 rounded-full bg-fill overflow-hidden">
                <motion.div initial={{ width: 0 }} animate={{ width: `${Math.max(m.total > 0 ? 6 : 0, (m.total / peak) * 100)}%` }}
                  transition={{ delay: 0.05 * i, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  className={`h-full rounded-full ${live ? "bg-tint" : "bg-line-2"}`} />
              </div>
              <div className="num text-sm font-semibold mt-1.5 tabular-nums">{m.total ? formatINR(m.total) : "—"}</div>
              <div className="text-[11px] text-steel">{m.count ? `${m.count} invoice${m.count === 1 ? "" : "s"}` : "none"}</div>
            </div>
          );
        })}
      </div>
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
