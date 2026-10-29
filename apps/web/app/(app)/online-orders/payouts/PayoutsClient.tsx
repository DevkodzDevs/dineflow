"use client";
import { useEffect, useState, useTransition } from "react";
import { Check, AlertTriangle, Trash2, Loader2, Landmark } from "lucide-react";
import { Card, Empty, cn, useToast } from "@/components/ui";
import { formatINR } from "@/lib/format";
import { expectedFor, addSettlement, deleteSettlement, type Expected } from "./actions";

export type Settlement = { id: string; channel_id: string; period_from: string; period_to: string; orders_count: number; gross: number; commission: number; expected: number; received: number; tds: number; other_deductions: number; utr: string | null; received_on: string | null; note: string | null; created_at: string };

/** The gap: what landed plus what was deducted on paper (TDS, other), against the orders' own payout. */
export const gapOf = (r: { received: number; tds: number; other_deductions: number; expected: number }) =>
  Math.round((Number(r.received) + Number(r.tds) + Number(r.other_deductions) - Number(r.expected)) * 100) / 100;
const inr = (n: number) => formatINR(Number(n));
const d = (s: string) => new Date(s + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
/** Swiggy and Zomato pay weekly, Monday to Sunday: last week is the usual period. */
const lastWeek = (today: string) => { const t = new Date(today + "T00:00:00Z"); const dow = (t.getUTCDay() + 6) % 7; const mon = new Date(t.getTime() - (dow + 7) * 86400000); const sun = new Date(mon.getTime() + 6 * 86400000); return [mon.toISOString().slice(0, 10), sun.toISOString().slice(0, 10)]; };

/**
 * Pick the channel and the week; the screen works out what the orders said the payout would be. Type what reached
 * the bank (and any TDS or other deduction on the statement) and it shows the gap before you save it. Every payout
 * written down stays below with its gap — green when it matches to the rupee, red when it fell short.
 */
export function PayoutsClient({ channels, rows, today }: { channels: { id: string; kind: string; label: string }[]; rows: Settlement[]; today: string }) {
  const toast = useToast(); const [pending, start] = useTransition();
  const [wf, wt] = lastWeek(today);
  const [f, setF] = useState({ channel: channels[0]?.id ?? "", from: wf, to: wt, received: "", tds: "", other: "", utr: "", received_on: today, note: "" });
  const [exp, setExp] = useState<Expected | null>(null); const [loading, setLoading] = useState(false); const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  useEffect(() => {
    if (!f.channel || !f.from || !f.to) return; let on = true; setLoading(true);
    void expectedFor(f.channel, f.from, f.to).then((r) => { if (!on) return; setLoading(false); if ("e" in r && r.e) setExp(r.e); else { setExp(null); setErr("error" in r ? r.error! : null); } });
    return () => { on = false; };
  }, [f.channel, f.from, f.to]);
  const gap = exp && f.received !== "" ? gapOf({ received: Number(f.received), tds: Number(f.tds || 0), other_deductions: Number(f.other || 0), expected: Number(exp.payout) }) : null;
  const name = (id: string) => channels.find((c) => c.id === id)?.label ?? "Channel";
  const short = rows.filter((r) => gapOf(r) < -1);

  if (!channels.length) return <Empty title="No channels yet" hint="Add one in Channels" />;
  return (
    <div className="space-y-5 max-w-[1200px]">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <Card data-payout-form>
          <div className="text-[17px] font-extrabold mb-3">Write down a payout</div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Channel">
            {channels.map((c) => <button key={c.id} type="button" aria-pressed={f.channel === c.id} onClick={() => set("channel", c.id)} className={cn("!min-h-11 rounded-full px-4 text-[14px] font-bold", f.channel === c.id ? "bg-[var(--color-label)] text-[var(--color-on-label)]" : "bg-[var(--color-fill)]")}>{c.label}</button>)}
          </div>
          <div className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
            <label className="min-w-0"><span className="text-[13px] font-semibold text-steel">Orders from</span><input type="date" className="mt-1" value={f.from} max={today} onChange={(e) => set("from", e.target.value)} /></label>
            <label className="min-w-0"><span className="text-[13px] font-semibold text-steel">to</span><input type="date" className="mt-1" value={f.to} max={today} onChange={(e) => set("to", e.target.value)} /></label>
          </div>
          <div className="mt-3 rounded-2xl bg-[var(--color-fill)] p-3.5 grid grid-cols-2 sm:grid-cols-4 gap-2" data-expected>
            {loading ? <div className="col-span-full flex items-center gap-2 text-steel text-[14px]"><Loader2 size={16} className="animate-spin" /> Adding up the orders…</div> : exp ? (
              [["Orders", String(exp.orders)], ["Order value", inr(exp.gross)], ["Commission", inr(exp.commission)], ["Should pay", inr(exp.payout)]].map(([k, v]) => <div key={k} className="min-w-0"><div className="text-[12px] font-bold text-steel">{k}</div><div className={cn("num font-extrabold text-[17px] truncate", k === "Should pay" && "text-[19px]")}>{v}</div></div>)
            ) : <div className="col-span-full text-[14px] text-steel">{err ?? "Pick channel and dates"}</div>}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <label className="min-w-0"><span className="text-[13px] font-semibold text-steel">Reached the bank</span><input className="mt-1 num !text-[18px] font-bold" inputMode="decimal" value={f.received} onChange={(e) => set("received", e.target.value.replace(/[^\d.]/g, ""))} data-received /></label>
            <label className="min-w-0"><span className="text-[13px] font-semibold text-steel">TDS / TCS</span><input className="mt-1 num" inputMode="decimal" value={f.tds} onChange={(e) => set("tds", e.target.value.replace(/[^\d.]/g, ""))} /></label>
            <label className="min-w-0"><span className="text-[13px] font-semibold text-steel">Other cuts</span><input className="mt-1 num" inputMode="decimal" value={f.other} onChange={(e) => set("other", e.target.value.replace(/[^\d.]/g, ""))} placeholder="ads, refunds" /></label>
          </div>
          <div className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
            <label className="min-w-0"><span className="text-[13px] font-semibold text-steel">UTR</span><input className="mt-1" value={f.utr} onChange={(e) => set("utr", e.target.value)} maxLength={40} /></label>
            <label className="min-w-0"><span className="text-[13px] font-semibold text-steel">Received on</span><input type="date" className="mt-1" value={f.received_on} max={today} onChange={(e) => set("received_on", e.target.value)} /></label>
          </div>
          {gap !== null && <div className={cn("mt-3 rounded-2xl px-4 py-3 flex items-center gap-2 text-[15px] font-bold", Math.abs(gap) < 1 ? "bg-[var(--color-green-2)] text-[var(--color-green)]" : gap < 0 ? "bg-[var(--color-red-2)] text-[var(--color-red)]" : "bg-[var(--color-orange-2)] text-[var(--color-orange)]")} data-gap>
            {Math.abs(gap) < 1 ? <><Check size={18} aria-hidden /> Matches the orders</> : gap < 0 ? <><AlertTriangle size={18} aria-hidden /> Short by {inr(-gap)} — ask {name(f.channel)}</> : <><AlertTriangle size={18} aria-hidden /> {inr(gap)} more than expected</>}
          </div>}
          {err && exp && <p className="mt-2 text-[14px] font-semibold text-chili">{err}</p>}
          <button type="button" disabled={pending || !exp || f.received === ""} className="svc-btn go w-full mt-4" data-save-payout
            onClick={() => start(async () => { setErr(null); const r = await addSettlement({ ...f, received: Number(f.received), tds: Number(f.tds || 0), other: Number(f.other || 0) }); if ("error" in r) setErr(r.error!); else { toast("Payout saved"); setF((x) => ({ ...x, received: "", tds: "", other: "", utr: "", note: "" })); } })}>
            <Landmark size={18} aria-hidden /> Save payout</button>
        </Card>

        <div className="space-y-3 min-w-0">
          <div className="grid grid-cols-2 gap-2">
            <div className="feather !rounded-[18px] px-4 py-3"><div className="text-[12px] font-bold text-steel">Payouts written down</div><div className="font-display num text-[24px]">{rows.length}</div></div>
            <div className={cn("feather !rounded-[18px] px-4 py-3", short.length && "!border-[var(--color-red)]")}><div className="text-[12px] font-bold text-steel">Short</div><div className={cn("font-display num text-[24px]", short.length ? "text-chili" : "")} data-short-total>{short.length ? inr(-short.reduce((a, r) => a + gapOf(r), 0)) : "None"}</div></div>
          </div>
          <Card className="!p-0 overflow-hidden" data-payout-list>
            {rows.length === 0 ? <p className="p-4 text-sm text-steel">No payouts yet</p> : rows.map((r) => { const g = gapOf(r); return (
              <div key={r.id} className="px-4 py-3 border-b border-[var(--color-separator)] last:border-b-0 flex items-center gap-3 min-w-0" data-payout={r.id}>
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-bold truncate">{name(r.channel_id)} · {d(r.period_from)}–{d(r.period_to)}</div>
                  <div className="text-[12.5px] text-steel truncate">{r.orders_count} orders · should pay {inr(r.expected)} · got {inr(r.received)}{Number(r.tds) ? ` + TDS ${inr(r.tds)}` : ""}{Number(r.other_deductions) ? ` + cuts ${inr(r.other_deductions)}` : ""}{r.utr ? ` · ${r.utr}` : ""}</div>
                </div>
                <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[12.5px] font-extrabold num", Math.abs(g) < 1 ? "bg-[var(--color-green-2)] text-[var(--color-green)]" : g < 0 ? "bg-[var(--color-red-2)] text-[var(--color-red)]" : "bg-[var(--color-orange-2)] text-[var(--color-orange)]")}>{Math.abs(g) < 1 ? "Matches" : `${g < 0 ? "−" : "+"}${inr(Math.abs(g))}`}</span>
                <button type="button" disabled={pending} onClick={() => { if (confirm("Remove this payout?")) start(async () => { const x = await deleteSettlement(r.id); if ("error" in x) toast(x.error!, "err"); }); }} className="h-11 w-11 shrink-0 grid place-items-center rounded-xl text-steel hover:text-chili hover:bg-[var(--color-fill)]" aria-label="Remove"><Trash2 size={16} /></button>
              </div>); })}
          </Card>
        </div>
      </div>
    </div>
  );
}
