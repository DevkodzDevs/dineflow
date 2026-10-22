"use client";
import { useState, useTransition } from "react";
import { Plane, Check, X } from "lucide-react";
import { Card, cn, useToast } from "@/components/ui";
import { decideLeave } from "../home/actions";

export type LeaveRow = { id: string; profile_id: string; from_date: string; to_date: string; days: number; kind: string; reason: string | null; status: "requested" | "approved" | "rejected" | "cancelled"; decision_note: string | null; created_at: string };
const KIND: Record<string, string> = { casual: "Casual", sick: "Sick", earned: "Earned", unpaid: "Unpaid", other: "Other" };
const dmy = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const STATE: Record<LeaveRow["status"], string> = { requested: "Waiting", approved: "Approved", rejected: "Not approved", cancelled: "Withdrawn" };

/**
 * **Leave requests** (0127, 2026-10-20): what the staff have asked for — the waiting ones first, each with Approve and
 * Not approve and a short note — then the last few decided. RLS hands the owner and managers the whole property's and a
 * supervisor their own team's; `leave_decide` checks the same, and nobody decides their own.
 */
export function StaffLeave({ rows, names, me }: { rows: LeaveRow[]; names: Record<string, string>; me: string }) {
  const toast = useToast(); const [pending, start] = useTransition();
  const [note, setNote] = useState<Record<string, string>>({});
  const waiting = rows.filter((r) => r.status === "requested");
  const decided = rows.filter((r) => r.status !== "requested").slice(0, 6);
  const decide = (id: string, ok: boolean) => start(async () => { const r = await decideLeave(id, ok, note[id] ?? ""); if ("error" in r) toast(r.error!, "err"); else toast(ok ? "Approved — they are told" : "Not approved — they are told"); });
  return (
    <Card className="mt-5 !p-0 overflow-hidden" data-staff-leave>
      <div className="px-4 sm:px-5 pt-4 pb-3 flex items-center gap-3">
        <span className="h-10 w-10 rounded-xl grid place-items-center bg-[var(--color-cyan-2)] text-[var(--color-cyan)]"><Plane size={19} aria-hidden /></span>
        <div className="min-w-0 flex-1"><div className="text-[16px] font-bold">Leave requests</div><div className="text-[12.5px] text-steel">{waiting.length ? `${waiting.length} waiting for your answer` : "Nothing waiting"}</div></div>
      </div>
      {waiting.length === 0 && decided.length === 0 && <p className="px-5 pb-5 text-[13.5px] text-steel">Leave requests from My day show here.</p>}
      <ul>
        {waiting.map((r) => (
          <li key={r.id} className="px-4 sm:px-5 py-3.5 border-t border-[var(--color-separator)]" data-leave-request={r.id}>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5"><b className="text-[15px]">{names[r.profile_id] ?? "Someone"}</b><span className="text-[13px] text-steel">{dmy(r.from_date)}{r.to_date !== r.from_date ? ` → ${dmy(r.to_date)}` : ""} · {Number(r.days)} day{Number(r.days) === 1 ? "" : "s"} · {KIND[r.kind] ?? r.kind}</span></div>
            {r.reason && <div className="mt-0.5 text-[13px] text-steel">“{r.reason}”</div>}
            {r.profile_id !== me && (
              <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto_auto] gap-2">
                <input value={note[r.id] ?? ""} onChange={(e) => setNote((n) => ({ ...n, [r.id]: e.target.value }))} maxLength={300} placeholder="A note for them — if you like" aria-label={`Note for ${names[r.profile_id] ?? "them"}`} />
                <button type="button" disabled={pending} onClick={() => decide(r.id, true)} className="svc-btn go sm !px-4" data-leave-approve><Check size={17} aria-hidden /> Approve</button>
                <button type="button" disabled={pending} onClick={() => decide(r.id, false)} className="svc-btn quiet sm !px-4" data-leave-reject><X size={17} aria-hidden /> Not approve</button>
              </div>)}
          </li>))}
        {decided.map((r) => (
          <li key={r.id} className="px-4 sm:px-5 py-3 border-t border-[var(--color-separator)] flex items-center gap-3 min-w-0">
            <span className="min-w-0 flex-1 text-[13.5px] truncate"><b>{names[r.profile_id] ?? "Someone"}</b> <span className="text-steel">· {dmy(r.from_date)}{r.to_date !== r.from_date ? ` → ${dmy(r.to_date)}` : ""} · {KIND[r.kind] ?? r.kind}</span></span>
            <span className={cn("shrink-0 h-7 px-2.5 rounded-full text-[12px] font-bold grid place-items-center", r.status === "approved" ? "bg-[var(--color-green-2)] text-[color-mix(in_srgb,var(--color-green)_80%,var(--color-label))]" : r.status === "rejected" ? "bg-[var(--color-red-2)] text-[color-mix(in_srgb,var(--color-red)_80%,var(--color-label))]" : "bg-[var(--color-fill)] text-steel")}>{STATE[r.status]}</span>
          </li>))}
      </ul>
    </Card>
  );
}
