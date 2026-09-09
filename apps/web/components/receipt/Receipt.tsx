"use client";
import { forwardRef } from "react";
import { formatINR } from "@/lib/format";

export type ReceiptLine = { name: string; qty: number; price: number; note?: string | null; gstRate?: number };
export type ReceiptData = {
  restaurant: { name: string; address?: string | null; phone?: string | null; gstin?: string | null; fssai?: string | null };
  title?: string; no: string; when: string; where: string; cashier?: string; guest?: string | null;
  lines: ReceiptLine[];
  subtotal: number; discount?: number; service?: number; cgst: number; sgst: number; roundOff?: number; total: number;
  payments?: { method: string; amount: number; ref?: string | null }[];
  balance?: number; footer?: string; offline?: boolean; width?: 58 | 80;
  qr?: string | null;            // link to the digital copy / UPI string
  copyLabel?: string;            // "Customer copy" / "Merchant copy"
};

export const PAPER_PX = { 58: 264, 80: 328 } as const;
const m = (n: number) => Number(n).toFixed(2);
const words = (n: number) => {                       // amount in words, the way Indian bills print it
  const a = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
  const b = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
  const two = (x: number): string => (x < 20 ? a[x] : `${b[Math.floor(x / 10)]}${x % 10 ? " " + a[x % 10] : ""}`);
  const three = (x: number): string => (x >= 100 ? `${a[Math.floor(x / 100)]} hundred${x % 100 ? " " + two(x % 100) : ""}` : two(x));
  let x = Math.round(n); if (!x) return "zero";
  const cr = Math.floor(x / 1e7); x %= 1e7; const lk = Math.floor(x / 1e5); x %= 1e5; const th = Math.floor(x / 1e3); x %= 1e3;
  return [cr && `${three(cr)} crore`, lk && `${three(lk)} lakh`, th && `${three(th)} thousand`, x && three(x)].filter(Boolean).join(" ");
};

/**
 * A receipt that reads as real thermal paper.
 * The sheet is a wrapper holding the printed area plus a torn strip at each end,
 * so both edges are part of the measured height and never get clipped by the printer.
 */
