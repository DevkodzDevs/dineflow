"use client";
import { useState, useTransition } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Banknote, Check, Scissors, Wallet } from "lucide-react";
import { Button, Card, Field, Segmented, StatTile, cn, useToast } from "@/components/ui";
import { usePrinters } from "@/lib/print/usePrinter";
import { formatINR } from "@/lib/format";
import { cashMove } from "./actions";

export type Expected = { since: string; cash: number; upi: number; card: number; other: number; total: number; cash_in?: number; cash_out?: number; cash_drawer?: number; bills: number; unpaid: number; open_orders: number };
type Move = { id: string; kind: "in" | "out"; amount: number; reason: string; note: string | null; created_by: string | null; created_at: string };
type Shift = { id: string; business_date: string; opened_at: string; closed_at: string; expected: { cash?: number; cash_drawer?: number; total?: number; bills?: number }; counted_cash: number | null; float_cash: number; variance: number | null; note: string | null; closed_by: string | null };
type Void = { id: string; bill_no: number; total: number; void_reason: string | null; voided_at: string | null; voided_by: string | null; created_at: string };
type Line = { id: string; name_snapshot: string; qty: number; price_snapshot: number; cancel_reason: string | null; cancelled_by: string | null; cancelled_at: string | null; created_at: string; orders: { order_no: number; status: string } | null };

const REASONS = {
  in: ["Float top-up", "Owner put in", "Change from the bank", "Advance returned"],
  out: ["Supplier paid in cash", "Petty expense", "Owner drawing", "Bank deposit", "Staff advance", "Refund to guest"],
};
const inr = (n: number | null | undefined) => formatINR(Number(n ?? 0), { whole: true });
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
const day = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

