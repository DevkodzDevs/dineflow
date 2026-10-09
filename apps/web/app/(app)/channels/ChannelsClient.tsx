"use client";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Plus, Copy, RefreshCw, Globe, Bike, Calendar, Check, AlertTriangle, ExternalLink, Trash2, Info } from "lucide-react";
import { Button, Sheet, Field, Card, Pill, cn } from "@/components/ui";
import { formatINR } from "@/lib/format";
import { saveOta, deleteOta, setRates, setRatesOnly, pushChannel, sendTestOrder } from "./actions";
import { suggestRate } from "@/lib/rates";
import { todayIST } from "@/lib/format";
import { TrendingUp, TrendingDown, Wand2 } from "lucide-react";
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
      {/* Phone, hotel or resort: the three views as one segmented card, icon over a short label,
          equal thirds — not chips that wrap two over one. A restaurant has one view and keeps the chip. */}
      {restaurant.property_type !== "restaurant" && (
        <div className="sm:hidden">
          <div role="tablist" aria-label="Channels" className="grid grid-cols-3 gap-1 p-1 rounded-[18px] bg-[var(--color-fill)]">
            {([["food", Bike, "Delivery"], ["rooms", Globe, "OTAs"], ["calendar", Calendar, "Rates"]] as const).map(([k, Icon, label]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                className={cn("!min-h-[58px] rounded-[14px] flex flex-col items-center justify-center gap-1 text-[12.5px] font-semibold transition-colors",
                  tab === k ? "bg-[var(--color-label)] text-[var(--color-on-label)] shadow-sm" : "text-[var(--color-label-2)]")}>
                <Icon size={18} />{label}
              </button>
            ))}
          </div>
          {msg && <div className="mt-2 text-sm text-mint text-center">{msg}</div>}
        </div>
      )}
      <div className={cn("flex flex-wrap gap-2", restaurant.property_type !== "restaurant" && "hidden sm:flex")}>
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
        <div className="grid gap-3 md:grid-cols-2 [&>*]:min-w-0">{orderChannels.map((c) => (
          <Card key={c.id}><div className="flex items-center gap-2"><span className="font-semibold capitalize">{c.label}</span><Pill tone={c.is_live ? "ready" : "pending"}>{c.is_live ? "live" : "draft"}</Pill>{c.auto_accept && <Pill tone="gold">auto-accept</Pill>}<span className="ml-auto num text-xs text-steel">{c.commission_pct}% commission</span></div>
            <div className="mt-3"><label>Webhook URL</label><div className="mt-1 flex gap-2 min-w-0"><input readOnly className="num text-xs min-w-0" value={`${base}/api/webhooks/aggregator/${c.webhook_token}`} /><Button size="sm" variant="outline" onClick={() => copy(`${base}/api/webhooks/aggregator/${c.webhook_token}`)}><Copy size={14} /></Button></div></div>
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
        <div className="grid gap-3 md:grid-cols-2 [&>*]:min-w-0">{ota.map((c) => (
          <Card key={c.id}><div className="flex items-center gap-2"><span className="font-semibold">{c.label}</span><Pill tone={c.mode === "ical" ? "sky" : "gold"}>{c.mode}</Pill><Pill tone={c.is_live ? "ready" : "pending"}>{c.is_live ? "live" : "draft"}</Pill><span className="ml-auto num text-xs text-steel">{c.commission_pct}%</span></div>
            <div className="mt-3"><label>Your DineFlow calendar (give this to them)</label><div className="mt-1 flex gap-2 min-w-0"><input readOnly className="num text-xs min-w-0" value={`${base}/api/ical/${c.export_token}.ics`} /><Button size="sm" variant="outline" onClick={() => copy(`${base}/api/ical/${c.export_token}.ics`)}><Copy size={14} /></Button></div></div>
            <div className="mt-2 text-xs text-steel">{c.import_url ? <>Their feed: <span className="num">{c.import_url.slice(0, 42)}…</span></> : "No incoming feed set"}</div>
            <div className="mt-1 text-xs flex items-center gap-1">{c.last_error ? <span className="text-chili flex items-center gap-1"><AlertTriangle size={12} /> {c.last_error}</span> : c.last_import_at ? <span className="text-mint flex items-center gap-1"><Check size={12} /> synced {new Date(c.last_import_at).toLocaleString("en-IN")}</span> : <span className="text-steel">never synced</span>}</div>
            <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => syncNow(c.id)}><RefreshCw size={14} /> Sync</Button>
              <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => { const r = await pushChannel(c.id, "ari"); setMsg("error" in r ? r.error! : r.message!); })}><Upload size={14} /> Push rates</Button><Button size="sm" variant="ghost" onClick={() => setEditOta(c)}>Edit</Button><Button size="sm" variant="ghost" onClick={() => { if (confirm(`Remove ${c.label}?`)) start(() => { deleteOta(c.id); }); }}><Trash2 size={14} /></Button></div></Card>))}
          {ota.length === 0 && <p className="text-sm text-steel">No OTA channels yet.</p>}</div>
        <Card><div className="flex items-center gap-2"><Globe size={16} /><b>Your own booking page</b><Pill tone="ready">0% commission</Pill></div>
          <div className="mt-2 flex gap-2 min-w-0"><input readOnly className="num text-xs min-w-0" value={bookingUrl} /><Button size="sm" variant="outline" onClick={() => copy(bookingUrl)}><Copy size={14} /></Button><a href={bookingUrl} target="_blank" rel="noreferrer"><Button size="sm"><ExternalLink size={14} /> Open</Button></a></div>
          <p className="text-xs text-steel mt-2">Put this link in your Google Business profile, Instagram bio and WhatsApp. Bookings land straight in Front desk with no commission.</p></Card>
        <Card><div className="text-xs font-semibold uppercase tracking-wide text-steel mb-2">Sync log</div><ul className="text-sm space-y-1">{log.map((l) => <li key={l.id} className="flex gap-2"><span className="num text-xs text-steel w-28">{new Date(l.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span><Pill tone={l.ok ? "ready" : "alert"}>{l.direction}</Pill><span className="flex-1">{l.message}</span></li>)}{log.length === 0 && <li className="text-steel">Nothing yet.</li>}</ul></Card>
      </div>)}

      {tab === "calendar" && <RateCalendar avail={avail} types={types} onSave={(a) => start(async () => { const r = await setRates(a.rt, a.from, a.to, a.rate, a.open, a.stop, a.min); if ("error" in r) setErr(r.error!); else setMsg("Calendar updated"); })}
        onApply={(rt, nights) => start(async () => { const r = await setRatesOnly(rt, nights); if ("error" in r) setErr(r.error!); else setMsg(`${r.n} night${r.n === 1 ? "" : "s"} repriced — push rates to send them to your channels`); })} pending={pending} />}
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
          <Field label="Their calendar link (iCal import)"><input name="import_url" className="num text-xs min-w-0" defaultValue={editOta?.import_url ?? ""} placeholder="https://ical.booking.com/v1/export?t=..." /></Field>
          <Field label="API base (API mode)"><input name="api_base" defaultValue={editOta?.api_base ?? ""} /></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Property id at the OTA"><input name="hotel_ref" className="num" defaultValue={editOta?.hotel_ref ?? ""} /></Field><Field label="API key"><input name="api_key" type="password" placeholder="••••••" /></Field></div>
          <label className="flex items-center gap-2 text-sm normal-case"><input type="checkbox" name="is_live" defaultChecked={editOta?.is_live} className="!w-auto" /> Live</label>
          <Button className="w-full" disabled={pending}>Save channel</Button></form>
      </Sheet>
    </div>
  );
}

