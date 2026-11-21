"use client";
import { useState, useTransition } from "react";
import { Globe, Check } from "lucide-react";
import { Button, cn } from "@/components/ui";
import { WEBSITE_PLAN_FEATURES, WEBSITE_PLAN_ALWAYS, websitePlanPrice, type WebsitePlan } from "@dineflow/shared";
import { setWebsitePlanDef, setWebsitePlan } from "./actions";

/**
 * Master control: the website plans (0185; the owner, 2026-11-17 — "the website's options follow the client's website
 * subscription: four plans, kept in Master control").
 *
 * WebsitePlansCard (Keys, under Plans & prices): the four plans — a name, a monthly and a yearly price (empty = "ask
 * us"), and a tick for each of the thirteen extras the plan includes. What every plan has is said once under them.
 * WebsitePlanPick (a property's own sheet): which of the four that property is on. It saves on the tap and takes effect
 * at once: the property's page and its Settings follow `_website_can()` in the database, not anything saved earlier.
 */
export function WebsitePlansCard({ plans }: { plans: WebsitePlan[] }) {
  return (
    <section className="card p-5 mt-5" data-website-plans-admin>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-2xl flex items-center gap-2"><Globe size={20} aria-hidden /> Website plans</h2>
        <span className="text-sm text-steel">What each client's website can switch on</span>
      </div>
      <p className="text-xs mt-2 text-steel">Every plan has: {WEBSITE_PLAN_ALWAYS.join(" · ")}. Assign a plan in a property's own sheet.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">{plans.map((p) => <PlanEditor key={p.key} p={p} />)}</div>
    </section>
  );
}

function PlanEditor({ p }: { p: WebsitePlan }) {
  const [label, setLabel] = useState(p.label);
  const [m, setM] = useState(p.price_month == null ? "" : String(Number(p.price_month)));
  const [y, setY] = useState(p.price_year == null ? "" : String(Number(p.price_year)));
  const [on, setOn] = useState<Set<string>>(() => new Set(p.features));
  const [msg, setMsg] = useState<{ ok?: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const price = (v: string) => (v.trim() === "" ? null : Math.max(0, Math.round(Number(v) || 0)));
  const save = () => start(async () => {
    setMsg(null);
    const r = await setWebsitePlanDef(p.key, label.trim() || p.label, price(m), price(y), WEBSITE_PLAN_FEATURES.map((f) => f.key).filter((k) => on.has(k)));
    setMsg("error" in r ? { text: r.error ?? "Could not save." } : { ok: true, text: "Saved" });
  });
  return (
    <div className="feather p-4 min-w-0" data-website-plan-editor={p.key}>
      <div className="space-y-1.5"><label htmlFor={`wp-${p.key}-name`} className="text-xs text-steel">Name</label>
        <input id={`wp-${p.key}-name`} value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} /></div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="space-y-1.5 min-w-0"><label htmlFor={`wp-${p.key}-m`} className="text-xs text-steel">Monthly ₹</label><input id={`wp-${p.key}-m`} className="num" inputMode="numeric" value={m} onChange={(e) => setM(e.target.value.replace(/[^0-9]/g, ""))} placeholder="Ask us" /></div>
        <div className="space-y-1.5 min-w-0"><label htmlFor={`wp-${p.key}-y`} className="text-xs text-steel">Yearly ₹</label><input id={`wp-${p.key}-y`} className="num" inputMode="numeric" value={y} onChange={(e) => setY(e.target.value.replace(/[^0-9]/g, ""))} placeholder="Ask us" /></div>
      </div>
      <div className="mt-3 text-xs font-semibold uppercase tracking-wide text-steel">Includes <span className="num">{on.size}</span>/{WEBSITE_PLAN_FEATURES.length}</div>
      <ul className="mt-1.5">
        {WEBSITE_PLAN_FEATURES.map((f) => { const ticked = on.has(f.key); return (
          <li key={f.key}>
            <button type="button" role="checkbox" aria-checked={ticked} onClick={() => setOn((s) => { const n = new Set(s); if (n.has(f.key)) n.delete(f.key); else n.add(f.key); return n; })}
              className="w-full min-h-11 flex items-center gap-2.5 text-left text-sm" data-website-plan-tick={f.key}>
              <span aria-hidden className={cn("h-5 w-5 shrink-0 rounded-md grid place-items-center border-2", ticked ? "bg-[var(--color-tint)] border-[var(--color-tint)] text-[var(--color-on-tint)]" : "border-[var(--color-label-3)]")}>{ticked && <Check size={13} strokeWidth={3} />}</span>
              <span className="min-w-0">{f.label}</span>
            </button>
          </li>); })}
      </ul>
      <div className="mt-3 flex items-center gap-3"><Button onClick={save} loading={pending} className="!h-11" data-website-plan-save={p.key}>Save</Button>
        {msg && <span role="status" className={cn("text-sm", msg.ok ? "text-mint" : "text-[var(--color-red)]")}>{msg.text}</span>}</div>
    </div>
  );
}

export function WebsitePlanPick({ restaurantId, current, plans }: { restaurantId: string; current: string; plans: WebsitePlan[] }) {
  const [mine, setMine] = useState(current);
  const [msg, setMsg] = useState<{ ok?: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const pick = (key: string) => { if (key === mine || pending) return; start(async () => { setMsg(null); const r = await setWebsitePlan(restaurantId, key); if ("error" in r) setMsg({ text: r.error ?? "Could not change the plan." }); else { setMine(key); setMsg({ ok: true, text: "Changed — the website follows it now" }); } }); };
  return (
    <div className="space-y-2" data-website-plan-pick>
      <div className="text-xs font-semibold uppercase tracking-wide text-steel">Website plan</div>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Website plan">
        {plans.map((p) => (
          <button key={p.key} type="button" role="radio" aria-checked={p.key === mine} disabled={pending} onClick={() => pick(p.key)} data-website-plan-option={p.key}
            className={cn("min-h-[56px] rounded-xl border-2 px-3 py-2 text-left transition-colors", p.key === mine ? "border-[var(--color-tint)] bg-[var(--color-fill)]" : "border-[var(--color-separator)]")}>
            <span className="block text-sm font-bold">{p.label}</span><span className="block text-[11.5px] text-steel num">{p.features.length} extras · {websitePlanPrice(p)}</span>
          </button>
        ))}
      </div>
      {msg && <p role="status" className={cn("text-sm", msg.ok ? "text-mint" : "text-[var(--color-red)]")}>{msg.text}</p>}
    </div>
  );
}
