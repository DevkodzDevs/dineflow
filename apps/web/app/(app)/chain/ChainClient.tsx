"use client";
import { useEffect, useState, useTransition } from "react";
import { Store, Plus, Send, ArrowRight, Flame, ShoppingBag, Users, Bike, Check, Loader2, MapPin, KeyRound } from "lucide-react";
import { Card, Empty, Switch, cn, useToast } from "@/components/ui";
import { formatINR } from "@/lib/format";
import { chainOverview, switchOutlet, createOutlet, pushMenu, grantOutlet, type OutletLive } from "./actions";
import { Say } from "@/components/ui/Say";

export type Person = { id: string; name: string; role: string; home: string; outlets: string[] };
const POLL = 20000;
const inr = (n: number) => formatINR(Number(n), { whole: true });
const dayLetter = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-IN", { weekday: "narrow" });
const daysTo = (d?: string | null) => (d ? Math.ceil((new Date(d).getTime() - Date.now()) / 86400000) : null);
const shortDate = (d: string) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
/** Where the outlet's membership stands, in words: a trial counts down, a membership shows its end date. */
function standing(o: OutletLive): { text: string; warn: boolean } {
  if (o.membership === "trial") { const n = daysTo(o.trial_ends_at); return n == null ? { text: "Trial", warn: true } : n > 0 ? { text: `Trial · ${n} day${n === 1 ? "" : "s"} left`, warn: n <= 3 } : { text: "Trial over", warn: true }; }
  if (o.membership === "active") return { text: o.membership_ends_at ? `Member until ${shortDate(o.membership_ends_at)}` : "Member", warn: (daysTo(o.membership_ends_at) ?? 99) <= 7 };
  return { text: o.membership === "expired" ? "Membership ended" : "Suspended", warn: true };
}

/**
 * The chain at a glance: totals for today across every outlet, then one live card per outlet — sales and bills
 * today, open orders against tables, late tickets (red), new online orders, staff on duty, expenses, and the week as
 * seven bars — refreshed every 20 seconds. "Work here" stands this device in that outlet. Below: open an outlet
 * (owner), send this outlet's menu to others (owner, manager), and which managers may switch (owner).
 */
