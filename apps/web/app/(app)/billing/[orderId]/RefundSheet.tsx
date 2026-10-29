"use client";
import { useEffect, useState, useTransition } from "react";
import { Button, Sheet, cn } from "@/components/ui";
import { formatINR } from "@dineflow/shared";
import { issueCreditNote } from "../actions";
import { reach } from "@/lib/reach";

/**
 * A refund on a paid bill (0146): how much goes back, how, and why — then a numbered credit note. Built like the void
 * dialog (ReasonDialog): quick reasons a floor actually has, the box still editable, the button off until there is a
 * reason. The amount starts at what is left to refund; the server checks it again and refuses more.
 */
const METHODS = [["cash", "Cash"], ["upi", "UPI"], ["card", "Card"], ["other", "Other"]] as const;
const REASONS = ["Dish sent back", "Wrong item served", "Charged too much", "Guest complaint", "Order cancelled"];

export function RefundSheet({ open, onClose, billId, billNo, left, method }: { open: boolean; onClose: () => void; billId: string; billNo: number; left: number; method: string }) {
  const [amount, setAmount] = useState(left);
  const [how, setHow] = useState("cash");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // each opening starts fresh: what is left, the way the guest paid, no reason yet
  useEffect(() => { if (open) { setAmount(left); setHow(METHODS.some(([k]) => k === method) ? method : "cash"); setReason(""); setErr(null); } }, [open, left, method]);
  const ok = reason.trim().length >= 3 && amount > 0 && amount <= left + 0.004;
  return (
    <Sheet open={open} onClose={onClose} title={`Refund on bill ${billNo}`}>
      <div className="space-y-4" data-refund-sheet>
        <p className="text-sm text-[var(--color-label-2)]">A numbered credit note; the bill stays as it was. {formatINR(left)} can still go back.</p>
        <div>
          <label htmlFor="refund-amount">Amount</label>
          <div className="flex items-stretch gap-2 mt-1.5">
            <input id="refund-amount" type="number" step="0.01" min={0} max={left} className="num flex-1 min-w-0" value={amount || ""} onChange={(e) => { setAmount(Number(e.target.value)); setErr(null); }} data-refund-amount />
            <button type="button" className={cn("chip shrink-0", Math.abs(amount - left) < 0.005 && "on")} onClick={() => setAmount(left)}>Whole {formatINR(left)}</button>
          </div>
        </div>
        <div>
          <div className="text-[13px] font-semibold mb-1.5">Given back by</div>
          <div className="grid grid-cols-4 gap-2" data-refund-method>
            {METHODS.map(([k, label]) => <button key={k} type="button" onClick={() => setHow(k)} className={cn("chip justify-center", how === k && "on")} aria-pressed={how === k}>{label}</button>)}
          </div>
          {how === "cash" && <p className="footnote mt-1.5">Counted as cash out of the drawer.</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {REASONS.map((c) => <button key={c} type="button" onClick={() => { setReason(c); setErr(null); }} className={cn("chip", reason === c && "on")}>{c}</button>)}
        </div>
        <textarea value={reason} onChange={(e) => { setReason(e.target.value); setErr(null); }} rows={2} maxLength={160} placeholder="Reason — a few words" aria-label="Reason" />
        {err && <p className="text-sm text-[var(--color-red)]">{err}</p>}
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>Keep it</Button>
          <Button type="button" variant="danger" disabled={!ok || pending} loading={pending} data-confirm
            onClick={() => start(async () => { const r = await reach(() => issueCreditNote(billId, Math.round(amount * 100) / 100, reason.trim(), how)); if ("error" in r) setErr(r.error ?? "Could not refund"); else onClose(); })}>
            Refund {formatINR(Math.max(0, amount || 0))}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