export function ControlsClient({ expected, moves, shifts, voids, lines, names, me }: { expected: Expected | null; moves: Move[]; shifts: Shift[]; voids: Void[]; lines: Line[]; names: Record<string, string>; me: string }) {
  const toast = useToast(); const [pending, start] = useTransition();
  const { openDrawer, hasDrawer } = usePrinters();
  const [kind, setKind] = useState<"in" | "out">("out");
  const [amount, setAmount] = useState(""); const [reason, setReason] = useState(""); const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const who = (id: string | null) => (id ? names[id] ?? "Master control" : "—");
  const since = expected?.since ? hhmm(expected.since) : "";
  const last = shifts[0];
  const drawer = Number(expected?.cash_drawer ?? expected?.cash ?? 0);
  const inShift = moves.filter((m) => expected && m.created_at > expected.since);
  const submit = () => start(async () => {
    setErr(null);
    const n = Number(amount);
    if (!(n > 0)) return setErr("Enter an amount above zero");
    if (reason.trim().length < 2) return setErr("Say what the cash was for");
    const r = await cashMove(kind, n, reason.trim(), note.trim());
    if ("error" in r) return setErr(r.error!);
    toast(`${kind === "in" ? "Cash in" : "Cash out"} · ${inr(n)} · ${reason.trim()}`);
    if (hasDrawer) { try { await openDrawer(); } catch { /* the record stands even if the drawer sulks */ } }
    setAmount(""); setReason(""); setNote("");   // cashMove revalidates: its answer is the re-rendered screen
  });

  return (
    <div className="space-y-6" data-controls>
      <div className="grid grid-cols-2 min-[900px]:grid-cols-4 gap-3">
        <StatTile label="In the drawer now" value={inr(drawer)} sub={expected ? `cash sales ${inr(expected.cash)} + in − out since ${since} · add the float` : undefined} />
        <StatTile label="Cash in · this shift" value={inr(expected?.cash_in)} sub={`${inShift.filter((m) => m.kind === "in").length} entries`} delay={0.05} />
        <StatTile label="Cash out · this shift" value={inr(expected?.cash_out)} sub={`${inShift.filter((m) => m.kind === "out").length} entries`} delay={0.1} />
        <StatTile label="Last shift close" value={last?.variance == null ? "—" : Math.abs(Number(last.variance)) < 1 ? "Exact" : `${Number(last.variance) > 0 ? "+" : "−"}${inr(Math.abs(Number(last.variance)))}`} sub={last ? `${day(last.business_date)} · ${who(last.closed_by)}` : "no close yet"} tone={last?.variance != null && Math.abs(Number(last.variance)) >= 100 ? "alert" : last ? "good" : undefined} delay={0.15} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] items-start">
        {/* move cash */}
        <Card data-cash-form>
          <div className="flex items-start gap-3 mb-4">
            <span className="h-9 w-9 rounded-xl bg-[var(--color-fill)] grid place-items-center shrink-0 text-steel"><Wallet size={16} /></span>
            <div className="min-w-0 pt-1"><h3 className="text-base font-semibold">Move cash</h3><p className="text-xs text-steel mt-0.5">Cash into or out of the drawer</p></div>
          </div>
          <Segmented value={kind} onChange={(v) => { setKind(v); setReason(""); setErr(null); }} className="w-full" options={[{ value: "in", label: <span className="inline-flex items-center gap-1.5"><ArrowDownToLine size={14} /> Cash in</span> }, { value: "out", label: <span className="inline-flex items-center gap-1.5"><ArrowUpFromLine size={14} /> Cash out</span> }]} />
          <div className="mt-4 space-y-3">
            <Field label="Amount (₹)"><input type="number" inputMode="decimal" min={1} step="1" className="num !text-xl" value={amount} onChange={(e) => { setAmount(e.target.value); setErr(null); }} placeholder="0" data-amount /></Field>
            <div className="space-y-1.5"><label>What for</label>
              {/* an even grid of equal tiles, not chips wrapping into ragged rows of 2, 2 and 2 with
                  different widths; the picked one is ticked, and the box below is for anything else */}
              <div className="grid grid-cols-2 gap-2" data-reasons>{REASONS[kind].map((r) => { const on = reason === r; return (
                <button key={r} type="button" aria-pressed={on} onClick={() => { setReason(on ? "" : r); setErr(null); }}
                  className={cn("h-11 min-w-0 px-3 rounded-xl text-[13px] font-semibold flex items-center justify-between gap-1.5 text-left border transition-colors",
                    on ? "bg-[var(--color-label)] text-[var(--color-on-label)] border-transparent" : "bg-[var(--color-fill)] border-transparent hover:bg-[var(--color-fill-2)]")}>
                  <span className="line-clamp-2 leading-[1.15]" data-r>{r}</span>{on && <Check size={15} className="shrink-0" />}</button>); })}</div>
              <input value={REASONS[kind].includes(reason) ? "" : reason} onChange={(e) => { setReason(e.target.value); setErr(null); }} placeholder="Something else? Type it" maxLength={80} data-reason />
            </div>
            <Field label="Note (optional)"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Bill number, who took it…" maxLength={160} /></Field>
            {err && <p className="text-sm text-chili">{err}</p>}
            <Button className="w-full" size="lg" loading={pending} onClick={submit} data-record><Check size={18} /> Record {kind === "in" ? "cash in" : "cash out"}{hasDrawer ? " · open drawer" : ""}</Button>
            <p className="text-[11px] text-steel">Recorded as {me}. Goes to the audit trail.</p>
          </div>
        </Card>

        {/* movements this week */}
        <Card data-cash-list>
          <div className="flex items-center gap-2 mb-3"><h3 className="text-base font-semibold">Movements · 7 days</h3><span className="ml-auto text-xs text-steel num">{moves.length}</span></div>
          {moves.length === 0 ? <p className="text-sm text-steel">Nothing moved in or out yet.</p> : (
            <ul className="divide-y divide-[var(--color-separator)]">
              {moves.map((m) => (
                <li key={m.id} className="py-2.5 flex items-center gap-3 min-w-0 first:pt-0">
                  <span className={cn("h-9 w-9 shrink-0 rounded-xl grid place-items-center", m.kind === "in" ? "bg-[var(--color-green-2)] text-[var(--color-green)]" : "bg-[color-mix(in_srgb,var(--color-orange)_16%,transparent)] text-[var(--color-orange)]")}>{m.kind === "in" ? <ArrowDownToLine size={16} /> : <ArrowUpFromLine size={16} />}</span>
                  <div className="min-w-0 flex-1"><div className="text-sm font-semibold truncate">{m.reason}</div><div className="text-xs text-steel truncate">{who(m.created_by)}{m.note ? ` · ${m.note}` : ""}</div></div>
                  <div className="text-right shrink-0"><div className={cn("num text-sm font-semibold", m.kind === "out" && "text-chili")}>{m.kind === "in" ? "+" : "−"}{inr(m.amount)}</div><div className="text-[11px] text-steel num">{when(m.created_at)}</div></div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* shift closes */}
      <Card data-shifts>
        <div className="flex items-start gap-3 mb-3">
          <span className="h-9 w-9 rounded-xl bg-[var(--color-fill)] grid place-items-center shrink-0 text-steel"><Banknote size={16} /></span>
          <div className="min-w-0 pt-1"><h3 className="text-base font-semibold">Shift closes</h3><p className="text-xs text-steel mt-0.5">Last 30. Expected = cash sales + in − out. Float not counted.</p></div>
        </div>
        {shifts.length === 0 ? <p className="text-sm text-steel">No shifts closed yet. Close one in Billing.</p> : (
          <div className="feather overflow-x-auto table-wrap"><table className="w-full text-sm min-w-[640px]">
            <thead><tr><th className="text-left px-4 py-3">Day</th><th className="text-left px-3 py-3">Closed</th><th className="text-right px-3 py-3">Sales</th><th className="text-right px-3 py-3">Expected cash</th><th className="text-right px-3 py-3">Counted</th><th className="text-right px-3 py-3">Variance</th><th className="text-left px-4 py-3">By · note</th></tr></thead>
            <tbody>{shifts.map((s) => { const v = s.variance == null ? null : Number(s.variance); const exp = Number(s.expected?.cash_drawer ?? s.expected?.cash ?? 0); return (
              <tr key={s.id} className="border-t border-line" data-shift>
                <td className="px-4 py-2.5 font-semibold whitespace-nowrap">{day(s.business_date)}</td>
                <td className="px-3 py-2.5 num text-steel whitespace-nowrap">{hhmm(s.opened_at)} → {hhmm(s.closed_at)}</td>
                <td className="px-3 py-2.5 text-right num">{inr(s.expected?.total)}</td>
                <td className="px-3 py-2.5 text-right num">{inr(exp)}</td>
                <td className="px-3 py-2.5 text-right num">{s.counted_cash == null ? "—" : inr(Number(s.counted_cash) - Number(s.float_cash))}</td>
                <td className={cn("px-3 py-2.5 text-right num font-semibold", v != null && Math.abs(v) >= 100 && "text-chili", v != null && Math.abs(v) < 1 && "text-[var(--color-green)]")}>{v == null ? "—" : Math.abs(v) < 1 ? "exact" : `${v > 0 ? "+" : "−"}${inr(Math.abs(v))}`}</td>
                <td className="px-4 py-2.5 text-steel truncate max-w-[220px]">{who(s.closed_by)}{s.note ? ` · ${s.note}` : ""}</td>
              </tr>); })}</tbody></table></div>
        )}
      </Card>

      {/* voids and cancellations */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card data-voids>
          <div className="flex items-center gap-2 mb-3"><h3 className="text-base font-semibold">Voided bills · 7 days</h3><span className="ml-auto text-xs text-steel num">{voids.length}</span></div>
          {voids.length === 0 ? <p className="text-sm text-steel">No bill was voided this week.</p> : (
            <ul className="divide-y divide-[var(--color-separator)]">{voids.map((v) => (
              <li key={v.id} className="py-2.5 flex items-center gap-3 min-w-0 first:pt-0">
                <div className="min-w-0 flex-1"><div className="text-sm font-semibold">Bill {v.bill_no}</div><div className="text-xs text-steel truncate">{v.void_reason ?? "no reason recorded (before this update)"} · {who(v.voided_by)}</div></div>
                <div className="text-right shrink-0"><div className="num text-sm font-semibold">{inr(v.total)}</div><div className="text-[11px] text-steel num">{when(v.voided_at ?? v.created_at)}</div></div>
              </li>))}</ul>
          )}
        </Card>
        <Card data-cancels>
          <div className="flex items-center gap-2 mb-3"><Scissors size={15} className="text-steel" /><h3 className="text-base font-semibold">Cancelled dishes · 7 days</h3><span className="ml-auto text-xs text-steel num">{lines.length}</span></div>
          {lines.length === 0 ? <p className="text-sm text-steel">No dish was cancelled this week.</p> : (
            <ul className="divide-y divide-[var(--color-separator)]">{lines.map((l) => (
              <li key={l.id} className="py-2.5 flex items-center gap-3 min-w-0 first:pt-0">
                <div className="min-w-0 flex-1"><div className="text-sm font-semibold truncate">{l.qty}× {l.name_snapshot}</div><div className="text-xs text-steel truncate">order #{l.orders?.order_no ?? "—"}{l.orders?.status === "cancelled" ? " · whole order" : ""} · {l.cancel_reason ?? "no reason recorded"} · {who(l.cancelled_by)}</div></div>
                <div className="text-right shrink-0"><div className="num text-sm font-semibold">{inr(l.qty * Number(l.price_snapshot))}</div><div className="text-[11px] text-steel num">{when(l.cancelled_at ?? l.created_at)}</div></div>
              </li>))}</ul>
          )}
        </Card>
      </div>
    </div>
  );
}
