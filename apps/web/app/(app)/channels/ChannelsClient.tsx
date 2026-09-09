"use client";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Plus, Copy, RefreshCw, Globe, Bike, Calendar, Check, AlertTriangle, ExternalLink, Trash2, Info } from "lucide-react";
import { Button, Sheet, Field, Card, Pill, cn } from "@/components/ui";
import { formatINR } from "@/lib/format";
import { saveOta, deleteOta, setRates, pushChannel, sendTestOrder } from "./actions";
import { Upload, Send } from "lucide-react";
import { saveChannel, deleteChannel } from "../online-orders/actions";

type Ota = { id: string; kind: string; label: string; mode: string; room_type_id: string | null; import_url: string | null; export_token: string; api_base: string | null; hotel_ref: string | null; commission_pct: number; rate_offset_pct: number; is_live: boolean; last_import_at: string | null; last_error: string | null };
type Oc = { id: string; kind: string; label: string; outlet_ref: string | null; webhook_token: string; commission_pct: number; prep_minutes: number; auto_accept: boolean; is_live: boolean; last_sync_at: string | null; api_base?: string | null };
type Av = { room_type_id: string; stay_date: string; total: number; booked: number; free: number; rate: number; stop_sell: boolean };

export function ChannelsClient({ base, ota, orderChannels, types, log, avail, restaurant }: { base: string; ota: Ota[]; orderChannels: Oc[]; types: { id: string; name: string; base_rate: number }[]; log: { id: string; direction: string; ok: boolean; message: string | null; count: number | null; created_at: string }[]; avail: Av[]; restaurant: { property_type: string; booking_slug: string | null; name: string } }) {
  const [tab, setTab] = useState<"food" | "rooms" | "calendar">(restaurant.property_type === "restaurant" ? "food" : "rooms");
  const [editOta, setEditOta] = useState<Partial<Ota> | null>(null); const [editOc, setEditOc] = useState<Partial<Oc> | null>(null);
  const [err, setErr] = useState<string | null>(null); const [msg, setMsg] = useState<string | null>(null); const [pending, start] = useTransition();
  const copy = (t: string) => { navigator.clipboard.writeText(t); setMsg("Copied"); setTimeout(() => setMsg(null), 1500); };
  const syncNow = async (id?: string) => { setMsg("Syncing…"); const r = await fetch(`/api/ota/sync${id ? `?channel=${id}` : ""}`); const j = await r.json(); setMsg(r.ok ? "Sync finished" : j.error ?? "failed"); location.reload(); };
  const bookingUrl = `${base}/book/${restaurant.booking_slug ?? ""}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setTab("food")} className={cn("chip gap-1.5", tab === "food" && "on")}><Bike size={14} /> Food delivery</button>
        {restaurant.property_type !== "restaurant" && <><button onClick={() => setTab("rooms")} className={cn("chip gap-1.5", tab === "rooms" && "on")}><Globe size={14} /> OTA channels</button>
        <button onClick={() => setTab("calendar")} className={cn("chip gap-1.5", tab === "calendar" && "on")}><Calendar size={14} /> Rates & availability</button></>}
        {msg && <span className="ml-auto text-sm text-mint self-center">{msg}</span>}
      </div>

      {tab === "food" && (<div className="space-y-4">
        <Card className="!bg-sky-2 flex items-start gap-3"><Info size={18} className="shrink-0 mt-0.5" /><div className="text-sm">
          <b>How this works.</b> Each channel gets its own webhook address. Give that URL to whoever sends you orders and they appear on the <Link href="/online-orders" className="underline font-semibold">Online orders</Link> screen, print a KOT and deduct stock like any other order.
          Swiggy and Zomato only hand out direct API access to approved partners, so most restaurants connect through a middleware (UrbanPiper, Petpooja Connect and similar) or start with their own website. Paste the URL there and it works today; swap in direct credentials the day you get them.</div></Card>
        <div className="flex justify-end"><Button onClick={() => setEditOc({ kind: "swiggy", commission_pct: 22, prep_minutes: 20 })}><Plus size={16} /> Add channel</Button></div>
        <div className="grid gap-3 md:grid-cols-2">{orderChannels.map((c) => (
          <Card key={c.id}><div className="flex items-center gap-2"><span className="font-semibold capitalize">{c.label}</span><Pill tone={c.is_live ? "ready" : "pending"}>{c.is_live ? "live" : "draft"}</Pill>{c.auto_accept && <Pill tone="gold">auto-accept</Pill>}<span className="ml-auto num text-xs text-steel">{c.commission_pct}% commission</span></div>
            <div className="mt-3"><label>Webhook URL</label><div className="mt-1 flex gap-2"><input readOnly className="num text-xs" value={`${base}/api/webhooks/aggregator/${c.webhook_token}`} /><Button size="sm" variant="outline" onClick={() => copy(`${base}/api/webhooks/aggregator/${c.webhook_token}`)}><Copy size={14} /></Button></div></div>
            <div className="mt-2 text-xs text-steel">{c.last_sync_at ? `Last order ${new Date(c.last_sync_at).toLocaleString("en-IN")}` : "No orders received yet"}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => { const r = await sendTestOrder(c.webhook_token, base); setMsg("error" in r ? r.error! : "Test order sent — open Online orders"); })}><Send size={14} /> Send test order</Button>
              <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => { const r = await pushChannel(c.id, "menu"); setMsg("error" in r ? r.error! : r.message!); })}><Upload size={14} /> Push menu</Button>
              <Button size="sm" variant="ghost" onClick={() => setEditOc(c)}>Edit</Button><Button size="sm" variant="ghost" onClick={() => { if (confirm(`Remove ${c.label}?`)) start(() => { deleteChannel(c.id); }); }}><Trash2 size={14} /></Button></div></Card>))}
          {orderChannels.length === 0 && <p className="text-sm text-steel">No delivery channels yet.</p>}</div>
        <Card><div className="text-xs font-semibold uppercase tracking-wide text-steel mb-2">Test it right now</div>
          <p className="text-sm text-steel">Press <b>Send test order</b> on any channel above and watch it appear on the Online orders screen. From outside the app the same thing looks like this:</p>
          <pre className="mt-2 text-[11px] num bg-porcelain-2 rounded-xl p-3 overflow-x-auto">{`curl -X POST '${base}/api/webhooks/aggregator/<token>' \\
  -H 'content-type: application/json' \\
  -d '{"id":"TEST-1","customer_name":"Ravi","total":560,
       "items":[{"name":"Chicken biryani","qty":2,"price":280}]}'`}</pre></Card>
      </div>)}

      {tab === "rooms" && (<div className="space-y-4">
        <Card className="!bg-sky-2 flex items-start gap-3"><Info size={18} className="shrink-0 mt-0.5" /><div className="text-sm">
          <b>Two ways to stop double-bookings.</b> <b>iCal</b> works today with Airbnb, Booking.com, Agoda and MakeMyTrip Connect: paste their calendar link into "their feed", and paste your DineFlow link into their site. Sync runs every 15 minutes and on demand.
          <b> API</b> mode (live rates and instant confirmation) needs a certified connection with each OTA or a channel-manager partner; the fields are here so you can switch over without changing anything else.</div></Card>
        <div className="flex justify-end"><Button variant="outline" onClick={() => syncNow()}><RefreshCw size={15} /> Sync now</Button><span className="w-2" /><Button onClick={() => setEditOta({ kind: "booking_com", mode: "ical", commission_pct: 15 })}><Plus size={16} /> Add OTA</Button></div>
        <div className="grid gap-3 md:grid-cols-2">{ota.map((c) => (
          <Card key={c.id}><div className="flex items-center gap-2"><span className="font-semibold">{c.label}</span><Pill tone={c.mode === "ical" ? "sky" : "gold"}>{c.mode}</Pill><Pill tone={c.is_live ? "ready" : "pending"}>{c.is_live ? "live" : "draft"}</Pill><span className="ml-auto num text-xs text-steel">{c.commission_pct}%</span></div>
            <div className="mt-3"><label>Your DineFlow calendar (give this to them)</label><div className="mt-1 flex gap-2"><input readOnly className="num text-xs" value={`${base}/api/ical/${c.export_token}.ics`} /><Button size="sm" variant="outline" onClick={() => copy(`${base}/api/ical/${c.export_token}.ics`)}><Copy size={14} /></Button></div></div>
            <div className="mt-2 text-xs text-steel">{c.import_url ? <>Their feed: <span className="num">{c.import_url.slice(0, 42)}…</span></> : "No incoming feed set"}</div>
            <div className="mt-1 text-xs flex items-center gap-1">{c.last_error ? <span className="text-chili flex items-center gap-1"><AlertTriangle size={12} /> {c.last_error}</span> : c.last_import_at ? <span className="text-mint flex items-center gap-1"><Check size={12} /> synced {new Date(c.last_import_at).toLocaleString("en-IN")}</span> : <span className="text-steel">never synced</span>}</div>
            <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => syncNow(c.id)}><RefreshCw size={14} /> Sync</Button>
              <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => { const r = await pushChannel(c.id, "ari"); setMsg("error" in r ? r.error! : r.message!); })}><Upload size={14} /> Push rates</Button><Button size="sm" variant="ghost" onClick={() => setEditOta(c)}>Edit</Button><Button size="sm" variant="ghost" onClick={() => { if (confirm(`Remove ${c.label}?`)) start(() => { deleteOta(c.id); }); }}><Trash2 size={14} /></Button></div></Card>))}
          {ota.length === 0 && <p className="text-sm text-steel">No OTA channels yet.</p>}</div>
        <Card><div className="flex items-center gap-2"><Globe size={16} /><b>Your own booking page</b><Pill tone="ready">0% commission</Pill></div>
          <div className="mt-2 flex gap-2"><input readOnly className="num text-xs" value={bookingUrl} /><Button size="sm" variant="outline" onClick={() => copy(bookingUrl)}><Copy size={14} /></Button><a href={bookingUrl} target="_blank" rel="noreferrer"><Button size="sm"><ExternalLink size={14} /> Open</Button></a></div>
          <p className="text-xs text-steel mt-2">Put this link in your Google Business profile, Instagram bio and WhatsApp. Bookings land straight in Front desk with no commission.</p></Card>
        <Card><div className="text-xs font-semibold uppercase tracking-wide text-steel mb-2">Sync log</div><ul className="text-sm space-y-1">{log.map((l) => <li key={l.id} className="flex gap-2"><span className="num text-xs text-steel w-28">{new Date(l.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span><Pill tone={l.ok ? "ready" : "alert"}>{l.direction}</Pill><span className="flex-1">{l.message}</span></li>)}{log.length === 0 && <li className="text-steel">Nothing yet.</li>}</ul></Card>
      </div>)}

      {tab === "calendar" && <RateCalendar avail={avail} types={types} onSave={(a) => start(async () => { const r = await setRates(a.rt, a.from, a.to, a.rate, a.open, a.stop, a.min); if ("error" in r) setErr(r.error!); else setMsg("Calendar updated"); })} pending={pending} />}
      {err && <p className="text-sm text-chili">{err}</p>}

      <Sheet open={!!editOc} onClose={() => setEditOc(null)} title={editOc?.id ? editOc.label ?? "" : "Add delivery channel"}>
        <form className="space-y-4" action={(fd) => start(async () => { const r = await saveChannel(fd); if ("error" in r) setErr(r.error!); else setEditOc(null); })}>
          {editOc?.id && <input type="hidden" name="id" value={editOc.id} />}
          <div className="grid grid-cols-2 gap-3"><Field label="Platform"><select name="kind" defaultValue={editOc?.kind ?? "swiggy"}><option value="swiggy">Swiggy</option><option value="zomato">Zomato</option><option value="ondc">ONDC</option><option value="website">My website</option><option value="other">Other</option></select></Field>
            <Field label="Label"><input name="label" defaultValue={editOc?.label} required placeholder="Swiggy — Main outlet" /></Field>
            <Field label="Outlet id at the platform"><input name="outlet_ref" className="num" defaultValue={editOc?.outlet_ref ?? ""} /></Field>
            <Field label="Commission %"><input name="commission_pct" type="number" step="0.1" className="num" defaultValue={editOc?.commission_pct ?? 22} /></Field>
            <Field label="Prep time (min)"><input name="prep_minutes" type="number" className="num" defaultValue={editOc?.prep_minutes ?? 20} /></Field></div>
          <Field label="Partner API base (optional)" hint="Fill once you have direct or middleware credentials"><input name="api_base" defaultValue={editOc?.api_base ?? ""} placeholder="https://api.urbanpiper.com" /></Field>
          <Field label="API key (optional)"><input name="api_key" type="password" placeholder="••••••" /></Field>
          <div className="flex gap-4 text-sm"><label className="flex items-center gap-2 normal-case"><input type="checkbox" name="auto_accept" defaultChecked={editOc?.auto_accept} className="!w-auto" /> Auto-accept matched orders</label><label className="flex items-center gap-2 normal-case"><input type="checkbox" name="is_live" defaultChecked={editOc?.is_live} className="!w-auto" /> Live</label></div>
          <Button className="w-full" disabled={pending}>Save channel</Button></form>
      </Sheet>
      <Sheet open={!!editOta} onClose={() => setEditOta(null)} title={editOta?.id ? editOta.label ?? "" : "Add OTA channel"}>
        <form className="space-y-4" action={(fd) => start(async () => { const r = await saveOta(fd); if ("error" in r) setErr(r.error!); else setEditOta(null); })}>
          {editOta?.id && <input type="hidden" name="id" value={editOta.id} />}
          <div className="grid grid-cols-2 gap-3"><Field label="OTA"><select name="kind" defaultValue={editOta?.kind ?? "booking_com"}><option value="booking_com">Booking.com</option><option value="makemytrip">MakeMyTrip / Goibibo</option><option value="airbnb">Airbnb</option><option value="agoda">Agoda</option><option value="expedia">Expedia</option><option value="ical">Any iCal calendar</option><option value="other">Other</option></select></Field>
            <Field label="Label"><input name="label" defaultValue={editOta?.label} required placeholder="Booking.com — Deluxe" /></Field>
            <Field label="Mode"><select name="mode" defaultValue={editOta?.mode ?? "ical"}><option value="ical">iCal (works today)</option><option value="api">API (needs credentials)</option></select></Field>
            <Field label="Room type"><select name="room_type_id" defaultValue={editOta?.room_type_id ?? ""}><option value="">All types</option>{types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
            <Field label="Commission %"><input name="commission_pct" type="number" step="0.1" className="num" defaultValue={editOta?.commission_pct ?? 15} /></Field>
            <Field label="Rate offset %" hint="Sell higher on OTAs to protect direct rates"><input name="rate_offset_pct" type="number" step="0.1" className="num" defaultValue={editOta?.rate_offset_pct ?? 0} /></Field></div>
          <Field label="Their calendar link (iCal import)"><input name="import_url" className="num text-xs" defaultValue={editOta?.import_url ?? ""} placeholder="https://ical.booking.com/v1/export?t=..." /></Field>
          <Field label="API base (API mode)"><input name="api_base" defaultValue={editOta?.api_base ?? ""} /></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Property id at the OTA"><input name="hotel_ref" className="num" defaultValue={editOta?.hotel_ref ?? ""} /></Field><Field label="API key"><input name="api_key" type="password" placeholder="••••••" /></Field></div>
          <label className="flex items-center gap-2 text-sm normal-case"><input type="checkbox" name="is_live" defaultChecked={editOta?.is_live} className="!w-auto" /> Live</label>
          <Button className="w-full" disabled={pending}>Save channel</Button></form>
      </Sheet>
    </div>
  );
}

