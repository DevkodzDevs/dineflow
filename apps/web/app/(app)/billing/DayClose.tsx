"use client";
import { useEffect, useState, useTransition } from "react";
import { Lock, Copy, Check } from "lucide-react";
import { Button, Sheet, Field, Flip, useToast } from "@/components/ui";
import { shiftExpected, shiftClose, type ShiftExpected } from "./actions";
import { formatINR } from "@/lib/format";

/**
 * Shift close in sixty seconds: what the tills should hold from the day's bills, what was counted,
 * the difference, and one paragraph the owner can read on WhatsApp.
 */
export function DayClose({ today, lastClosed }: { today: string; lastClosed: string | null }) {
  const [open, setOpen] = useState(false); const [e, setE] = useState<ShiftExpected | null>(null); const [counted, setCounted] = useState(""); const [float, setFloat] = useState("2000"); const [note, setNote] = useState("");
  const [done, setDone] = useState<{ summary: string; variance: number } | null>(null); const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition(); const toast = useToast();
  useEffect(() => { if (!open) return; setDone(null); shiftExpected().then((r) => { if ("expected" in r && r.expected) setE(r.expected); else toast(r.error ?? "Could not read the till", "err"); }); }, [open, toast]);
  const variance = e && counted !== "" ? Number(counted) - Number(float || 0) - Number(e.cash) : null;
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}><Lock size={16} /> Close shift</Button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Close the shift" wide>
        {!e ? <div className="shimmer h-24" /> : done ? (
          <div className="space-y-5">
            <div className="flip-row justify-center"><Flip value={Math.abs(Math.round(done.variance))} label={done.variance < -0.5 ? "short" : done.variance > 0.5 ? "over" : "exact"} tone={Math.abs(done.variance) < 1 ? "live" : done.variance < 0 ? "alert" : undefined} /></div>
            <p className="text-[15px] leading-relaxed rounded-2xl bg-[var(--color-fill)] p-4">{done.summary}</p>
            <div className="flex gap-2"><Button className="flex-1" onClick={() => { navigator.clipboard.writeText(done.summary); setCopied(true); }}>{copied ? <Check size={16} /> : <Copy size={16} />} {copied ? "Copied" : "Copy for WhatsApp"}</Button><Button variant="gray" onClick={() => setOpen(false)}>Done</Button></div>
          </div>
        ) : (
          <form className="space-y-5" onSubmit={(ev) => { ev.preventDefault(); start(async () => { const r = await shiftClose(Number(counted), Number(float || 0), note, today); if ("error" in r) toast(r.error ?? "Could not close", "err"); else setDone({ summary: r.summary, variance: r.variance }); }); }}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[["Cash", e.cash], ["UPI", e.upi], ["Card", e.card], ["Total", e.total]].map(([k, v]) => <div key={String(k)} className="feather p-4"><div className="text-xs text-steel">{k}</div><div className="num text-2xl mt-1">{formatINR(Number(v))}</div></div>)}
            </div>
            <p className="text-sm text-steel">{e.bills} bills since {new Date(e.since).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}{e.open_orders > 0 && <> · <b className="text-chili">{e.open_orders} orders still open</b></>}{e.unpaid > 0 && <> · <b className="text-chili">{e.unpaid} bills unpaid</b></>}{lastClosed && <> · last closed {lastClosed}</>}</p>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Cash counted in the till (₹)" hint="Everything in the drawer, including the float."><input type="number" inputMode="decimal" className="num !text-xl" value={counted} onChange={(x) => setCounted(x.target.value)} required autoFocus /></Field>
              <Field label="Float kept for tomorrow (₹)"><input type="number" inputMode="decimal" className="num !text-xl" value={float} onChange={(x) => setFloat(x.target.value)} /></Field>
            </div>
            {variance !== null && <div className={`rounded-2xl p-4 flex items-center gap-4 ${Math.abs(variance) < 1 ? "bg-[var(--color-green-2)]" : "bg-[var(--color-red-2)]"}`}><span className="num text-3xl">{Math.abs(variance) < 1 ? "Exact" : `${formatINR(Math.abs(variance))} ${variance < 0 ? "short" : "over"}`}</span><span className="text-sm text-steel">against {formatINR(Number(e.cash))} of cash sales</span></div>}
            <Field label="Anything to explain"><textarea rows={2} value={note} onChange={(x) => setNote(x.target.value)} placeholder="Gas cylinder paid from till ₹1,100…" /></Field>
            <Button className="w-full !h-[52px] !text-base" disabled={pending || counted === ""}><Lock size={16} /> Close shift and write the summary</Button>
          </form>
        )}
      </Sheet>
    </>
  );
}
