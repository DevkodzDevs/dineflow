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
    if (!on) return <Card className="!bg-porcelain-2 text-center py-10"><Lock size={20} className="mx-auto text-steel" /><p className="font-semibold mt-2">{label} is switched off</p><p className="text-sm text-steel mt-1 max-w-md mx-auto">This stream is a two-way street: you see the neighbourhood only while you contribute to it. Nothing identifies you, and you can switch it off again at any time.</p><Button className="mt-4" onClick={() => setSetup(true)}>Turn it on</Button></Card>;
    if (peers < status.min_contributors) return <Card className="!bg-champagne-2 flex items-start gap-3"><Info size={18} className="shrink-0 mt-0.5" /><div className="text-sm"><b>Not enough neighbours yet — {peers} of {status.min_contributors}.</b> Pooled figures stay hidden until at least {status.min_contributors} properties contribute, otherwise you could work out a specific neighbour&apos;s business from the numbers. This fills in as DineFlow spreads in {status.district ?? "your district"}.</div></Card>;
    return <>{children}</>;
  };

  return (
    <>
      <PageHeader eyebrow={`Private network · ${status.district ?? "set your area"}`} title="Neigh" accent="bours"
        sub="Every DineFlow property near you, pooled anonymously. Nobody else can build this, because nobody else has the whole district in one system."
        actions={<Button variant="outline" onClick={() => setSetup(true)}><ShieldCheck size={16} /> Sharing & privacy</Button>} />

      {syncedAt !== undefined && syncedAt !== null && <p className="text-xs text-steel mb-4">Running on the Box · district figures last brought down {new Date(syncedAt).toLocaleString("en-IN")}. They refresh every minute the internet is up.</p>}
      {msg && <div className="feather p-3 mb-4 text-sm flex items-center gap-2 border-mint"><Check size={15} className="text-mint" /> {msg}</div>}
      {err && <p className="text-sm text-chili mb-4">{err}</p>}

      {!status.located && (
        <Card className="!bg-chili-2 flex items-start gap-3 mb-5"><MapPin size={18} className="shrink-0 mt-0.5" /><div className="text-sm flex-1"><b>Set your district first.</b> Neighbours are matched by distance, so the network needs to know roughly where you are. Nothing more precise than a district is required.</div><Button size="sm" onClick={() => setSetup(true)}>Set it</Button></Card>
      )}
      {!joined && status.located && (
        <Card className="!bg-champagne-2 flex items-start gap-3 mb-5"><Users size={18} className="shrink-0 mt-0.5" /><div className="text-sm flex-1"><b>You haven&apos;t joined yet.</b> Choose which streams to share — each one is separate, and you can take price data without offering labour, or any other combination.</div><Button size="sm" onClick={() => setSetup(true)}>Choose</Button></Card>
      )}

      <div className="flex flex-wrap gap-2 mb-5">
        {TABS.map(({ k, label, Icon }) => <button key={k} onClick={() => setT(k)} className={cn("chip gap-1.5", t === k && "on")}><Icon size={14} /> {label}</button>)}
      </div>

      {/* ── 1. price index ── */}
      {t === "prices" && (
        <Stream on={!!s.share_prices} label="Price pooling" peers={status.peers_prices}>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <StatTile label="Paying over the odds" value={String(overpaying.length)} sub={`of ${prices.length} items compared`} tone={overpaying.length ? "alert" : "good"} />
            <StatTile label="Extra per week" value={formatINR(excess)} sub="if you matched the median" tone={excess > 0 ? "alert" : "good"} delay={0.05} />
            <StatTile label="Contributing nearby" value={String(status.peers_prices)} sub={`within ${s.radius_km ?? 40} km`} delay={0.1} />
            <StatTile label="Yearly, at this rate" value={formatINR(excess * 52)} sub="the case for switching supplier" delay={0.15} />
          </div>
          {prices.length === 0 ? <Empty title="Nothing to compare yet" hint="Record a few purchases with prices in Pantry, and the comparison appears here within a day." action={<Link href="/inventory"><Button>Open Pantry</Button></Link>} /> : (
            <Card>
              <p className="text-xs text-steel mb-4">Only what you <b>pay suppliers</b> is pooled. What you charge guests is never shared with anyone. Each row needs at least {status.min_contributors} properties before it appears.</p>
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
              {excess > 0 && <p className="text-sm mt-4 p-3 rounded-xl bg-chili-2 text-ink">Matching the area median on the red rows would save about <b className="num">{formatINR(excess)}</b> a week. Show a supplier this table before your next negotiation.</p>}
            </Card>
          )}
        </Stream>
      )}

      {/* ── 2. surplus ── */}
      {t === "surplus" && (
        <Stream on={!!s.share_surplus} label="The surplus board" peers={0}>
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-steel max-w-xl">Stock that will spoil before you use it is worth more to a kitchen 6 km away than to your bin. Sellers stay anonymous until someone claims; then both sides get a phone number.</p>
            <Button onClick={() => setPostSheet(true)}><Plus size={16} /> List surplus</Button>
          </div>
          {surplus.length === 0 ? <Empty title="Board is empty" hint="List something that is about to expire, or check back before service." /> : (
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
            <p className="text-sm text-steel max-w-xl">Your workers already carry a badge and an attendance record here. Anyone free today can be offered to a neighbour who is short-handed — and you can find one the same way on a busy Saturday.</p>
            <Button onClick={() => setOfferSheet(true)}><Plus size={16} /> Offer someone</Button>
          </div>
          {standby.length === 0 ? <Empty title="Nobody on standby today" hint="Offer a worker who has no shift, or check here when you are short." /> : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {standby.map((w, i) => (
                <motion.div key={w.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                  <Card lift className={cn("h-full", w.mine && "border-champagne")}>
                    <div className="flex items-start gap-3">
                      <span className="h-11 w-11 rounded-2xl bg-ink text-champagne grid place-items-center font-display text-lg shrink-0">{w.name.slice(0, 1)}</span>
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
          <p className="text-xs text-steel mt-4">You are agreeing a day&apos;s work between two businesses. Wages, and anything else the law requires, remain between the worker and whoever they work for that day — DineFlow only makes the introduction.</p>
        </Stream>
      )}

      {/* ── 4. area signal ── */}
      {t === "signal" && (
        <Stream on={!!s.share_demand} label="The area signal" peers={status.peers_demand}>
          {!demand?.available ? (
            <Card className="!bg-champagne-2 flex items-start gap-3"><Info size={18} className="shrink-0 mt-0.5" /><div className="text-sm"><b>Signal not available yet.</b> {demand?.reason === "too few neighbours" ? `${demand.peers} of ${demand.need} properties nearby are sharing. ` : ""}It needs enough neighbours and a few weeks of area history before it can tell a festival from a quiet Tuesday.</div></Card>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
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
                <p className="text-sm text-steel mt-2 leading-relaxed">Your own history can only tell you what normally happens. The neighbourhood tells you what is happening <i>now</i> — a temple festival, a wedding season, a bandh, a tourist inflow — usually a day or two before it shows in your own numbers.</p>
                <p className="text-sm text-steel mt-3 leading-relaxed">The <Link href="/tomorrow" className="underline font-semibold text-ink">Tomorrow brief</Link> already uses this signal, at half weight and capped at ±20%, so a strange night next door can nudge your prep but never take it over.</p>
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
      <input type="checkbox" checked={!!v[k]} onChange={(e) => setV({ ...v, [k]: e.target.checked })} className="!w-auto mt-1" />
      <div><div className="font-semibold">{title}</div>
        <div className="text-xs text-steel mt-1"><b className="text-ink">You give:</b> {gives}</div>
        <div className="text-xs text-steel"><b className="text-ink">You get:</b> {takes}</div></div>
    </label>
  );
  return (
    <div className="space-y-4">
      <Card className="!bg-sky-2 flex items-start gap-3"><ShieldCheck size={18} className="shrink-0 mt-0.5" /><div className="text-sm">
        <b>The rules, plainly.</b> Every stream is separate and off by default. Your property is never named in pooled figures. No number appears until at least {status.min_contributors} properties contributed to it. <b>Your menu prices are never shared</b> — only what you pay suppliers. Switch anything off and your past contributions stop being used.</div></Card>
      <div className="grid gap-3">
        <Row k="prices" title="What things cost" gives="the prices you pay suppliers, anonymised" takes="the area median for every item you buy, and what you are overpaying" />
        <Row k="surplus" title="Surplus board" gives="stock you list as spare" takes="cheap stock from nearby kitchens before it is wasted" />
        <Row k="labour" title="Standby hands" gives="workers you mark free today" takes="ID-verified help when you are short-handed" />
        <Row k="demand" title="Area signal" gives="your daily cover count, as a number only" takes="a festival or a quiet spell spotted before it reaches your own figures" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="District"><input value={loc.district} onChange={(e) => setLoc({ ...loc, district: e.target.value })} placeholder="Kanyakumari" /></Field>
        <Field label="Pincode"><input className="num" value={loc.pincode} onChange={(e) => setLoc({ ...loc, pincode: e.target.value })} placeholder="629702" /></Field>
        <Field label="Radius (km)"><input type="number" className="num" value={v.radius} onChange={(e) => setV({ ...v, radius: Number(e.target.value) })} /></Field>
      </div>
      <Field label="How neighbours see you" hint="Shown only on surplus and standby listings, never on pooled figures"><input value={loc.alias} onChange={(e) => setLoc({ ...loc, alias: e.target.value })} placeholder="A resort near the beach" /></Field>
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
      <Field label="Note"><input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Opened this morning, kept chilled. Collect before 6pm." /></Field>
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
      <p className="text-xs text-steel">Only their first name and skill are visible until a neighbour books them. Ask the worker before offering them.</p>
      <Button className="w-full" disabled={pending || !f.id} onClick={() => start(async () => { const r = await offerStandby(f.id, f.date, f.from, f.to, f.note); if ("error" in r) onError(r.error!); else onDone(); })}>Offer for that day</Button>
    </div>
  );
}
