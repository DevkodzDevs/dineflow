"use client";
import { useState, useTransition } from "react";
import { Plus, Trash2, Sparkles } from "lucide-react";
import { Button, Card, Field } from "@/components/ui";
import { ThemePicker } from "@/components/ui/Theme";
import { saveRestaurant, saveTable, deleteTable, loadDemoData, removeDemoData, issueBoxToken } from "./actions";
import { Server } from "lucide-react";

type Rest = { id: string; name: string; logo_url?: string | null; brand_colour?: string | null; gstin: string | null; address: string | null; phone: string | null; gst_rate: number; service_charge_pct: number; plan: string; property_type: string; room_gst_rate: number; check_in_time: string; check_out_time: string; membership: string; membership_plan: string | null; membership_ends_at: string | null; trial_ends_at: string; prep_buffer_pct: number; brief_whatsapp: string | null; runs_on_box?: boolean; box_last_seen?: string | null };
type Table = { id: string; name: string; capacity: number; zone: string; sort_order: number };

export function SettingsClient({ restaurant, tables }: { restaurant: Rest; tables: Table[] }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [boxToken, setBoxToken] = useState<string | null>(null); const [pending, start] = useTransition();
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <div className="card-title"><h3>Appearance</h3></div>
        <p className="text-[13px] text-[var(--color-label-2)] -mt-2 mb-4">Applies to this device. Guest pages are always bright.</p>
        <ThemePicker />
      </Card>
      <Card>
        <h3 className="text-xl mb-4">Restaurant & taxes</h3>
        <form className="space-y-4" action={(fd) => start(async () => { const r = await saveRestaurant(fd); setMsg("error" in r ? r.error! : "Saved."); })}>
          <input type="hidden" name="id" value={restaurant.id} />
          <Field label="Property type" hint="Hotel and resort unlock Front desk, Rooms, Housekeeping, Guests (and Facilities for resorts)."><select name="property_type" defaultValue={restaurant.property_type}><option value="restaurant">Restaurant</option><option value="hotel">Hotel</option><option value="resort">Resort</option></select></Field>
          <Field label="Name"><input name="name" defaultValue={restaurant.name} required /></Field>
          <Field label="Logo" hint="A square image address (PNG or SVG, at least 256 px). It replaces the mark in the sidebar and on bills. Leave blank to use your initial."><input name="logo_url" defaultValue={restaurant.logo_url ?? ""} placeholder="https://…/logo.png" /></Field>
          <Field label="Brand colour" hint="Optional. Used for the active menu item and the confirm button on your screens."><input name="brand_colour" defaultValue={restaurant.brand_colour ?? ""} placeholder="#c9302c" /></Field>
          <Field label="Address (printed on bills)"><input name="address" defaultValue={restaurant.address ?? ""} /></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Phone"><input name="phone" defaultValue={restaurant.phone ?? ""} /></Field><Field label="GSTIN"><input name="gstin" defaultValue={restaurant.gstin ?? ""} className="num uppercase" /></Field></div>
          <div className="grid grid-cols-2 gap-3"><Field label="GST rate %" hint="5% for most restaurants; split as CGST + SGST"><input name="gst_rate" type="number" step="0.01" defaultValue={restaurant.gst_rate} className="num" /></Field><Field label="Service charge %"><input name="service_charge_pct" type="number" step="0.01" defaultValue={restaurant.service_charge_pct} className="num" /></Field></div>
          {restaurant.property_type !== "restaurant" && <div className="grid grid-cols-3 gap-3"><Field label="Room GST %"><input name="room_gst_rate" type="number" step="0.01" defaultValue={restaurant.room_gst_rate} className="num" /></Field><Field label="Check-in"><input name="check_in_time" type="time" defaultValue={restaurant.check_in_time?.slice(0, 5)} className="num" /></Field><Field label="Check-out"><input name="check_out_time" type="time" defaultValue={restaurant.check_out_time?.slice(0, 5)} className="num" /></Field></div>}
          {restaurant.property_type === "restaurant" && <><input type="hidden" name="room_gst_rate" value={restaurant.room_gst_rate} /><input type="hidden" name="check_in_time" value={restaurant.check_in_time} /><input type="hidden" name="check_out_time" value={restaurant.check_out_time} /></>}
          <div className="grid grid-cols-2 gap-3"><Field label="Prep buffer %" hint="Extra portions the Tomorrow brief adds"><input name="prep_buffer_pct" type="number" className="num" defaultValue={restaurant.prep_buffer_pct ?? 10} /></Field><Field label="WhatsApp for the brief" hint="Where 'Send to the team' opens"><input name="brief_whatsapp" className="num" defaultValue={restaurant.brief_whatsapp ?? ""} placeholder="98400 11223" /></Field></div>
          {msg && <p className="text-sm">{msg}</p>}
          <Button disabled={pending}>Save</Button>
        </form>
        <div className="mt-4 pt-4 border-t border-line">
          <div className="text-xs font-semibold uppercase tracking-wide text-steel mb-2">Sample data</div>
          <p className="text-sm text-steel mb-2">Fills this property with a realistic menu, pantry with barcodes, tables, rooms and bookings, labourers, printers and demo delivery channels — everything you need to try every screen. Safe to run more than once; it never touches data you created.</p>
          <div className="flex gap-2"><Button variant="outline" disabled={pending} onClick={() => start(async () => { const r = await loadDemoData(); setMsg(r.error ? r.error : `Loaded: ${r.dishes} dishes, ${r.ingredients} pantry items, ${r.rooms ?? 0} rooms, ${r.labourers} workers`); })}><Sparkles size={15} /> Load demo data</Button>
          <Button variant="ghost" disabled={pending} onClick={() => { if (confirm("Remove the demo channels and sample online orders?")) start(async () => { await removeDemoData(); setMsg("Demo channels removed"); }); }}><Trash2 size={15} /> Remove demo channels</Button></div>
        </div>
        <div className="mt-4 pt-4 border-t border-line">
          <div className="text-xs font-semibold uppercase tracking-wide text-steel mb-2 flex items-center gap-1.5"><Server size={12} /> Runs on a Box (no-internet mode)</div>
          <p className="text-sm text-steel mb-2">If this property runs DineFlow on a computer in the building, issue a token and paste it into the Box launcher. The Box then works with <b>and</b> without internet: the building runs locally, and every minute the internet is up it swaps with this cloud copy — online orders and OTA bookings go down, rooms, menu, bookings and sealed months come up. {restaurant.runs_on_box ? <span className="text-mint font-semibold">Box connected{restaurant.box_last_seen ? ` · last seen ${new Date(restaurant.box_last_seen).toLocaleString("en-IN")}` : ""}.</span> : null}</p>
          <div className="flex items-center gap-2"><Button variant="outline" size="sm" disabled={pending} onClick={() => start(async () => { const r = await issueBoxToken(); if ("error" in r) setMsg(r.error!); else { setBoxToken(r.token!); navigator.clipboard.writeText(r.token!); setMsg("Box token copied. Paste it into the launcher on the Box."); } })}>Issue box token</Button>{boxToken && <span className="num text-xs break-all">{boxToken}</span>}</div>
        </div>
        <div className="mt-4 pt-4 border-t border-line flex flex-wrap gap-2"><a href="/settings/storefront" className="chip">Storefront &amp; offers</a><a href="/settings/printers" className="chip">Thermal printers</a><a href="/channels" className="chip">Online orders & OTA channels</a><a href="/settings/booking-page" className="chip">Direct booking page</a></div>
        <div className="mt-6 pt-4 border-t border-line text-xs text-steel flex items-center justify-between"><span>Membership: <b className="uppercase">{restaurant.membership}</b>{restaurant.membership_plan ? ` · ${restaurant.membership_plan}` : ""}{restaurant.membership === "trial" ? ` · ends ${restaurant.trial_ends_at.slice(0, 10)}` : restaurant.membership_ends_at ? ` · until ${restaurant.membership_ends_at.slice(0, 10)}` : ""}</span><a href="/membership" className="font-semibold underline text-ink">Manage</a></div>
      </Card>
      <Card>
        <h3 className="text-xl mb-4">Tables & zones</h3>
        <ul className="space-y-2 mb-4">
          {tables.map((t) => (
            <li key={t.id} className="flex items-center gap-2 text-sm"><span className="font-display text-lg w-12">{t.name}</span><span className="text-steel flex-1">{t.zone} · seats {t.capacity}</span><button className="text-steel hover:text-chili" disabled={pending} onClick={() => start(() => { deleteTable(t.id); })} aria-label="Delete"><Trash2 size={15} /></button></li>
          ))}
        </ul>
        <form className="grid grid-cols-[1fr_70px_1fr_auto] gap-2 items-end" action={(fd) => start(async () => { await saveTable(fd); })}>
          <input type="hidden" name="sort_order" value={tables.length + 1} />
          <Field label="Name"><input name="name" placeholder="T9" required /></Field>
          <Field label="Seats"><input name="capacity" type="number" defaultValue={4} className="num" /></Field>
          <Field label="Zone"><input name="zone" placeholder="AC hall" defaultValue="Main" /></Field>
          <Button disabled={pending} aria-label="Add table"><Plus size={16} /></Button>
        </form>
      </Card>
    </div>
  );
}
