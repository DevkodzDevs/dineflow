"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Users, TrendingDown, PackageOpen, HardHat, Activity, ShieldCheck, MapPin, Info, Check, Phone, Lock, Plus } from "lucide-react";
import { Button, Card, Field, Pill, StatTile, Sheet, cn, Empty } from "@/components/ui";
import { PageHeader } from "@/components/shell/PageHeader";
import { formatINR } from "@/lib/format";
import { joinNetwork, saveLocation, postSurplus, claimSurplus, closeSurplus, offerStandby, bookStandby } from "./actions";

type Status = { settings: { share_prices?: boolean; share_surplus?: boolean; share_labour?: boolean; share_demand?: boolean; radius_km?: number }; located: boolean; district: string | null; peers_prices: number; peers_surplus: number; peers_labour: number; peers_demand: number; min_contributors: number };
type Price = { item: string; unit: string; my_price: number; my_qty: number; area_median: number; area_low: number; area_high: number; contributors: number; delta_pct: number; weekly_excess: number; samples: number };
type Surplus = { id: string; item: string; qty: number; unit: string; best_before: string | null; price: number; note: string | null; km: number | null; who: string; mine: boolean; status: string; contact: string | null; claimed_by_me: boolean };
type Standby = { id: string; name: string; skill: string | null; daily_wage: number; km: number | null; from_time: string | null; to_time: string | null; note: string | null; who: string; mine: boolean; status: string; contact: string | null; verified: boolean; days_worked: number };
type Demand = { available: boolean; reason?: string; peers?: number; need?: number; index?: number; label?: string; detail?: string };

const TABS = [
  { k: "prices", label: "What things cost", Icon: TrendingDown },
  { k: "surplus", label: "Surplus board", Icon: PackageOpen },
  { k: "labour", label: "Standby hands", Icon: HardHat },
  { k: "signal", label: "Area signal", Icon: Activity },
] as const;