export const Receipt = forwardRef<HTMLDivElement, { data: ReceiptData; className?: string; noTopEdge?: boolean }>(function Receipt({ data: d, className = "", noTopEdge }, ref) {
  const w = d.width ?? 80;
  const small = w === 58;
  const qtyTotal = d.lines.reduce((t, l) => t + l.qty, 0);
  // GST summary grouped by rate, the way a compliant Indian tax invoice prints it
  const taxable = d.subtotal - (d.discount ?? 0);
  const groups = Object.values(d.lines.reduce((acc, l) => {
    const r = l.gstRate ?? Math.round(((d.cgst + d.sgst) / Math.max(taxable, 1)) * 1000) / 10;
    (acc[r] ??= { rate: r, taxable: 0 }); acc[r].taxable += l.qty * l.price; return acc;
  }, {} as Record<string, { rate: number; taxable: number }>));

  return (
    <div ref={ref} className={`relative ${className}`} style={{ width: PAPER_PX[w] }}>
      {!noTopEdge && <div className="tear-strip tear-top" aria-hidden />}
      <div className="paper thermal" style={{ padding: small ? "14px 12px 12px" : "16px 16px 14px", fontSize: small ? "10.5px" : "12.5px", lineHeight: 1.5 }}>
        {/* ── head ── */}
        <div className="text-center">
          <div className="font-display font-bold leading-tight tracking-tight" style={{ fontSize: small ? 16 : 19 }}>{d.restaurant.name}</div>
          {d.restaurant.address && <div className="text-[10.5px] leading-snug opacity-80">{d.restaurant.address}</div>}
          {d.restaurant.phone && <div className="text-[10.5px] opacity-80">{d.restaurant.phone}</div>}
          {d.restaurant.gstin && <div className="text-[10.5px] mt-0.5">GSTIN {d.restaurant.gstin}</div>}
          {d.title && <div className="mt-2 text-[11px] font-bold tracking-[0.28em] uppercase">{d.title}</div>}
        </div>
        <hr className="paper-rule" />
        <div className="paper-row text-[11px]"><span>{d.no}</span><span>{d.where}</span></div>
        <div className="paper-row text-[11px] opacity-80"><span>{d.when}</span><span>{d.cashier ? `by ${d.cashier}` : ""}</span></div>
        {d.guest && <div className="text-[11px] opacity-80">Guest: {d.guest}</div>}
        {d.offline && <div className="text-center text-[11px] font-bold mt-1.5 tracking-[0.2em]">** OFFLINE COPY **</div>}

        {/* ── items ── */}
        <hr className="paper-rule" />
        <div className="paper-row text-[10.5px] uppercase tracking-wider opacity-70"><span>Item</span><span>Qty × Rate</span><span>Amount</span></div>
        <div className="mt-1 space-y-0.5">
          {d.lines.map((l, i) => (
            <div key={i}>
              <div className="paper-row"><span className="truncate" style={{ maxWidth: "46%" }}>{l.name}</span><span className="opacity-80">{l.qty} × {m(l.price)}</span><span>{m(l.qty * l.price)}</span></div>
              {l.note && <div className="pl-2 text-[10.5px] opacity-70">{l.note}</div>}
            </div>
          ))}
        </div>

        {/* ── totals ── */}
        <hr className="paper-rule" />
        <div className="paper-row"><span className="opacity-80">Subtotal ({qtyTotal} item{qtyTotal === 1 ? "" : "s"})</span><span>{m(d.subtotal)}</span></div>
        {!!d.discount && d.discount > 0 && <div className="paper-row"><span className="opacity-80">Discount</span><span>-{m(d.discount)}</span></div>}
        {!!d.service && <div className="paper-row"><span className="opacity-80">Service charge</span><span>{m(d.service)}</span></div>}
        <div className="paper-row"><span className="opacity-80">CGST</span><span>{m(d.cgst)}</span></div>
        <div className="paper-row"><span className="opacity-80">SGST</span><span>{m(d.sgst)}</span></div>
        {!!d.roundOff && <div className="paper-row"><span className="opacity-80">Round off</span><span>{m(d.roundOff)}</span></div>}
        <div className="paper-hr-solid" />
        <div className="paper-row paper-total" style={{ fontSize: small ? 15 : 17 }}><span>TOTAL</span><span>{formatINR(d.total)}</span></div>
        <div className="text-[10px] italic opacity-75 leading-snug mt-0.5">Rupees {words(d.total)} only</div>

        {/* ── payment ── */}
        {!!d.payments?.length && (<>
          <hr className="paper-rule" />
          {d.payments.map((p, i) => <div key={i} className="paper-row text-[11px]"><span className="opacity-85">{p.method.toUpperCase()}{p.ref ? ` · ${p.ref}` : ""}</span><span>{m(p.amount)}</span></div>)}
        </>)}
        {d.balance !== undefined && d.balance > 0.01 && <div className="paper-row font-bold mt-1"><span>BALANCE DUE</span><span>{m(d.balance)}</span></div>}
        {!!d.discount && d.discount > 0 && <div className="text-center text-[10.5px] font-bold mt-1.5">You saved {formatINR(d.discount)}</div>}

        {/* ── GST summary, as a compliant tax invoice must show ── */}
        <hr className="paper-rule" />
        <div className="text-[10px] uppercase tracking-wider opacity-70">Tax summary</div>
        <div className="paper-row text-[10px] opacity-70 mt-0.5"><span>Rate</span><span>Taxable</span><span>CGST</span><span>SGST</span></div>
        {groups.map((g) => (
          <div key={g.rate} className="paper-row text-[10.5px]">
            <span>{g.rate}%</span><span>{m(g.taxable)}</span><span>{m((g.taxable * g.rate) / 200)}</span><span>{m((g.taxable * g.rate) / 200)}</span>
          </div>
        ))}

        {/* ── foot ── */}
        <hr className="paper-rule" />
        <div className="text-center leading-snug">
          <div className="text-[11px] font-bold tracking-[0.12em]">{d.footer ?? "THANK YOU · VISIT AGAIN"}</div>
          {d.restaurant.fssai && <div className="text-[9.5px] opacity-75 mt-0.5">FSSAI Lic. {d.restaurant.fssai}</div>}
          <div className="text-[9.5px] opacity-75">{d.copyLabel ?? "Customer copy"} · goods once sold are not returnable</div>
        </div>
        {d.qr && (
          <div className="flex items-center justify-center gap-3 mt-2.5">
            <div className="qr-stub" aria-hidden />
            <div className="text-[9.5px] leading-tight opacity-80 text-left">Scan for the<br />digital copy<br />& to pay</div>
          </div>
        )}
        <div className="mt-3"><div className="barcode" aria-hidden /><div className="text-center text-[9.5px] tracking-[0.3em] mt-1 opacity-80">{d.no.replace(/\D/g, "").padStart(10, "0").slice(-10)}</div></div>
        <div className="text-center text-[9px] tracking-[0.22em] uppercase opacity-55 mt-2">Powered by DineFlow</div>
      </div>
      <div className="tear-strip tear-bottom" aria-hidden />
    </div>
  );
});