export function ChainClient({ initial, people, role, current, currentName, isDemo }: { initial: OutletLive[]; people: Person[]; role: string; current: string; currentName: string; isDemo: boolean }) {
  const toast = useToast(); const [pending, start] = useTransition();
  // the clock starts in the browser: read on the server it was a second older by the time the page woke up, and the
  // two texts disagreed (React #418, some loads — 2026-10-18)
  const [list, setList] = useState(initial); const [at, setAt] = useState<Date | null>(null);
  useEffect(() => {
    setAt(new Date());
    const t = setInterval(() => { void chainOverview().then((r) => { if ("list" in r && r.list) { setList(r.list); setAt(new Date()); } }); }, POLL);
    return () => clearInterval(t);
  }, []);
  const sum = (k: keyof OutletLive) => list.reduce((a, o) => a + Number(o[k] ?? 0), 0);
  const weekMax = Math.max(1, ...list.flatMap((o) => o.week.map((w) => Number(w.sales))));
  const owner = role === "owner";

  const [name, setName] = useState(""); const [copy, setCopy] = useState(true);
  const [targets, setTargets] = useState<string[]>([]); const [prices, setPrices] = useState(true);
  // outlet_switch takes the person's own outlet as "back home", so every card passes its own id
  const work = (o: OutletLive, to = "/dashboard") => start(async () => { if (o.current) { location.assign(to); return; } const r = await switchOutlet(o.id); if ("error" in r) toast(r.error!, "err"); else location.assign(to); });

  return (
    <div className="space-y-5" data-chain>
      {/* today across the chain */}
      <div className="fill-tiles !gap-2.5" data-chain-totals>
        {[["Outlets", String(list.length)], ["Sales today", inr(sum("sales"))], ["Bills", String(sum("bills"))], ["Open orders", String(sum("open_orders"))], ["Late tickets", String(sum("late"))]].map(([k, v]) => (
          <div key={k} className={cn("feather !rounded-[18px] px-4 py-3 min-w-0", k === "Late tickets" && Number(v) > 0 && "!border-[var(--color-red)]")}>
            <div className="text-[12px] font-bold text-steel">{k}</div><div className={cn("font-display num text-[24px] leading-tight truncate", k === "Late tickets" && Number(v) > 0 && "text-chili")}>{v}</div></div>))}
      </div>
      <div className="text-[12px] text-steel -mt-2" aria-live="polite">Live{at && <> · updated {at.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", second: "2-digit", timeZone: "Asia/Kolkata" })}</>}</div>

      {list.length <= 1 && <Empty title="One outlet so far" hint={owner ? "Open one below" : "Ask the owner"} />}

      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3" data-outlets>
        {list.map((o) => (
          <Card key={o.id} className={cn("min-w-0 !p-0 overflow-hidden", o.current && "!border-[var(--color-tint)]")} data-outlet={o.name}>
            <div className="px-4 pt-4 flex items-start gap-3">
              <span className="h-11 w-11 shrink-0 rounded-xl grid place-items-center bg-[var(--color-fill)]"><Store size={20} aria-hidden /></span>
              <div className="min-w-0 flex-1">
                <div className="text-[17px] font-extrabold truncate">{o.name}</div>
                <div className="text-[12.5px] text-steel flex flex-wrap gap-x-2">{o.city && <span className="inline-flex items-center gap-1"><MapPin size={12} aria-hidden />{o.city}</span>}<span className={cn(standing(o).warn && "font-bold", o.membership === "expired" || o.membership === "suspended" ? "text-chili" : standing(o).warn && "text-[var(--color-orange)]")} data-outlet-standing>{standing(o).text}</span></div>
              </div>
              {o.current ? <span className="shrink-0 rounded-full px-2.5 py-1 text-[12px] font-extrabold bg-[var(--color-green-2)] text-[var(--color-green)]">Working here</span>
                : <button type="button" disabled={pending} onClick={() => work(o)} className="shrink-0 svc-btn quiet sm !px-3" data-work-here><Say w="work_here" /> <ArrowRight size={15} aria-hidden /></button>}
            </div>
            {owner && o.membership !== "active" && o.membership !== "suspended" && (
              <div className="mx-4 mt-3 rounded-xl bg-[var(--color-orange-2)] px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1" data-outlet-activate>
                <span className="text-[12.5px] font-semibold min-w-0 flex-1">Needs a membership key</span>
                <button type="button" disabled={pending} onClick={() => work(o, "/membership")} className="svc-btn quiet sm !px-3 shrink-0" data-switch-on><KeyRound size={15} aria-hidden /><Say w="switch_on" /></button>
              </div>)}
            <div className="px-4 pt-3 flex items-baseline gap-2"><span className="font-display num text-[30px] leading-none" data-outlet-sales>{inr(o.sales)}</span><span className="text-[13px] text-steel">today · {o.bills} bill{o.bills === 1 ? "" : "s"}</span></div>
            <div className="px-4 pt-3 grid grid-cols-4 gap-2 text-center">
              {[[ShoppingBag, `${o.busy_tables}/${o.tables}`, "tables"], [Flame, String(o.late), "late"], [Bike, String(o.online_new), "online"], [Users, String(o.on_duty), "on duty"]].map(([I, v, k]) => {
                const Icon = I as typeof Flame; const red = k === "late" && Number(v) > 0;
                return <div key={k as string} className={cn("rounded-xl py-2", red ? "bg-[var(--color-red-2)] text-[var(--color-red)]" : "bg-[var(--color-fill)]")}><Icon size={15} className="mx-auto" aria-hidden /><div className="num font-extrabold text-[15px] mt-0.5">{v as string}</div><div className="text-[11px] font-semibold opacity-75">{k as string}</div></div>;
              })}
            </div>
            <div className="px-4 pt-3 pb-4">
              <div className="flex items-end gap-1.5 h-14" aria-label="The last seven days">
                {o.week.map((w, i) => <div key={w.day} className="flex-1 flex flex-col items-center gap-1 min-w-0" title={`${w.day}: ${inr(w.sales)}`}>
                  <div className={cn("w-full rounded-t-md", i === 6 ? "bg-[var(--color-tint)]" : "bg-[var(--color-fill-2)]")} style={{ height: `${Math.max(4, (Number(w.sales) / weekMax) * 40)}px` }} />
                  <span className="text-[10px] text-steel">{dayLetter(w.day)}</span></div>)}
              </div>
              <div className="mt-2 flex justify-between text-[12px] text-steel"><span>Week {inr(o.week.reduce((a, w) => a + Number(w.sales), 0))}</span><span>Spent today {inr(o.expenses)}</span></div>
            </div>
          </Card>))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {owner && !isDemo && (
          <Card data-new-outlet>
            {/* phones: the heading and line as they were */}
            <div className="md:hidden">
              <div className="flex items-center gap-2 text-[17px] font-extrabold mb-1"><Plus size={18} aria-hidden /> Open a new outlet</div>
              <p className="text-[13px] text-steel mb-3">Copies <b>{currentName}</b> · 7-day trial</p>
            </div>
            {/* iPad and up (2026-10-24, the owner: "design"): an icon tile and the heading, then what the new outlet brings along
                as chips, the name with a pin in the field, and copying the menu as a switch row */}
            <div className="hidden md:block" data-new-outlet-head>
              <div className="flex items-center gap-3">
                <span className="h-12 w-12 shrink-0 rounded-[15px] grid place-items-center bg-[var(--color-green-2)] text-[var(--color-green)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-green)_22%,transparent)]"><Store size={22} aria-hidden /></span>
                <div className="min-w-0"><div className="text-[18px] font-extrabold leading-tight">Open a new outlet</div><div className="text-[13px] text-steel mt-0.5">Run from this login</div></div>
              </div>
              <div className="mt-4 text-[11.5px] font-bold uppercase tracking-[.08em] text-steel">Copied from {currentName}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {[["Brand", "var(--color-violet)", "var(--color-violet-2)"], ["GST", "var(--color-blue)", "var(--color-blue-2)"], ["Sections", "var(--color-cyan)", "var(--color-cyan-2)"], ["7-day trial", "var(--color-orange)", "var(--color-orange-2)"]].map(([t, h, h2]) => (
                  <span key={t} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[12.5px] font-bold" style={{ background: h2, color: h }}><Check size={13} strokeWidth={3} aria-hidden />{t}</span>))}
              </div>
              <label className="mt-4 block text-[13px] font-bold" htmlFor="outlet-name">Outlet name or area</label>
            </div>
            <div className="relative md:mt-1.5">
              <MapPin size={17} className="hidden md:block absolute left-3.5 top-1/2 -translate-y-1/2 text-steel pointer-events-none" aria-hidden />
              <input id="outlet-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Anna Nagar" maxLength={80} data-outlet-name className="md:!pl-10" />
            </div>
            <label className="mt-3 flex items-center gap-3 !min-h-11 md:hidden"><input type="checkbox" checked={copy} onChange={(e) => setCopy(e.target.checked)} className="h-5 w-5" /> <span className="text-[14px] font-semibold">Copy menu &amp; prices</span></label>
            <label className="hidden md:flex mt-3 items-center gap-3 rounded-[16px] border border-[var(--color-separator)] bg-[var(--color-bg)] px-3.5 py-2.5 min-h-[60px] cursor-pointer" data-copy-menu>
              <span className="h-10 w-10 shrink-0 rounded-[12px] grid place-items-center bg-[var(--color-orange-2)] text-[var(--color-orange)]"><ShoppingBag size={18} aria-hidden /></span>
              <span className="flex-1 min-w-0"><span className="block text-[14.5px] font-bold">Copy menu &amp; prices</span><span className="block text-[12.5px] text-steel">Off: empty menu</span></span>
              <Switch on={copy} onChange={setCopy} name="Copy this outlet's menu and prices" />
            </label>
            <button type="button" disabled={pending || name.trim().length < 2} className="svc-btn go w-full mt-3" data-create-outlet
              onClick={() => start(async () => { const r = await createOutlet(name.trim(), copy); if ("error" in r) toast(r.error!, "err"); else { toast(`${name.trim()} open · switch from top bar`); setName(""); const x = await chainOverview(); if ("list" in x && x.list) setList(x.list); } })}>
              {pending ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} aria-hidden />}<Say w="open_outlet" /></button>
          </Card>)}
        {(owner || role === "manager") && list.length > 1 && (
          <Card data-push-menu>
            <div className="flex items-center gap-2 text-[17px] font-extrabold mb-1"><Send size={18} aria-hidden /> Send menu to outlets</div>
            <p className="text-[13px] text-steel mb-3">From <b>{currentName}</b> · never deletes</p>
            <div className="flex flex-wrap gap-2">
              {list.filter((o) => o.id !== current).map((o) => <button key={o.id} type="button" aria-pressed={targets.includes(o.id)} onClick={() => setTargets((t) => (t.includes(o.id) ? t.filter((x) => x !== o.id) : [...t, o.id]))}
                className={cn("!min-h-11 rounded-full px-4 text-[14px] font-bold inline-flex items-center gap-1.5", targets.includes(o.id) ? "bg-[var(--color-label)] text-[var(--color-on-label)]" : "bg-[var(--color-fill)]")} data-push-target>{targets.includes(o.id) && <Check size={15} aria-hidden />}{o.name}</button>)}
            </div>
            <label className="mt-3 flex items-center gap-3 !min-h-11"><input type="checkbox" checked={prices} onChange={(e) => setPrices(e.target.checked)} className="h-5 w-5" /> <span className="text-[14px] font-semibold">Send the prices too</span></label>
            <button type="button" disabled={pending || !targets.length} className="svc-btn go w-full mt-3" data-send-menu
              onClick={() => start(async () => { const r = await pushMenu(targets, prices); if ("error" in r) { toast(r.error!, "err"); return; } const n = Object.values(r.result ?? {}); toast(`Sent to ${n.length} outlet${n.length === 1 ? "" : "s"} — ${n.reduce((a, x) => a + x.added, 0)} added, ${n.reduce((a, x) => a + x.updated, 0)} updated, ${n.reduce((a, x) => a + (x.addons ?? 0), 0)} add-ons`); setTargets([]); })}>
              <Send size={18} aria-hidden /><Say w="send_menu" /></button>
          </Card>)}
      </div>

      {owner && list.length > 1 && (
        <Card data-chain-people>
          <div className="text-[17px] font-extrabold mb-1">Who can switch outlets</div>
          <p className="text-[13px] text-steel mb-3">Tick allowed outlets</p>
          {people.length === 0 ? <p className="text-sm text-steel">Add managers in Staff</p> : (
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-steel text-xs"><th className="py-1.5 pr-3">Person</th>{list.map((o) => <th key={o.id} className="py-1.5 px-2 text-center font-semibold">{o.name}</th>)}</tr></thead>
              <tbody>{people.map((p) => <tr key={p.id} className="border-t border-line"><td className="py-2 pr-3"><div className="font-bold">{p.name}</div><div className="text-[12px] text-steel capitalize">{p.role}</div></td>
                {list.map((o) => { const home = p.home === o.id; const on = home || p.outlets.includes(o.id); return <td key={o.id} className="py-2 px-2 text-center">
                  {home ? <span className="text-[12px] font-bold text-steel">home</span> : <input type="checkbox" className="h-5 w-5" checked={on} disabled={pending} aria-label={`${p.name} may open ${o.name}`}
                    onChange={(e) => start(async () => { const r = await grantOutlet(p.id, o.id, e.target.checked); if ("error" in r) toast(r.error!, "err"); else toast(e.target.checked ? `${p.name} can open ${o.name}` : `${p.name} can no longer open ${o.name}`); })} />}</td>; })}</tr>)}</tbody></table></div>)}
        </Card>)}
    </div>
  );
}