export function NeighboursClient({ tab, today, status, prices, surplus, standby, demand, ingredients, labourers, restaurant, syncedAt }:
  { tab: "prices" | "surplus" | "labour" | "signal"; today: string; status: Status; prices: Price[]; surplus: Surplus[]; standby: Standby[]; demand: Demand;
    ingredients: { id: string; name: string; unit: string; current_stock: number }[]; labourers: { id: string; full_name: string; skill: string | null; daily_wage: number }[];
    restaurant: { district: string | null; pincode: string | null; property_type: string; network_alias: string | null }; syncedAt?: string | null }) {
  const [t, setT] = useState(tab);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null);
  const [setup, setSetup] = useState(false); const [postSheet, setPostSheet] = useState(false); const [offerSheet, setOfferSheet] = useState(false);
  const s = status?.settings ?? {};
  const joined = !!(s.share_prices || s.share_surplus || s.share_labour || s.share_demand);
  const excess = prices.reduce((x, p) => x + Number(p.weekly_excess), 0);
  const overpaying = prices.filter((p) => p.delta_pct > 3);

  const Stream = ({ on, label, peers, children }: { on: boolean; label: string; peers: number; children: React.ReactNode }) => {
    if (!on) return <Card className="!bg-porcelain-2 text-center py-10"><Lock size={20} className="mx-auto text-steel" /><p className="font-semibold mt-2">{label} is switched off</p><p className="text-sm text-steel mt-1 max-w-md mx-auto">Share to see your area. You stay anonymous; stop any time.</p><Button className="mt-4" onClick={() => setSetup(true)}>Turn it on</Button></Card>;
    if (peers < status.min_contributors) return <Card className="!bg-champagne-2 flex items-start gap-3"><Info size={18} className="shrink-0 mt-0.5" /><div className="text-sm"><b>Not enough neighbours yet — {peers} of {status.min_contributors}.</b> Figures show once {status.min_contributors} properties share, so no one can be singled out.</div></Card>;
    return <>{children}</>;
  };

  return (
    <>
      <PageHeader eyebrow={`Private network · ${status.district ?? "set your area"}`} title="Neigh" accent="bours"
        sub="Anonymous figures from DineFlow places near you."
        actions={<Button variant="outline" onClick={() => setSetup(true)}><ShieldCheck size={16} /> Sharing & privacy</Button>} />

      {syncedAt !== undefined && syncedAt !== null && <p className="text-xs text-steel mb-4">Running on the Box · area figures from {new Date(syncedAt).toLocaleString("en-IN")}. Refreshes every minute when online.</p>}
      {msg && <div className="feather p-3 mb-4 text-sm flex items-center gap-2 border-mint"><Check size={15} className="text-mint" /> {msg}</div>}
      {err && <p className="text-sm text-chili mb-4">{err}</p>}

      {!status.located && (
        <Card className="!bg-chili-2 flex items-start gap-3 mb-5"><MapPin size={18} className="shrink-0 mt-0.5" /><div className="text-sm flex-1"><b>Set your district first.</b> Neighbours are matched by distance. Only your district is needed.</div><Button size="sm" onClick={() => setSetup(true)}>Set it</Button></Card>
      )}
      {!joined && status.located && (
        <Card className="!bg-champagne-2 flex items-start gap-3 mb-5"><Users size={18} className="shrink-0 mt-0.5" /><div className="text-sm flex-1"><b>You haven&apos;t joined yet.</b> Pick what to share — each one is separate.</div><Button size="sm" onClick={() => setSetup(true)}>Choose</Button></Card>
      )}

      {/* a phone: the four sections as an even 2×2 of tiles (they wrapped two-and-two at odd widths) */}
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap mb-5">
        {TABS.map(({ k, label, Icon }) => <button key={k} onClick={() => setT(k)} className={cn("chip gap-1.5 max-sm:!h-12 max-sm:!rounded-2xl max-sm:justify-start max-sm:px-3.5 max-sm:min-w-0", t === k && "on")}><Icon size={15} className="shrink-0" /> <span className="truncate">{label}</span></button>)}
      </div>

      {/* ── 1. price index ── */}
      {t === "prices" && (
        <Stream on={!!s.share_prices} label="Price pooling" peers={status.peers_prices}>
          <div className="grid grid-cols-2 min-[900px]:grid-cols-4 gap-3 mb-5">
            <StatTile label="Paying over the odds" value={String(overpaying.length)} sub={`of ${prices.length} items compared`} tone={overpaying.length ? "alert" : "good"} />
            <StatTile label="Extra per week" value={formatINR(excess)} sub="if you matched the median" tone={excess > 0 ? "alert" : "good"} delay={0.05} />
            <StatTile label="Contributing nearby" value={String(status.peers_prices)} sub={`within ${s.radius_km ?? 40} km`} delay={0.1} />
            <StatTile label="Yearly, at this rate" value={formatINR(excess * 52)} sub="the case for switching supplier" delay={0.15} />
          </div>
          {prices.length === 0 ? <Empty title="Nothing to compare yet" hint="Add a few purchases with prices in Pantry. Shows here in a day." action={<Link href="/inventory"><Button>Open Pantry</Button></Link>} /> : (
            <Card>
              <p className="text-xs text-steel mb-4">Only what you <b>pay suppliers</b> is shared, never your menu prices. A row shows once {status.min_contributors} properties share it.</p>
              <div className="overflow-x-auto table-wrap"><table className="w-full text-sm min-w-[680px]">
                <thead className="text-xs uppercase tracking-wide text-steel border-b border-line"><tr><th className="text-left py-2">Item</th><th className="text-right py-2">You pay</th><th className="text-right py-2">Area median</th><th className="text-right py-2">Range</th><th className="text-right py-2">Difference</th><th className="text-right py-2">Per week</th></tr></thead>
                <tbody>{prices.map((p, i) => {
                  const over = p.delta_pct > 3, under = p.delta_pct < -3;
                  return (
                    <motion.tr key={p.item + p.unit} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }} className="border-b border-line/60">
                      <td className="py-2.5"><div className="font-medium capitalize">{p.item}</div><div className="text-[11px] text-steel">{p.contributors} properties · {p.samples} purchases</div></td>
                      <td className={cn("py-2.5 text-right num font-semibold", over && "text-chili", under && "text-mint")}>{formatINR(p.my_price)}<span className="text-steel font-normal">/{p.unit}</span></td>
                      <td className="py-2.5 text-right num">{formatINR(p.area_median)}</td>
                      <td className="py-2.5 text-right num text-steel text-xs">{formatINR(p.area_low)}–{formatINR(p.area_high)}</td>
                      <td className="py-2.5 text-right"><Pill tone={over ? "alert" : under ? "ready" : "pending"}>{p.delta_pct > 0 ? "+" : ""}{p.delta_pct}%</Pill></td>
                      <td className={cn("py-2.5 text-right num", over ? "text-chili font-semibold" : "text-steel")}>{p.weekly_excess > 0 ? formatINR(p.weekly_excess) : "—"}</td>
                    </motion.tr>);
                })}</tbody>
              </table></div>
              {excess > 0 && <p className="text-sm mt-4 p-3 rounded-xl bg-chili-2 text-ink">Paying the area median on red rows saves about <b className="num">{formatINR(excess)}</b> a week. Show this to your supplier.</p>}
            </Card>
          )}
        </Stream>
      )}

      {/* ── 2. surplus ── */}
      {t === "surplus" && (
        <Stream on={!!s.share_surplus} label="The surplus board" peers={0}>
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-steel max-w-xl">Sell spare stock nearby before it spoils. Phone numbers swap only after a claim.</p>
            <Button onClick={() => setPostSheet(true)}><Plus size={16} /> List surplus</Button>
          </div>
          {surplus.length === 0 ? <Empty title="Board is empty" hint="List stock about to expire, or check back later." /> : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {surplus.map((l, i) => {
                const days = l.best_before ? Math.ceil((new Date(l.best_before).getTime() - Date.now()) / 86400000) : null;
                return (
                  <motion.div key={l.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                    <Card lift className={cn("h-full", l.mine && "border-champagne")}>
                      <div className="flex items-start justify-between gap-2">
                        <div><div className="font-semibold text-lg">{l.item}</div><div className="num text-sm text-steel">{l.qty} {l.unit}{l.price > 0 ? ` · ${formatINR(l.price)}` : " · free"}</div></div>
                        {days !== null && <Pill tone={days <= 1 ? "alert" : days <= 3 ? "preparing" : "pending"}>{days <= 0 ? "today" : `${days}d left`}</Pill>}
                      </div>
                      {l.note && <p className="text-xs text-steel mt-2">{l.note}</p>}
                      <div className="text-xs text-steel mt-2 flex items-center gap-1.5"><MapPin size={11} />{l.mine ? "Your listing" : `${l.who}${l.km ? ` · ${l.km} km` : ""}`}</div>
                      {l.contact && <div className="mt-2 text-sm font-semibold flex items-center gap-1.5"><Phone size={13} /> {l.contact}</div>}
                      <div className="mt-3 flex gap-2">
                        {l.mine ? <>
                          <Button size="sm" variant="outline" className="flex-1" disabled={pending} onClick={() => start(async () => { await closeSurplus(l.id, "collected"); setMsg("Marked collected"); })}>Collected</Button>
                          <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => { await closeSurplus(l.id, "cancelled"); })}>Remove</Button>
                        </> : l.status === "claimed" ? <Pill tone={l.claimed_by_me ? "ready" : "served"}>{l.claimed_by_me ? "you claimed this" : "claimed"}</Pill>
                        : <Button size="sm" className="flex-1" disabled={pending} onClick={() => start(async () => { const r = await claimSurplus(l.id); if ("error" in r) setErr(r.error!); else setMsg(`Claimed ${r.item} — call ${r.contact ?? "the property"} to collect`); })}>Claim it</Button>}
                      </div>
                    </Card>
                  </motion.div>);
              })}
            </div>
          )}
        </Stream>
      )}

      {/* ── 3. standby labour ── */}
      {t === "labour" && (
        <Stream on={!!s.share_labour} label="Standby hands" peers={0}>
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-steel max-w-xl">Lend a free worker to a neighbour, or find help when short.</p>
            <Button onClick={() => setOfferSheet(true)}><Plus size={16} /> Offer someone</Button>
          </div>
          {standby.length === 0 ? <Empty title="Nobody on standby today" hint="Offer a worker with no shift, or look here when short." /> : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {standby.map((w, i) => (
                <motion.div key={w.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                  <Card lift className={cn("h-full", w.mine && "border-champagne")}>
                    <div className="flex items-start gap-3">
                      <span className="h-11 w-11 rounded-2xl bg-ink text-on-label grid place-items-center font-display text-lg shrink-0">{w.name.slice(0, 1)}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold truncate">{w.name}</div>
                        <div className="text-xs text-steel capitalize">{w.skill} · {formatINR(Number(w.daily_wage))}/day</div>
                      </div>
                      {w.verified && <Pill tone="ready"><ShieldCheck size={11} /> ID on file</Pill>}
                    </div>
                    <div className="text-xs text-steel mt-2">{w.days_worked} days worked in the last month{w.from_time ? ` · free ${w.from_time.slice(0, 5)}–${w.to_time?.slice(0, 5) ?? ""}` : ""}</div>
                    <div className="text-xs text-steel mt-1 flex items-center gap-1.5"><MapPin size={11} />{w.mine ? "Your worker" : `${w.who}${w.km ? ` · ${w.km} km` : ""}`}</div>
                    {w.note && <p className="text-xs text-steel mt-1.5">{w.note}</p>}
                    {w.contact && <div className="mt-2 text-sm font-semibold flex items-center gap-1.5"><Phone size={13} /> {w.contact}</div>}
                    <div className="mt-3">
                      {w.mine ? <Pill tone={w.status === "booked" ? "ready" : "gold"}>{w.status === "booked" ? "booked by a neighbour" : "offered"}</Pill>
                        : w.status === "booked" ? <Pill tone="served">booked</Pill>
                        : <Button size="sm" className="w-full" disabled={pending} onClick={() => start(async () => { const r = await bookStandby(w.id); if ("error" in r) setErr(r.error!); else setMsg(`${r.name} booked — call ${r.contact ?? "the property"} to confirm`); })}>Book for today</Button>}
                    </div>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
          <p className="text-xs text-steel mt-4">Pay and legal duties lie with that day&apos;s employer. DineFlow only introduces you.</p>
        </Stream>
      )}

      {/* ── 4. area signal ── */}
      {t === "signal" && (
        <Stream on={!!s.share_demand} label="The area signal" peers={status.peers_demand}>
          {!demand?.available ? (
            <Card className="!bg-champagne-2 flex items-start gap-3"><Info size={18} className="shrink-0 mt-0.5" /><div className="text-sm"><b>Signal not available yet.</b> {demand?.reason === "too few neighbours" ? `${demand.peers} of ${demand.need} properties nearby are sharing. ` : ""}It needs more neighbours and a few weeks of area history.</div></Card>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
              <Card glow>
                <div className="eyebrow">Last comparable day</div>
                <div className="flex items-baseline gap-3 mt-2">
                  <span className="font-display num text-[60px] leading-none">{Math.round((demand.index ?? 1) * 100)}%</span>
                  <span className="text-steel text-sm">of a normal day</span>
                </div>
                <Pill tone={(demand.index ?? 1) >= 1.25 ? "ready" : (demand.index ?? 1) <= 0.8 ? "alert" : "pending"}>{demand.label}</Pill>
                <p className="text-sm text-steel mt-3">{demand.detail}</p>
              </Card>
              <Card>
                <h3 className="text-xl">Why this matters</h3>
                <p className="text-sm text-steel mt-2 leading-relaxed">Your history shows what is normal. Your area shows what is happening <i>now</i> — a festival, a wedding, a bandh — often a day early.</p>
                <p className="text-sm text-steel mt-3 leading-relaxed">The <Link href="/tomorrow" className="underline font-semibold text-ink">Tomorrow brief</Link> uses this at half weight, capped at ±20%.</p>
                <Link href="/tomorrow"><Button variant="outline" className="mt-4">See tomorrow&apos;s brief</Button></Link>
              </Card>
            </div>
          )}
        </Stream>
      )}

      {/* ── sharing & privacy ── */}
      <Sheet open={setup} onClose={() => setSetup(false)} title="Sharing & privacy" wide>
        <SetupForm status={status} restaurant={restaurant} onDone={(m) => { setSetup(false); setMsg(m); }} onError={setErr} />
      </Sheet>

      <Sheet open={postSheet} onClose={() => setPostSheet(false)} title="List surplus stock">
        <PostForm ingredients={ingredients} onDone={() => { setPostSheet(false); setMsg("Listed. Neighbours can see it now."); }} onError={setErr} />
      </Sheet>

      <Sheet open={offerSheet} onClose={() => setOfferSheet(false)} title="Offer a worker on standby">
        <OfferForm labourers={labourers} today={today} onDone={() => { setOfferSheet(false); setMsg("Offered for today."); }} onError={setErr} />
      </Sheet>
    </>
  );
}

function SetupForm({ status, restaurant, onDone, onError }: { status: Status; restaurant: { district: string | null; pincode: string | null; network_alias: string | null }; onDone: (m: string) => void; onError: (e: string) => void }) {
  const s = status.settings ?? {};
  const [v, setV] = useState({ prices: !!s.share_prices, surplus: !!s.share_surplus, labour: !!s.share_labour, demand: !!s.share_demand, radius: s.radius_km ?? 40 });
  const [loc, setLoc] = useState({ district: restaurant.district ?? "", pincode: restaurant.pincode ?? "", alias: restaurant.network_alias ?? "" });
  const [pending, start] = useTransition();
  const Row = ({ k, title, gives, takes }: { k: keyof typeof v; title: string; gives: string; takes: string }) => (
    <label className={cn("feather p-4 flex gap-3 cursor-pointer transition", v[k] && "border-mint bg-mint-2/40")}>
   <input type="checkbox" checked={!!v[k]} onChange={(e) => setV({ ...v, [k]: e.target.checked })} className="mt-1" />
      <div><div className="font-semibold">{title}</div>
        <div className="text-xs text-steel mt-1"><b className="text-ink">You give:</b> {gives}</div>
        <div className="text-xs text-steel"><b className="text-ink">You get:</b> {takes}</div></div>
    </label>
  );
  return (
    <div className="space-y-4">
      <Card className="!bg-sky-2 flex items-start gap-3"><ShieldCheck size={18} className="shrink-0 mt-0.5" /><div className="text-sm">
        <b>The rules.</b> All off by default. Your name never shows, and no figure shows until {status.min_contributors} properties share. <b>Menu prices are never shared.</b> Turn one off and your old data stops being used.</div></Card>
      <div className="grid gap-3">
        <Row k="prices" title="What things cost" gives="the prices you pay suppliers, anonymised" takes="area prices for what you buy, and where you overpay" />
        <Row k="surplus" title="Surplus board" gives="stock you list as spare" takes="cheap stock from nearby kitchens" />
        <Row k="labour" title="Standby hands" gives="workers you mark free today" takes="ID-verified help when you are short-handed" />
        <Row k="demand" title="Area signal" gives="your daily cover count, as a number only" takes="early warning of busy or quiet days" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="District"><input value={loc.district} onChange={(e) => setLoc({ ...loc, district: e.target.value })} placeholder="Kanyakumari" /></Field>
        <Field label="Pincode"><input className="num" value={loc.pincode} onChange={(e) => setLoc({ ...loc, pincode: e.target.value })} placeholder="629702" /></Field>
        <Field label="Radius (km)"><input type="number" className="num" value={v.radius} onChange={(e) => setV({ ...v, radius: Number(e.target.value) })} /></Field>
      </div>
      <Field label="How neighbours see you" hint="Shown on surplus and standby listings only"><input value={loc.alias} onChange={(e) => setLoc({ ...loc, alias: e.target.value })} placeholder="A resort near the beach" /></Field>
      <Button className="w-full" disabled={pending} onClick={() => start(async () => {
        const a = await saveLocation({ district: loc.district, pincode: loc.pincode });
        if ("error" in a) return onError(a.error!);
        const b = await joinNetwork({ ...v, alias: loc.alias || undefined });
        if ("error" in b) return onError(b.error!);
        onDone("Sharing preferences saved");
      })}>Save</Button>
    </div>
  );
}

function PostForm({ ingredients, onDone, onError }: { ingredients: { id: string; name: string; unit: string; current_stock: number }[]; onDone: () => void; onError: (e: string) => void }) {
  const [f, setF] = useState({ id: "", item: "", qty: 0, unit: "kg", best_before: new Date(Date.now() + 86400000).toISOString().slice(0, 10), price: 0, note: "" });
  const [pending, start] = useTransition();
  const pick = (id: string) => { const i = ingredients.find((x) => x.id === id); setF({ ...f, id, item: i?.name ?? "", unit: i?.unit ?? "kg", qty: i ? Math.round(i.current_stock * 100) / 100 : 0 }); };
  return (
    <div className="space-y-4">
      <Field label="From your pantry"><select value={f.id} onChange={(e) => pick(e.target.value)}><option value="">— type it in instead —</option>{ingredients.map((i) => <option key={i.id} value={i.id}>{i.name} · {i.current_stock} {i.unit}</option>)}</select></Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Item"><input value={f.item} onChange={(e) => setF({ ...f, item: e.target.value })} /></Field>
        <Field label="Quantity"><input type="number" step="0.01" className="num" value={f.qty || ""} onChange={(e) => setF({ ...f, qty: Number(e.target.value) })} /></Field>
        <Field label="Unit"><input value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Best before"><input type="date" className="num" value={f.best_before} onChange={(e) => setF({ ...f, best_before: e.target.value })} /></Field>
        <Field label="Asking price (₹)" hint="Leave 0 to give it away"><input type="number" className="num" value={f.price || ""} onChange={(e) => setF({ ...f, price: Number(e.target.value) })} /></Field>
      </div>
      <Field label="Note"><input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Kept chilled. Collect by 6pm." /></Field>
      <Button className="w-full" disabled={pending || !f.item || !f.qty} onClick={() => start(async () => { const r = await postSurplus({ ingredient_id: f.id || null, item: f.item, qty: f.qty, unit: f.unit, best_before: f.best_before || null, price: f.price, note: f.note }); if ("error" in r) onError(r.error!); else onDone(); })}>List it</Button>
    </div>
  );
}

function OfferForm({ labourers, today, onDone, onError }: { labourers: { id: string; full_name: string; skill: string | null; daily_wage: number }[]; today: string; onDone: () => void; onError: (e: string) => void }) {
  const [f, setF] = useState({ id: "", date: today, from: "09:00", to: "18:00", note: "" });
  const [pending, start] = useTransition();
  return (
    <div className="space-y-4">
      <Field label="Worker"><select value={f.id} onChange={(e) => setF({ ...f, id: e.target.value })}><option value="">Choose</option>{labourers.map((l) => <option key={l.id} value={l.id}>{l.full_name} · {l.skill} · {formatINR(Number(l.daily_wage))}/day</option>)}</select></Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Date"><input type="date" className="num" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="From"><input type="time" className="num" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field>
        <Field label="To"><input type="time" className="num" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>
      </div>
      <Field label="Note"><input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Has own transport. Speaks Tamil and Malayalam." /></Field>
      <p className="text-xs text-steel">Only first name and skill show until booked. Ask the worker first.</p>
      <Button className="w-full" disabled={pending || !f.id} onClick={() => start(async () => { const r = await offerStandby(f.id, f.date, f.from, f.to, f.note); if ("error" in r) onError(r.error!); else onDone(); })}>Offer for that day</Button>
    </div>
  );
}