function RateCalendar({ avail, types, onSave, pending }: { avail: Av[]; types: { id: string; name: string; base_rate: number }[]; onSave: (a: { rt: string; from: string; to: string; rate: number | null; open: number | null; stop: boolean; min: number | null }) => void; pending: boolean }) {
  const [sel, setSel] = useState(types[0]?.id ?? "");
  const [bulk, setBulk] = useState({ from: new Date().toISOString().slice(0, 10), to: new Date(Date.now() + 6 * 86400000).toISOString().slice(0, 10), rate: "", open: "", stop: false, min: "" });
  const days = useMemo(() => avail.filter((a) => a.room_type_id === sel), [avail, sel]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">{types.map((t) => <button key={t.id} onClick={() => setSel(t.id)} className={cn("chip", sel === t.id && "on")}>{t.name}</button>)}</div>
      <div className="feather p-4 overflow-x-auto"><div className="flex gap-2 min-w-max">{days.map((d) => (
        <motion.div key={d.stay_date} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={cn("w-24 rounded-xl border p-2 text-center", d.stop_sell ? "bg-chili-2 border-chili/40" : d.free === 0 ? "bg-porcelain-2 border-line" : "bg-card border-line")}>
          <div className="text-[10px] uppercase tracking-wide text-steel">{new Date(d.stay_date).toLocaleDateString("en-IN", { weekday: "short" })}</div>
          <div className="num font-semibold">{new Date(d.stay_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</div>
          <div className={cn("num text-lg mt-1", d.free === 0 && "text-chili")}>{d.free}<span className="text-xs text-steel">/{d.total}</span></div>
          <div className="num text-xs text-steel">{formatINR(Number(d.rate))}</div>
          {d.stop_sell && <div className="text-[10px] font-bold text-chili mt-0.5">STOP SELL</div>}
        </motion.div>))}
        {days.length === 0 && <p className="text-sm text-steel">Add room types and rooms first.</p>}</div></div>
      <Card><div className="text-xs font-semibold uppercase tracking-wide text-steel mb-3">Bulk update — these rates go out to every connected channel</div>
        <div className="grid sm:grid-cols-6 gap-3 items-end">
          <Field label="From"><input type="date" className="num" value={bulk.from} onChange={(e) => setBulk({ ...bulk, from: e.target.value })} /></Field>
          <Field label="To"><input type="date" className="num" value={bulk.to} onChange={(e) => setBulk({ ...bulk, to: e.target.value })} /></Field>
          <Field label="Rate ₹"><input type="number" className="num" value={bulk.rate} onChange={(e) => setBulk({ ...bulk, rate: e.target.value })} placeholder="keep" /></Field>
          <Field label="Rooms open"><input type="number" className="num" value={bulk.open} onChange={(e) => setBulk({ ...bulk, open: e.target.value })} placeholder="all" /></Field>
          <Field label="Min nights"><input type="number" className="num" value={bulk.min} onChange={(e) => setBulk({ ...bulk, min: e.target.value })} placeholder="1" /></Field>
          <div className="flex gap-2"><label className="flex items-center gap-1.5 text-sm normal-case"><input type="checkbox" checked={bulk.stop} onChange={(e) => setBulk({ ...bulk, stop: e.target.checked })} className="!w-auto" /> Stop sell</label></div>
        </div>
        <Button className="mt-3" disabled={pending || !sel} onClick={() => onSave({ rt: sel, from: bulk.from, to: bulk.to, rate: bulk.rate ? Number(bulk.rate) : null, open: bulk.open ? Number(bulk.open) : null, stop: bulk.stop, min: bulk.min ? Number(bulk.min) : null })}>Apply to these dates</Button></Card>
    </div>
  );
}