function RateCalendar({ avail, types, onSave, onApply, pending }: { avail: Av[]; types: { id: string; name: string; base_rate: number }[]; onSave: (a: { rt: string; from: string; to: string; rate: number | null; open: number | null; stop: boolean; min: number | null }) => void; onApply: (rt: string, nights: { date: string; rate: number }[]) => void; pending: boolean }) {
  const [sel, setSel] = useState(types[0]?.id ?? "");
  const [bulk, setBulk] = useState({ from: new Date().toISOString().slice(0, 10), to: new Date(Date.now() + 6 * 86400000).toISOString().slice(0, 10), rate: "", open: "", stop: false, min: "" });
  const days = useMemo(() => avail.filter((a) => a.room_type_id === sel), [avail, sel]);
  /* What the rate should be, from what is already booked (lib/rates.ts): next 14 nights only. */
  const base = Number(types.find((t) => t.id === sel)?.base_rate ?? 0);
  const hints = useMemo(() => { const today = todayIST(); return Object.fromEntries(days.map((d) => [d.stay_date, suggestRate({ ...d, rate: Number(d.rate) }, base, today)])); }, [days, base]);
  const moves = days.filter((d) => hints[d.stay_date]);
  const ups = moves.filter((d) => hints[d.stay_date]!.rate > Number(d.rate)).length;
  /* The day grid: 14 nights unless asked for all; tap one night, then another, to set the bulk dates. */
  const [all, setAll] = useState(false);
  const today = todayIST();
  const shown = all ? days : days.slice(0, 14);
  const ist = (d: string) => new Date(`${d}T12:00:00+05:30`);
  const pick = (d: string) => setBulk((b) => (b.from === b.to && d > b.from ? { ...b, to: d } : { ...b, from: d, to: d }));
  /* Monday-first weeks: blank cells before the first night line every date up under its weekday. */
  const lead = shown.length ? (ist(shown[0].stay_date).getUTCDay() + 6) % 7 : 0;
  const k = (n: number) => (n >= 1000 ? `${+(n / 1000).toFixed(n % 100 ? 2 : 1)}k` : `${n}`);
  const md = (d: string, o: Intl.DateTimeFormatOptions) => ist(d).toLocaleDateString("en-IN", { ...o, timeZone: "Asia/Kolkata" });
  const span = shown.length ? `${md(shown[0].stay_date, { day: "numeric", month: "short" })} – ${md(shown[shown.length - 1].stay_date, { day: "numeric", month: "short" })}` : "";
  return (
    <div className="space-y-4">
      <div className="hidden sm:flex flex-wrap gap-2">{types.map((t) => <button key={t.id} onClick={() => setSel(t.id)} className={cn("chip", sel === t.id && "on")}>{t.name}</button>)}</div>
      {/* Phone: the room types on one swipeable rail under a small label, never wrapping to a second row. */}
      {types.length > 0 && (
        <div className="sm:hidden">
          <div className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-steel mb-2">Room type</div>
          <div className="chip-rail -mr-4 pr-4">{types.map((t) => <button key={t.id} type="button" onClick={() => setSel(t.id)} aria-pressed={sel === t.id} className={cn("chip", sel === t.id && "on")}>{t.name}</button>)}</div>
        </div>
      )}
      {days.length > 0 && (
        <div className="feather p-4 flex flex-wrap items-center gap-3">
          <span className="h-10 w-10 rounded-xl grid place-items-center shrink-0 bg-[var(--color-fill)] text-[var(--color-tint)]"><Wand2 size={18} /></span>
          <div className="flex-1 min-w-[12rem]">
            <div className="text-[15px] font-semibold">{moves.length ? `Suggested rates for ${moves.length} night${moves.length === 1 ? "" : "s"}` : "Rates look right for the next 14 nights"}</div>
            <div className="text-xs text-steel">{moves.length ? `${ups} up, ${moves.length - ups} down — from how full each night already is.` : "Suggestions appear when a night fills up or sits empty close in."}</div>
          </div>
          {moves.length > 0 && <Button disabled={pending} onClick={() => onApply(sel, moves.map((d) => ({ date: d.stay_date, rate: hints[d.stay_date]!.rate })))}>Use suggested rates</Button>}
        </div>
      )}
      {/* A month-style calendar: seven columns, Monday first, one compact tile per night — the date,
          the rate, the suggestion and a thin occupancy line along the bottom. A phone shortens rupees
          to 4.5k so seven columns still fit; tap a night, then a later one, to set the bulk dates. */}
      <div className="feather p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-3 px-1">
          <div className="min-w-0"><span className="text-[15px] font-semibold">{span}</span><span className="text-xs text-steel ml-2">{shown.length} nights · tap two to pick dates</span></div>
          <div className="ml-auto flex items-center gap-3 text-[11px] text-steel">
            <span className="inline-flex items-center gap-1 text-[var(--color-green)] font-semibold"><TrendingUp size={12} /> raise</span>
            <span className="inline-flex items-center gap-1 text-[var(--color-orange)] font-semibold"><TrendingDown size={12} /> lower</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-[3px] w-4 rounded-full bg-[var(--color-tint)]" /> booked</span>
          </div>
        </div>
        {days.length === 0 ? <p className="text-sm text-steel px-1">Add room types and rooms first.</p> : (
          <>
          <div className="hidden sm:grid grid-cols-[repeat(7,minmax(0,1fr))] gap-1.5">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((w) => (
              <div key={w} className={cn("text-center text-[10px] sm:text-[10.5px] font-bold uppercase tracking-[0.1em] pb-1", w === "Fri" || w === "Sat" ? "text-[var(--color-label)]" : "text-steel")}>{w}</div>
            ))}
            {Array.from({ length: lead }, (_, n) => <div key={`l${n}`} aria-hidden />)}
            {shown.map((d, n) => {
              const r = Number(d.rate); const booked = Math.max(0, d.total - d.free); const full = d.free === 0;
              const inRange = d.stay_date >= bulk.from && d.stay_date <= bulk.to; const h = hints[d.stay_date];
              const isToday = d.stay_date === today; const day = md(d.stay_date, { day: "numeric" });
              const up = h ? h.rate > r : false;
              return (
                <button key={d.stay_date} type="button" onClick={() => pick(d.stay_date)} aria-pressed={inRange}
                  aria-label={`${md(d.stay_date, { weekday: "short", day: "numeric", month: "short" })}, ${formatINR(r, { whole: true })}, ${full ? "full" : `${booked} of ${d.total} booked`}${d.stop_sell ? ", stop sell" : ""}`}
                  className={cn("relative min-w-0 overflow-hidden text-left rounded-[14px] flex flex-col justify-start items-stretch border !min-h-0 h-[66px] sm:h-[78px] px-1.5 sm:px-2.5 pt-1.5 sm:pt-2 transition-colors",
                    inRange ? "border-[var(--color-tint)] bg-[color-mix(in_srgb,var(--color-tint)_13%,transparent)]"
                      : d.stop_sell ? "border-[color-mix(in_srgb,var(--color-red)_45%,transparent)] bg-[var(--color-red-2)]"
                        : "border-[var(--color-separator)] bg-[var(--color-fill)] hover:border-[color-mix(in_srgb,var(--color-tint)_50%,transparent)]")}>
                  <div className="flex items-center gap-1">
                    <span className={cn("num font-semibold text-[14px] sm:text-[17px] leading-none", isToday && "h-[20px] sm:h-[22px] min-w-[20px] sm:min-w-[22px] px-1 -ml-0.5 rounded-full grid place-items-center bg-[var(--color-tint)] text-[var(--color-on-tint)] text-[12px] sm:text-[13px]")}>{day}</span>
                    {(day === "1" || n === 0) && <span className="hidden sm:inline text-[10.5px] text-steel">{md(d.stay_date, { month: "short" })}</span>}
                    <span className={cn("hidden sm:inline ml-auto num text-[10.5px]", full ? "text-[var(--color-red)] font-bold" : "text-steel")}>{d.stop_sell ? "Stop" : full ? "Full" : `${booked}/${d.total}`}</span>
                  </div>
                  <div className="num text-[11px] sm:text-[14px] font-semibold leading-none mt-1.5 sm:mt-2 truncate">
                    <span className="sm:hidden">{k(r)}</span><span className="hidden sm:inline">{formatINR(r, { whole: true })}</span>
                  </div>
                  {d.stop_sell ? <div className="text-[10px] sm:hidden font-bold text-[var(--color-red)] mt-1">Stop</div>
                    : h ? <div title={`Suggested: ${h.why}`} className={cn("num inline-flex items-center gap-0.5 text-[10px] sm:text-[11.5px] font-semibold leading-none mt-1 sm:mt-1.5 max-w-full", up ? "text-[var(--color-green)]" : "text-[var(--color-orange)]")}>
                        {up ? <TrendingUp size={10} className="shrink-0" /> : <TrendingDown size={10} className="shrink-0" />}
                        <span className="sm:hidden">{k(h.rate)}</span><span className="hidden sm:inline">{formatINR(h.rate, { whole: true })}</span></div>
                    : null}
                  <span className="absolute inset-x-0 bottom-0 h-[3px] bg-[var(--color-fill-2)]"><span className={cn("block h-full", full ? "bg-[var(--color-red)]" : "bg-[var(--color-tint)]")} style={{ width: `${d.total ? (booked / d.total) * 100 : 0}%` }} /></span>
                </button>
              );
            })}
          </div>
          {/* Phone: one row per night in an inset list. A date tile, the rate over a thin booked bar,
              and the suggestion as a chip on the right; tap two rows to set the bulk dates. The chip
              carries data-suggested, not title, so the desktop calendar alone answers [title^=Suggested]. */}
          <div className="sm:hidden -mx-1 rounded-2xl border border-[var(--color-separator)] overflow-hidden divide-y divide-[var(--color-separator)]">
            {shown.map((d, n) => {
              const r = Number(d.rate); const booked = Math.max(0, d.total - d.free); const full = d.free === 0;
              const inRange = d.stay_date >= bulk.from && d.stay_date <= bulk.to; const h = hints[d.stay_date];
              const isToday = d.stay_date === today; const wd = md(d.stay_date, { weekday: "short" });
              const wknd = wd === "Fri" || wd === "Sat"; const up = h ? h.rate > r : false;
              const newMonth = n > 0 && md(d.stay_date, { day: "numeric" }) === "1";
              return (
                <div key={d.stay_date}>
                  {newMonth && <div className="px-3.5 py-1.5 text-[10.5px] font-bold uppercase tracking-[0.12em] text-steel bg-[var(--color-fill)]">{md(d.stay_date, { month: "long" })}</div>}
                  <button type="button" onClick={() => pick(d.stay_date)} aria-pressed={inRange}
                    aria-label={`${md(d.stay_date, { weekday: "short", day: "numeric", month: "short" })}, ${formatINR(r, { whole: true })}, ${full ? "full" : `${booked} of ${d.total} booked`}${d.stop_sell ? ", stop sell" : ""}`}
                    className={cn("relative w-full !rounded-none flex items-center justify-start gap-3 px-3.5 py-2.5 !min-h-[64px] text-left transition-colors",
                      inRange ? "bg-[color-mix(in_srgb,var(--color-tint)_12%,transparent)]" : d.stop_sell ? "bg-[var(--color-red-2)]" : "")}>
                    {inRange && <span className="absolute left-0 inset-y-2 w-[3px] rounded-r-full bg-[var(--color-tint)]" aria-hidden />}
                    <span className={cn("h-11 w-11 shrink-0 rounded-[14px] grid place-items-center content-center leading-none",
                      isToday ? "bg-[var(--color-tint)] text-[var(--color-on-tint)]" : inRange ? "bg-[color-mix(in_srgb,var(--color-tint)_20%,transparent)]" : "bg-[var(--color-fill)]")}>
                      <span className={cn("text-[9.5px] font-bold uppercase tracking-[0.1em]", isToday ? "" : wknd ? "text-[var(--color-label)]" : "text-steel")}>{isToday ? "Today" : wd}</span>
                      <span className="num font-semibold text-[17px] mt-0.5">{md(d.stay_date, { day: "numeric" })}</span>
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="flex items-baseline gap-1.5"><span className="num text-[16px] font-semibold leading-none">{formatINR(r, { whole: true })}</span>{n === 0 && <span className="text-[11px] text-steel">{md(d.stay_date, { month: "short" })}</span>}</span>
                      <span className="flex items-center gap-2 mt-1.5">
                        <span className="h-1 w-14 shrink-0 rounded-full bg-[var(--color-fill-2)] overflow-hidden"><span className={cn("block h-full rounded-full", full ? "bg-[var(--color-red)]" : "bg-[var(--color-tint)]")} style={{ width: `${d.total ? (booked / d.total) * 100 : 0}%` }} /></span>
                        <span className={cn("num text-[11px] truncate", full ? "text-[var(--color-red)] font-semibold" : "text-steel")}>{full ? "Full" : `${booked}/${d.total} booked`}</span>
                      </span>
                    </span>
                    {d.stop_sell ? <span className="shrink-0 text-[10.5px] font-bold uppercase tracking-wide px-2.5 h-7 grid place-items-center rounded-full bg-[var(--color-red)] text-white">Stop sell</span>
                      : h ? <span data-suggested={h.why} className={cn("shrink-0 inline-flex items-center gap-1 num text-[12.5px] font-semibold h-8 px-2.5 rounded-full", up ? "bg-[var(--color-green-2)] text-[var(--color-green)]" : "bg-[color-mix(in_srgb,var(--color-orange)_15%,transparent)] text-[var(--color-orange)]")}>
                          {up ? <TrendingUp size={13} /> : <TrendingDown size={13} />}{formatINR(h.rate, { whole: true })}</span>
                      : <span className="shrink-0 inline-flex items-center gap-1 text-[11.5px] text-steel"><Check size={13} className="text-[var(--color-green)]" /> on target</span>}
                  </button>
                </div>
              );
            })}
          </div>
          </>
        )}
        {days.length > 14 && <div className="mt-3 flex justify-center"><Button variant="outline" size="sm" onClick={() => setAll(!all)}>{all ? "Show the next 14 nights" : `Show all ${days.length} nights`}</Button></div>}
      </div>
      <Card><div className="text-xs font-semibold uppercase tracking-wide text-steel mb-3">Bulk update — these rates go out to every connected channel</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
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
