"use client";
import { useState, useTransition } from "react";
import { Tag } from "lucide-react";
import { Button, cn } from "@/components/ui";
import { formatINR } from "@dineflow/shared";
import { setPlan } from "./actions";

/**
 * Master control → Keys: Plans & prices (0151, 2026-10-29 — the owner's item 10, "a cheaper restaurant-only plan"). One row a
 * kind of property — Restaurant (a restaurant only) and Hotel & resort — its monthly and yearly price as /membership shows
 * them and as online payment charges them. Empty means not sold online for that period (a key still works). A key's own
 * length is separate: 30 days monthly, 365 yearly.
 */
export type PlanRow = { key: string; label: string; monthly: number | null; yearly: number | null; is_active: boolean; updated_at: string };

export function PlansCard({ plans, online }: { plans: PlanRow[]; online: boolean }) {
  return (
    <section className="card p-5 mt-5" data-plans>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-2xl flex items-center gap-2"><Tag size={20} aria-hidden /> Plans &amp; prices</h2>
        <span className="text-sm text-steel">Per-property prices</span>
      </div>
      <p className={cn("text-xs mt-2", online ? "text-mint" : "text-steel")} data-plans-online={online ? "on" : "off"}>
        {online ? "Online payment on" : "Online payment off — set RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET, SUPABASE_SERVICE_ROLE_KEY on the server. Keys still work."}
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">{plans.map((p) => <PlanEditor key={p.key} p={p} />)}</div>
    </section>
  );
}

function PlanEditor({ p }: { p: PlanRow }) {
  const [label, setLabel] = useState(p.label);
  const [m, setM] = useState(p.monthly == null ? "" : String(Number(p.monthly)));
  const [y, setY] = useState(p.yearly == null ? "" : String(Number(p.yearly)));
  const [active, setActive] = useState(p.is_active);
  const [msg, setMsg] = useState<{ ok?: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  const bad = [m, y].some((v) => v.trim() !== "" && !(Number(v) > 0));
  const saving = num(m) && num(y) ? Math.round(12 - num(y)! / num(m)!) : 0;
  return (
    <div className="feather p-4 space-y-3" data-plan-editor={p.key}>
      <div className="flex items-center gap-2">
        <input value={label} onChange={(e) => setLabel(e.target.value)} aria-label="Plan name" className="flex-1 min-w-0 font-semibold" />
        <button type="button" role="switch" aria-checked={active} data-on={active ? "true" : "false"} className="switch shrink-0" onClick={() => setActive((v) => !v)} aria-label={`${label} plan on sale`} />
      </div>
      <div className="text-xs text-steel">{p.key === "restaurant" ? "Restaurants" : "Hotels and resorts"}</div>
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1"><span className="text-xs text-steel">Monthly (₹)</span><input type="number" min={1} inputMode="numeric" className="num w-full" value={m} onChange={(e) => setM(e.target.value)} placeholder="not online" data-plan-month /></label>
        <label className="space-y-1"><span className="text-xs text-steel">Yearly (₹)</span><input type="number" min={1} inputMode="numeric" className="num w-full" value={y} onChange={(e) => setY(e.target.value)} placeholder="not online" data-plan-year /></label>
      </div>
      <p className="text-xs text-steel">{num(m) ? `${formatINR(num(m)!, { whole: true })} a month` : "No monthly online"} · {num(y) ? `${formatINR(num(y)!, { whole: true })} a year${saving >= 1 ? ` (${saving} month${saving === 1 ? "" : "s"} free)` : ""}` : "no yearly online"}</p>
      {msg && <p className={cn("text-xs", msg.ok ? "text-mint" : "text-chili")}>{msg.text}</p>}
      <Button size="sm" className="w-full" disabled={pending || bad} data-plan-save
        onClick={() => start(async () => { const r = await setPlan(p.key, label, num(m), num(y), active); setMsg("error" in r ? { text: r.error! } : { ok: true, text: "Saved" }); })}>Save prices</Button>
    </div>
  );
}
