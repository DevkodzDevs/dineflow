"use client";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Copy, Check, RefreshCw, Upload, Send, Pencil, Trash2, Link2, Calendar, Clock, AlertTriangle, Loader2, Bike, BedDouble, CreditCard, MapPin, Globe, ShieldCheck, ExternalLink, Users, Smartphone, QrCode, UtensilsCrossed, Webhook, KeyRound } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { SvcHead } from "@/components/ui/Service";
import { Button, Sheet, Field, Switch, CardStrip, cn, useToast, type StripAction, ask } from "@/components/ui";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { copyText } from "@/lib/clipboard";
import { saveChannel, deleteChannel } from "../online-orders/actions";
import { saveOta, deleteOta, pushChannel, sendTestOrder } from "../channels/actions";
import { savePayments } from "../settings/actions";
import { OnlineSwitch } from "../online-orders/OnlineSwitch";
import { GoogleLinks } from "../settings/storefront/GoogleLinks";
import { setTracking, testGateway } from "./actions";

type Ota = { id: string; kind: string; label: string; mode: string; room_type_id: string | null; import_url: string | null; export_token: string; api_base: string | null; hotel_ref: string | null; commission_pct: number; rate_offset_pct: number; is_live: boolean; last_import_at: string | null; last_error: string | null; has_api_key?: boolean };
type Oc = { id: string; kind: string; label: string; outlet_ref: string | null; webhook_token: string; commission_pct: number; prep_minutes: number; auto_accept: boolean; is_live: boolean; last_sync_at: string | null; api_base?: string | null; has_api_key?: boolean };
type Gateway = { key_id: string; hasSecret: boolean; hasWebhook: boolean; updated_at: string | null; readable: boolean };
type Who = { id: string; full_name: string; role: string; grants: string[] | null };
type Rider = { id: string; full_name: string; phone: string | null; position: string | null; position_title: string | null };
type Rest = { id: string; name: string; type: string; slug: string | null; booking_slug: string | null; listed: boolean; dining: boolean; ordering: boolean; upi_vpa: string | null; upi_payee: string | null; tracking: boolean; paused: boolean; phone: string | null };

/** the food apps and the room sites a property connects, in the order the add tiles show them — each with its colour (tokens
 *  only) and the commission it usually takes, so a new channel starts with sensible numbers */
const FOOD: { kind: string; name: string; hue: string; commission: number; prep: number; how: string }[] = [
  { kind: "swiggy", name: "Swiggy", hue: "--color-orange", commission: 22, prep: 20, how: "Paste webhook in UrbanPiper / Petpooja" },
  { kind: "zomato", name: "Zomato", hue: "--color-red", commission: 25, prep: 20, how: "Paste webhook in UrbanPiper / Petpooja" },
  { kind: "ondc", name: "ONDC", hue: "--color-violet", commission: 5, prep: 20, how: "Give webhook to your ONDC app" },
  { kind: "website", name: "Your website", hue: "--color-tint", commission: 0, prep: 20, how: "Storefront orders, no commission" },
];
const ROOMS: { kind: string; name: string; hue: string; commission: number }[] = [
  { kind: "booking_com", name: "Booking.com", hue: "--color-blue", commission: 15 }, { kind: "makemytrip", name: "MakeMyTrip / Goibibo", hue: "--color-orange", commission: 20 },
  { kind: "agoda", name: "Agoda", hue: "--color-green", commission: 18 }, { kind: "airbnb", name: "Airbnb", hue: "--color-red", commission: 3 },
  { kind: "expedia", name: "Expedia", hue: "--color-orange", commission: 18 }, { kind: "ical", name: "Any iCal calendar", hue: "--color-tint", commission: 0 },
];
const OTA_NAME: Record<string, string> = Object.fromEntries(ROOMS.map((r) => [r.kind, r.kind === "ical" ? "their site" : r.name.split(" /")[0]]));
const hueOf = (list: { kind: string; hue: string }[], kind: string) => list.find((x) => x.kind === kind)?.hue ?? "--color-label-2";
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const syncSaid = (rep: { added?: number; error?: string; note?: string }[]): [string, "ok" | "err" | "info"] => {
  if (rep.some((x) => x.note)) return ["No calendar link yet — add it with Edit", "info"];
  const bad = rep.find((x) => x.error); if (bad) return [`Sync failed: ${bad.error}`, "err"];
  const n = rep.reduce((t, x) => t + (x.added ?? 0), 0);
  return [n ? `Synced · ${n} new booking${n === 1 ? "" : "s"}` : "Synced · nothing new", "ok"];
};

/**
 * One page for every outside link (2026-10-24, the owner). Six blocks, each with what to paste where and one button to prove
 * it works: the food apps (the webhook each one posts to, Test order), the room sites (the calendar link to give them, the
 * one to paste from them, Sync), payments (Razorpay keys — the owner's alone — the webhook address, Test keys, UPI), delivery
 * tracking (the switch, how a rider shares the trip, who rides), the property's public links, and who may open this page.
 * The health strip at the top says what is live and what still needs a hand. The forms and actions are the ones Channels,
 * Online orders and Settings already use, so a change here is the same change there.
 */
export function ConnectionsClient({ base, role, ota, orderChannels, types, gateway, who, riders, todays, log, restaurant }: { base: string; role: string; ota: Ota[]; orderChannels: Oc[]; types: { id: string; name: string; base_rate: number }[]; gateway: Gateway; who: Who[]; riders: Rider[]; todays: Record<string, { n: number; gross: number }>; log: { id: string; direction: string; ok: boolean; message: string | null; created_at: string }[]; restaurant: Rest }) {
  const router = useRouter(); const toast = useToast(); const [pending, start] = useTransition();
  const [editOc, setEditOc] = useState<Partial<Oc> | null>(null); const [editOta, setEditOta] = useState<Partial<Ota> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null); const [copied, setCopied] = useState<string | null>(null);
  const [tracking, setTrackingOn] = useState(restaurant.tracking);
  const [tested, setTested] = useState<{ ok: boolean; text: string } | null>(null);
  const owner = role === "owner"; const lodging = restaurant.type !== "restaurant";
  useEffect(() => { setTrackingOn(restaurant.tracking); }, [restaurant.tracking]);
  const copyLink = (key: string, text: string) => { void copyText(text).then((ok) => { if (ok) { setCopied(key); setTimeout(() => setCopied((c) => (c === key ? null : c)), 1800); } else prompt("Copy this link", text); }); };
  const syncNow = async (id?: string) => {
    setBusy(`sync:${id ?? "all"}`);
    try { const r = await fetch(`/api/ota/sync${id ? `?channel=${id}` : ""}`); const j = await r.json().catch(() => ({})); if (r.ok) toast(...syncSaid(j.report ?? [])); else toast(j.error ?? "Sync failed", "err"); router.refresh(); }
    catch { toast("Sync failed — check the connection", "err"); } finally { setBusy(null); }
  };
  const push = (id: string, kind: "menu" | "ari") => { setBusy(`push:${id}`); start(async () => { try { const r = await pushChannel(id, kind); if ("error" in r) toast(r.error!, "err"); else toast(r.message!); } finally { setBusy(null); } }); };
  const pay = gateway.key_id && gateway.hasSecret ? "ready" : gateway.key_id ? "keys" : "none";
  const foodLive = orderChannels.filter((c) => c.is_live).length, roomLive = ota.filter((c) => c.is_live).length, roomBad = ota.filter((c) => c.last_error).length;
  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const tile = (id: string, Icon: typeof Bike, label: string, value: string, tone: "good" | "warn" | "off", data: string) => (
    <button key={id} type="button" onClick={() => go(id)} data-health={data} data-tone={tone}
      className="min-w-0 text-left rounded-[18px] px-4 py-3 bg-[var(--color-bg-2)] border border-[var(--color-separator)] hover:border-[var(--color-label-3)] transition-colors flex items-center gap-3">
      <span className="h-10 w-10 shrink-0 rounded-[12px] grid place-items-center" style={{ background: `color-mix(in srgb, ${tone === "good" ? "var(--color-green)" : tone === "warn" ? "var(--color-orange)" : "var(--color-label-3)"} 15%, transparent)`, color: tone === "good" ? "var(--color-green)" : tone === "warn" ? "var(--color-orange)" : "var(--color-label-2)" }}><Icon size={18} aria-hidden /></span>
      <span className="min-w-0"><span className="block text-[12px] font-semibold text-steel truncate">{label}</span><span className="block text-[14.5px] font-bold truncate">{value}</span></span>
    </button>);

  return (
    <div className="space-y-6" data-connections>
      <SvcHead icon="online" title="Connections" sub="All outside links" actions={<OnlineSwitch off={restaurant.paused} canEdit />} />

      {/* what is live, what needs a hand — a tap scrolls to the block */}
      <div className="fill-tiles" data-conn-health>
        {tile("food", Bike, "Food apps", orderChannels.length ? `${foodLive} of ${orderChannels.length} live` : "None yet", foodLive ? "good" : orderChannels.length ? "warn" : "off", "food")}
        {lodging && tile("rooms", BedDouble, "Room sites", ota.length ? (roomBad ? `${roomBad} failing` : `${roomLive} of ${ota.length} live`) : "None yet", roomBad ? "warn" : roomLive ? "good" : "off", "rooms")}
        {tile("pay", CreditCard, "Payments", pay === "ready" ? "Razorpay ready" : pay === "keys" ? "Secret missing" : restaurant.upi_vpa ? "UPI only" : "Not set up", pay === "ready" ? "good" : pay === "keys" ? "warn" : restaurant.upi_vpa ? "good" : "off", "pay")}
        {tile("track", MapPin, "Delivery tracking", tracking ? (riders.length ? `On · ${riders.length} rider${riders.length === 1 ? "" : "s"}` : "On") : "Off", tracking ? "good" : "off", "track")}
        {tile("links", Globe, "Public page", restaurant.slug ? (restaurant.listed ? "Listed" : "Hidden") : "No address", restaurant.listed ? "good" : "warn", "links")}
      </div>

      {/* ── food delivery apps ── */}
      <Block id="food" icon={<Bike size={20} />} hue="--color-orange" title="Food delivery apps" sub="Swiggy, Zomato, ONDC, website" data="food"
        right={<Link href="/online-orders" className="svc-btn quiet sm !px-4"><UtensilsCrossed size={16} aria-hidden /> Online orders</Link>}>
        <div className="flex flex-wrap gap-2" data-add-food>
          {FOOD.filter((f) => !orderChannels.some((c) => c.kind === f.kind)).map((f) => (
            <button key={f.kind} type="button" onClick={() => setEditOc({ kind: f.kind, label: f.name === "Your website" ? `${restaurant.name} website` : f.name, commission_pct: f.commission, prep_minutes: f.prep, is_live: f.kind === "website" })} data-add-channel={f.kind}
              className="min-h-11 pl-2 pr-4 rounded-full inline-flex items-center gap-2 text-[13.5px] font-bold bg-[var(--color-bg-2)] border border-[var(--color-separator)] hover:border-[var(--color-label-3)] transition-colors">
              <span className="h-7 w-7 rounded-full grid place-items-center" style={{ background: `color-mix(in srgb, var(${f.hue}) 16%, transparent)`, color: `var(${f.hue})` }}><Plus size={15} aria-hidden /></span>Connect {f.name}
            </button>))}
          <button type="button" onClick={() => setEditOc({ kind: "other", commission_pct: 0, prep_minutes: 20 })} className="min-h-11 px-4 rounded-full inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-steel hover:text-[var(--color-label)]"><Plus size={15} aria-hidden /> Another app</button>
        </div>
        <ul className="grid gap-3 md:grid-cols-2 [&>*]:min-w-0" aria-label="Delivery channels">{orderChannels.map((c) => {
          const hue = hueOf(FOOD, c.kind); const hook = `${base}/api/webhooks/aggregator/${c.webhook_token}`; const t = todays[c.id];
          const acts: StripAction[] = [
            { key: "test", label: "Test order", icon: <Send />, tone: "go", disabled: pending, aria: `Send a test order · ${c.label}`, onClick: () => start(async () => { const r = await sendTestOrder(c.webhook_token); if ("error" in r) toast(r.error!, "err"); else toast("Test order sent — it is in Online orders"); }) },
            { key: "menu", label: "Push menu", icon: <Upload />, disabled: pending, aria: `Push menu · ${c.label}`, onClick: () => push(c.id, "menu") },
            { key: "edit", label: "Edit", icon: <Pencil />, aria: `Edit · ${c.label}`, onClick: () => setEditOc(c) },
            { key: "remove", label: "Remove", icon: <Trash2 />, tone: "red", aria: `Remove · ${c.label}`, onClick: async () => { if (await ask({ title: `Remove ${c.label}?`, body: "This channel stops taking orders here.", ok: "Remove", tone: "danger", icon: "trash" })) start(async () => { const r = await deleteChannel(c.id); if ("error" in r) toast(r.error!, "err"); }); } },
          ];
          return (
            <li key={c.id} data-oc={c.kind} className="feather @container overflow-hidden flex flex-col min-w-0">
              <div className="p-4 flex flex-col gap-3 flex-1 min-w-0">
                <Head hue={hue} label={c.label} live={c.is_live} meta={<><span><span className="num">{c.commission_pct}%</span> commission</span><span aria-hidden>·</span><span><span className="num">{c.prep_minutes}</span> min prep</span>{c.auto_accept && <><span aria-hidden>·</span><span className="font-semibold text-[var(--color-orange)]">auto-accept</span></>}</>} />
                <LinkField icon={<Link2 size={16} />} label="Webhook — paste in app" value={hook} keep={10} copied={copied === c.id} onCopy={() => copyLink(c.id, hook)} aria={`Copy the webhook URL for ${c.label}`} data="webhook" />
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-steel" data-status>
                  {c.last_sync_at ? <span className="flex items-center gap-1"><Check size={12} className="text-mint" /> Last order {when(c.last_sync_at)}</span> : <span className="flex items-center gap-1"><Clock size={12} /> No orders yet</span>}
                  {t && <span className="flex items-center gap-1 font-semibold text-[var(--color-label)]"><Bike size={12} /> Today <span className="num">{t.n}</span> · ₹<span className="num">{Math.round(t.gross).toLocaleString("en-IN")}</span></span>}
                </div>
              </div>
              <CardStrip actions={acts} data-actions />
            </li>); })}
          {orderChannels.length === 0 && <li className="feather p-5 text-sm text-steel">No food apps yet</li>}
        </ul>
      </Block>

      {/* ── room booking sites ── */}
      {lodging && <Block id="rooms" icon={<BedDouble size={20} />} hue="--color-blue" title="Room booking sites" sub="Two-way room calendars" data="rooms"
        right={<><Button variant="outline" className="[&>svg]:shrink-0" disabled={!!busy || !ota.length} onClick={() => syncNow()}><RefreshCw size={15} className={cn(busy === "sync:all" && "animate-spin")} /> {busy === "sync:all" ? "Syncing…" : "Sync all"}</Button><Link href="/channels" className="svc-btn quiet sm !px-4"><Calendar size={16} aria-hidden /> Rates</Link></>}>
        <div className="flex flex-wrap gap-2" data-add-rooms>
          {ROOMS.filter((f) => f.kind === "ical" || !ota.some((c) => c.kind === f.kind)).map((f) => (
            <button key={f.kind} type="button" onClick={() => setEditOta({ kind: f.kind, label: f.kind === "ical" ? "" : f.name.split(" /")[0], mode: "ical", commission_pct: f.commission })} data-add-ota={f.kind}
              className="min-h-11 pl-2 pr-4 rounded-full inline-flex items-center gap-2 text-[13.5px] font-bold bg-[var(--color-bg-2)] border border-[var(--color-separator)] hover:border-[var(--color-label-3)] transition-colors">
              <span className="h-7 w-7 rounded-full grid place-items-center" style={{ background: `color-mix(in srgb, var(${f.hue}) 16%, transparent)`, color: `var(${f.hue})` }}><Plus size={15} aria-hidden /></span>Connect {f.name}
            </button>))}
        </div>
        <ul className="grid gap-3 md:grid-cols-2 [&>*]:min-w-0" aria-label="OTA channels">{ota.map((c) => {
          const hue = hueOf(ROOMS, c.kind); const link = `${base}/api/ical/${c.export_token}.ics`; const to = OTA_NAME[c.kind] ?? "their site";
          const syncing = busy === `sync:${c.id}`, pushing = busy === `push:${c.id}`;
          const acts: StripAction[] = [
            { key: "sync", label: syncing ? "Syncing…" : "Sync", icon: <RefreshCw className={cn(syncing && "animate-spin")} />, tone: "go", onClick: () => syncNow(c.id), disabled: !!busy, aria: `Sync · ${c.label}` },
            { key: "push", label: pushing ? "Pushing…" : "Push rates", icon: pushing ? <Loader2 className="animate-spin" /> : <Upload />, onClick: () => push(c.id, "ari"), disabled: !!busy, aria: `Push rates · ${c.label}` },
            { key: "edit", label: "Edit", icon: <Pencil />, onClick: () => setEditOta(c), aria: `Edit · ${c.label}` },
            { key: "remove", label: "Remove", icon: <Trash2 />, tone: "red", onClick: async () => { if (await ask({ title: `Remove ${c.label}?`, body: "Rooms stop syncing with it.", ok: "Remove", tone: "danger", icon: "trash" })) start(async () => { const r = await deleteOta(c.id); if ("error" in r) toast(r.error!, "err"); }); }, aria: `Remove · ${c.label}` },
          ];
          return (
            <li key={c.id} data-ota={c.kind} className="feather @container overflow-hidden flex flex-col min-w-0">
              <div className="p-4 flex flex-col gap-3 flex-1 min-w-0">
                <Head hue={hue} label={c.label} live={c.is_live} meta={<><span className="font-semibold" style={{ color: c.mode === "ical" ? "var(--color-blue)" : "var(--color-orange)" }}>{c.mode === "ical" ? "iCal" : "API"}</span><span aria-hidden>·</span><span><span className="num">{c.commission_pct}%</span> commission</span>{c.room_type_id && <><span aria-hidden>·</span><span className="truncate">{types.find((t) => t.id === c.room_type_id)?.name}</span></>}</>} />
                <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-xs text-steel min-w-0" data-status>
                  {c.last_error ? <span className="text-chili flex items-center gap-1 min-w-0 max-w-full"><AlertTriangle size={12} className="shrink-0" /> <span className="truncate" title={c.last_error}>{c.last_error}</span></span>
                    : c.last_import_at ? <span className="text-mint flex items-center gap-1"><Check size={12} /> Synced {when(c.last_import_at)}</span> : <span className="flex items-center gap-1"><Clock size={12} /> Never synced</span>}
                  {c.import_url ? <span className="flex items-center gap-1 min-w-0 max-w-full" title={c.import_url}><Link2 size={12} className="shrink-0" /> <span className="truncate">Their calendar is pasted</span></span> : <span className="flex items-center gap-1 text-[var(--color-orange)] font-semibold"><Link2 size={12} /> Paste their link</span>}
                </div>
                <LinkField icon={<Calendar size={16} />} label={`Paste into ${to}`} value={link} keep={12} copied={copied === c.id} onCopy={() => copyLink(c.id, link)} aria={`Copy the calendar link for ${c.label}`} data="cal-link" />
              </div>
              <CardStrip actions={acts} data-actions />
            </li>); })}
          {ota.length === 0 && <li className="feather p-5 text-sm text-steel">No room sites yet</li>}
        </ul>
        {log.length > 0 && <div className="text-xs text-steel flex flex-wrap gap-x-4 gap-y-1" data-sync-log>{log.slice(0, 3).map((l) => <span key={l.id} className="flex items-center gap-1 min-w-0"><span className={cn("h-1.5 w-1.5 rounded-full shrink-0", l.ok ? "bg-mint" : "bg-chili")} /><span className="num">{when(l.created_at)}</span><span className="truncate">{l.message}</span></span>)}</div>}
      </Block>}

      {/* ── payments ── */}
      <Block id="pay" icon={<CreditCard size={20} />} hue="--color-green" title="Payments" sub="UPI QR and cards" data="pay"
        right={<span className={cn("inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[12.5px] font-bold", pay === "ready" ? "bg-[var(--color-green-2)] text-[var(--color-green)]" : pay === "keys" ? "bg-[var(--color-orange-2)] text-[var(--color-orange)]" : "bg-[var(--color-fill)] text-steel")} data-pay-state={pay}>
          <span className={cn("h-1.5 w-1.5 rounded-full", pay === "ready" && "animate-pulse")} style={{ background: "currentColor" }} />{pay === "ready" ? "Razorpay ready" : pay === "keys" ? "Secret missing" : "Razorpay not set up"}</span>}>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="rounded-[18px] bg-[var(--color-fill)] p-4 space-y-3 min-w-0 md:bg-[var(--color-bg-2)] md:border md:border-[var(--color-separator)] md:p-5 md:space-y-4" data-pay-how>
            <div className="text-[12px] font-bold uppercase tracking-[.1em] text-steel">How a guest pays</div>
            {/* iPad and up (2026-10-24, the owner: "design"): the steps as a connected timeline; phones keep the numbered list */}
            <div className="hidden md:block"><Flow hue="var(--color-green)" steps={[
              { Icon: QrCode, title: "The bill's QR", body: <>UPI to <span className="num font-semibold text-[var(--color-label)]">{restaurant.upi_vpa || "your UPI ID"}</span></> },
              { Icon: Link2, title: "The pay link", body: <><span className="num">{base}/pay/…</span> · cards via Razorpay</> },
              { Icon: Webhook, title: "The webhook", body: "Marks the bill paid" },
            ]} /></div>
            <ol className="text-sm space-y-2 md:hidden">
              <li className="flex gap-2.5"><Step n={1} /><span><b>The bill's QR.</b> UPI to <span className="num">{restaurant.upi_vpa || "your UPI ID"}</span></span></li>
              <li className="flex gap-2.5"><Step n={2} /><span><b>The pay link.</b> <span className="num text-steel">{base}/pay/…</span> · cards via Razorpay</span></li>
              <li className="flex gap-2.5"><Step n={3} /><span><b>The webhook.</b> Marks the bill paid</span></li>
            </ol>
            <LinkField icon={<Link2 size={16} />} label="Razorpay → Webhooks → payment.captured" value={`${base}/api/webhooks/razorpay`} keep={18} copied={copied === "rzp-hook"} onCopy={() => copyLink("rzp-hook", `${base}/api/webhooks/razorpay`)} aria="Copy the Razorpay webhook address" data="rzp-webhook" />
          </div>
          {owner ? (
            <form className="rounded-[18px] bg-[var(--color-fill)] p-4 space-y-3 min-w-0 md:bg-[var(--color-bg-2)] md:border md:border-[var(--color-separator)] md:p-5 md:space-y-4" data-pay-form action={(fd) => start(async () => { const r = await savePayments(fd); if ("error" in r) toast(r.error!, "err"); else { toast("Payment settings saved"); setTested(null); router.refresh(); } })}>
              <input type="hidden" name="id" value={restaurant.id} />
              <div className="text-[12px] font-bold uppercase tracking-[.1em] text-steel md:hidden">UPI</div>
              <GroupHead Icon={QrCode} hue="var(--color-green)" title="UPI" sub="For the bill QR" />
              <div className="grid sm:grid-cols-2 gap-3 md:rounded-[16px] md:border md:border-[var(--color-separator)] md:bg-[var(--color-bg)] md:p-3.5" data-pay-upi>
                <Field label="UPI ID"><input name="upi_vpa" defaultValue={restaurant.upi_vpa ?? ""} placeholder="hotel@okaxis" className="num" autoCapitalize="none" /></Field>
                <Field label="Payee name" hint="Blank = property name"><input name="upi_payee" defaultValue={restaurant.upi_payee ?? ""} /></Field>
              </div>
              <div className="text-[12px] font-bold uppercase tracking-[.1em] text-steel pt-1 md:hidden">Razorpay — Account & Settings → API keys</div>
              <GroupHead Icon={KeyRound} hue="var(--color-blue)" title="Razorpay keys" sub={<>Razorpay → Account &amp; Settings → API keys</>} />
              <div className="md:rounded-[16px] md:border md:border-[var(--color-separator)] md:bg-[var(--color-bg)] md:p-3.5 space-y-3" data-pay-keys>
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="Key ID"><input name="razorpay_key_id" defaultValue={gateway.key_id} placeholder="rzp_live_…" className="num" autoCapitalize="none" /></Field>
                <Field label="Key secret" hint={gateway.hasSecret ? "Saved. Blank keeps it; 'clear' removes." : ""}><PasswordInput name="razorpay_key_secret" autoComplete="new-password" placeholder={gateway.hasSecret ? "••••••••" : ""} /></Field>
              </div>
              <Field label="Webhook secret" hint={gateway.hasWebhook ? "Saved. Blank keeps it; 'clear' removes." : "From Razorpay webhook"}><PasswordInput name="razorpay_webhook_secret" autoComplete="new-password" placeholder={gateway.hasWebhook ? "••••••••" : ""} /></Field>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button disabled={pending}>Save payments</Button>
                <Button type="button" variant="outline" disabled={pending || pay === "none"} data-test-keys onClick={() => start(async () => { const r = await testGateway(); setTested("error" in r ? { ok: false, text: r.error! } : { ok: true, text: r.message! }); })}><ShieldCheck size={15} /> Test keys</Button>
                {tested && <span className={cn("text-[13px] font-semibold", tested.ok ? "text-mint" : "text-chili")} data-test-result>{tested.text}</span>}
              </div>
            </form>
          ) : (
            <div className="rounded-[18px] bg-[var(--color-fill)] p-4 space-y-2 min-w-0 text-sm" data-pay-readonly>
              <div className="text-[12px] font-bold uppercase tracking-[.1em] text-steel">Keys</div>
              <p>UPI ID: <span className="num font-semibold">{restaurant.upi_vpa || "not set"}</span></p>
              <p>Razorpay: <b>{pay === "ready" ? "ready" : pay === "keys" ? "key saved, secret missing" : "not set up"}</b></p>
              <p className="text-steel">Owner only</p>
            </div>
          )}
        </div>
      </Block>

      {/* ── delivery tracking ── */}
      <Block id="track" icon={<MapPin size={20} />} hue="--color-cyan" title="Delivery tracking" sub="Live rider tracking" data="track"
        right={<label className="flex items-center gap-3 text-sm font-semibold"><span data-tracking-state>{tracking ? "On" : "Off"}</span><Switch on={tracking} name="Delivery tracking" onChange={(v) => { setTrackingOn(v); start(async () => { const r = await setTracking(v); if ("error" in r) { setTrackingOn(!v); toast(r.error!, "err"); } else toast(v ? "Delivery tracking is on" : "Delivery tracking is off"); }); }} /></label>}>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          {/* iPad and up: the steps as a timeline with the two demo pages under them; phones keep the list */}
          <div className="hidden md:block rounded-[18px] bg-[var(--color-bg-2)] border border-[var(--color-separator)] p-5 min-w-0" data-track-how>
            <Flow hue="var(--color-cyan)" steps={[
              { Icon: Send, title: "Food ready → Send out", body: "Online orders → pick a rider" },
              { Icon: Link2, title: "Two links", body: <>Rider <span className="num">{base}/ride/…</span> · customer <span className="num">{base}/track/…</span></> },
              { Icon: MapPin, title: "Live", body: "Live rider map" },
            ]} />
            <div className="mt-4 flex flex-wrap gap-2.5"><a href="/track/demo" target="_blank" rel="noreferrer" className="svc-btn quiet sm !px-4"><Smartphone size={16} aria-hidden /> See the customer&apos;s page</a><a href="/ride/demo" target="_blank" rel="noreferrer" className="svc-btn quiet sm !px-4"><Bike size={16} aria-hidden /> See the rider&apos;s page</a></div>
          </div>
          <ol className="rounded-[18px] bg-[var(--color-fill)] p-4 text-sm space-y-2.5 min-w-0 md:hidden">
            <li className="flex gap-2.5"><Step n={1} /><span><b>Food ready → Send out.</b> Online orders → pick a rider</span></li>
            <li className="flex gap-2.5"><Step n={2} /><span><b>Two links.</b> Rider <span className="num text-steel">{base}/ride/…</span> · customer <span className="num text-steel">{base}/track/…</span></span></li>
            <li className="flex gap-2.5"><Step n={3} /><span><b>Live.</b> Live rider map</span></li>
            <li className="flex gap-2.5 pt-1"><a href="/track/demo" target="_blank" rel="noreferrer" className="svc-btn quiet sm !px-4" data-track-demo><Smartphone size={16} aria-hidden /> See the customer's page</a><a href="/ride/demo" target="_blank" rel="noreferrer" className="svc-btn quiet sm !px-4" data-ride-demo><Bike size={16} aria-hidden /> See the rider's page</a></li>
          </ol>
          <div className="rounded-[18px] bg-[var(--color-fill)] p-4 min-w-0 md:bg-[var(--color-bg-2)] md:border md:border-[var(--color-separator)] md:p-5" data-riders>
            <div className="flex items-center justify-between gap-2 mb-2"><div className="text-[12px] font-bold uppercase tracking-[.1em] text-steel">Your riders</div><Link href="/staff" className="text-[12.5px] font-semibold text-steel hover:text-[var(--color-label)] underline-offset-2 hover:underline">Staff →</Link></div>
            {riders.length ? <ul className="space-y-1.5 text-sm">{riders.map((r) => <li key={r.id} className="flex items-center gap-2 min-w-0"><span className="h-7 w-7 rounded-full grid place-items-center bg-[var(--color-bg-2)] text-[12px] font-bold shrink-0">{r.full_name.slice(0, 1)}</span><span className="truncate font-semibold">{r.full_name}</span><span className="num text-xs text-steel ml-auto shrink-0">{r.phone ?? "no phone"}</span></li>)}</ul>
              : <>
                <p className="text-sm text-steel md:hidden">No riders yet</p>
                <div className="hidden md:block"><EmptyState size="sm" icon={Bike} hue="cyan" title="No riders yet" data-riders-empty
                  hint="Optional · add in Staff"
                  actions={<Link href="/staff" className="svc-btn quiet sm !px-3.5">Staff</Link>} /></div>
              </>}
          </div>
        </div>
      </Block>

      {/* ── public links ── */}
      <Block id="links" icon={<Globe size={20} />} hue="--color-violet" title="Your public links" sub="For Google, Instagram, WhatsApp" data="links"
        right={restaurant.slug ? <a href={`${base}/dine/${restaurant.slug}`} target="_blank" rel="noreferrer" className="svc-btn quiet sm !px-4"><ExternalLink size={16} aria-hidden /> Open</a> : <Link href="/settings/storefront" className="svc-btn quiet sm !px-4">Set up</Link>}>
        {restaurant.slug ? <>
          {!restaurant.listed && <p className="text-sm text-[var(--color-orange)] font-semibold flex items-center gap-1.5"><AlertTriangle size={14} /> Not listed · Settings → Storefront</p>}
          <GoogleLinks base={base} slug={restaurant.slug} listed={restaurant.listed} dining={restaurant.dining} ordering={restaurant.ordering} rooms={lodging} />
          <div className="flex flex-wrap gap-2 text-[13px]">
            <Link href="/pulse/qr" className="svc-btn quiet sm !px-4"><QrCode size={16} aria-hidden /> Join by QR</Link>
            <Link href="/settings/table-qr" className="svc-btn quiet sm !px-4"><QrCode size={16} aria-hidden /> Table QR codes</Link>
            <Link href="/settings/screens" className="svc-btn quiet sm !px-4"><Smartphone size={16} aria-hidden /> Screens & feedback</Link>
          </div>
        </> : <p className="text-sm text-steel">No web address yet</p>}
      </Block>

      {/* ── who may open this page ── */}
      <Block id="who" icon={<Users size={20} />} hue="--color-label-2" title="Who can open this page" sub="Owner, plus Staff → Access" data="who"
        right={owner && <Link href="/staff" className="svc-btn quiet sm !px-4"><Users size={16} aria-hidden /> Staff</Link>}>
        <ul className="flex flex-wrap gap-2" data-who>{who.map((p) => <li key={p.id} className="inline-flex items-center gap-2 h-9 pl-1.5 pr-3 rounded-full bg-[var(--color-fill)] text-[13px] font-semibold"><span className="h-6 w-6 rounded-full grid place-items-center bg-[var(--color-bg-2)] text-[11px] font-bold">{p.full_name.slice(0, 1)}</span>{p.full_name}<span className="text-steel font-medium">· {p.role === "owner" ? "owner" : "given access"}</span></li>)}</ul>
      </Block>

      {err && <p className="text-sm text-chili">{err}</p>}

      <Sheet open={!!editOc} onClose={() => setEditOc(null)} title={editOc?.id ? editOc.label ?? "" : `Connect ${FOOD.find((f) => f.kind === editOc?.kind)?.name ?? "a food app"}`}>
        {editOc && <form className="space-y-4" action={(fd) => start(async () => { const r = await saveChannel(fd); if ("error" in r) setErr(r.error!); else { setErr(null); setEditOc(null); toast(editOc.id ? "Channel saved" : "Connected — copy the webhook"); } })}>
          {editOc.id && <input type="hidden" name="id" value={editOc.id} />}
          {!editOc.id && FOOD.find((f) => f.kind === editOc.kind) && <p className="text-sm text-steel">{FOOD.find((f) => f.kind === editOc.kind)!.how}.</p>}
          <div className="grid grid-cols-2 gap-3"><Field label="Platform"><select name="kind" defaultValue={editOc.kind ?? "swiggy"}><option value="swiggy">Swiggy</option><option value="zomato">Zomato</option><option value="ondc">ONDC</option><option value="website">My website</option><option value="other">Other</option></select></Field>
            <Field label="Label"><input name="label" defaultValue={editOc.label} required placeholder="Swiggy — Main outlet" /></Field>
            <Field label="Outlet ID"><input name="outlet_ref" className="num" defaultValue={editOc.outlet_ref ?? ""} /></Field>
            <Field label="Commission %"><input name="commission_pct" type="number" step="0.1" className="num" defaultValue={editOc.commission_pct ?? 22} /></Field>
            <Field label="Prep time (min)"><input name="prep_minutes" type="number" className="num" defaultValue={editOc.prep_minutes ?? 20} /></Field></div>
          <Field label="Partner API base (optional)" hint="Partner accounts only"><input name="api_base" defaultValue={editOc.api_base ?? ""} placeholder="https://api.urbanpiper.com" /></Field>
          <Field label="API key (optional)" hint={editOc.has_api_key ? "Saved. Blank keeps it." : undefined}><input name="api_key" type="password" autoComplete="new-password" placeholder={editOc.has_api_key ? "Saved" : "••••••"} /></Field>
          <div className="flex gap-4 text-sm"><label className="flex items-center gap-2 normal-case"><input type="checkbox" name="auto_accept" defaultChecked={editOc.auto_accept} /> Auto-accept matched orders</label><label className="flex items-center gap-2 normal-case"><input type="checkbox" name="is_live" defaultChecked={editOc.is_live} /> Live</label></div>
          <Button className="w-full" disabled={pending}>{editOc.id ? "Save" : "Connect"}</Button></form>}
      </Sheet>
      <Sheet open={!!editOta} onClose={() => setEditOta(null)} title={editOta?.id ? editOta.label ?? "" : `Connect ${ROOMS.find((f) => f.kind === editOta?.kind)?.name ?? "a room site"}`}>
        {editOta && <form className="space-y-4" action={(fd) => start(async () => { const r = await saveOta(fd); if ("error" in r) setErr(r.error!); else { setErr(null); setEditOta(null);
          /* a pasted calendar link is proved at once, like Test keys (2026-10-29): sync it now and say what happened, rather
             than leave it "Never synced" until the nightly run */
          if (String(fd.get("import_url") ?? "").trim() && r.id) void syncNow(r.id);
          else toast(editOta.id ? "Channel saved" : "Connected — copy your link"); } })}>
          {editOta.id && <input type="hidden" name="id" value={editOta.id} />}
          {!editOta.id && <p className="text-sm text-steel">Paste their iCal link below. Save, copy yours to their extranet. Syncs nightly.</p>}
          <div className="grid grid-cols-2 gap-3"><Field label="Site"><select name="kind" defaultValue={editOta.kind ?? "booking_com"}><option value="booking_com">Booking.com</option><option value="makemytrip">MakeMyTrip / Goibibo</option><option value="airbnb">Airbnb</option><option value="agoda">Agoda</option><option value="expedia">Expedia</option><option value="ical">Any iCal calendar</option><option value="other">Other</option></select></Field>
            <Field label="Label"><input name="label" defaultValue={editOta.label} required placeholder="Booking.com — Deluxe" /></Field>
            <Field label="Mode"><select name="mode" defaultValue={editOta.mode ?? "ical"}><option value="ical">iCal (works today)</option><option value="api">API (needs credentials)</option></select></Field>
            <Field label="Room type"><select name="room_type_id" defaultValue={editOta.room_type_id ?? ""}><option value="">All types</option>{types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
            <Field label="Commission %"><input name="commission_pct" type="number" step="0.1" className="num" defaultValue={editOta.commission_pct ?? 15} /></Field>
            <Field label="Rate offset %" hint="Higher protects direct rates"><input name="rate_offset_pct" type="number" step="0.1" className="num" defaultValue={editOta.rate_offset_pct ?? 0} /></Field></div>
          <Field label="Their iCal link"><input name="import_url" className="num text-xs min-w-0" defaultValue={editOta.import_url ?? ""} placeholder="https://ical.booking.com/v1/export?t=…" /></Field>
          <Field label="API base (API mode)"><input name="api_base" defaultValue={editOta.api_base ?? ""} /></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Property ID"><input name="hotel_ref" className="num" defaultValue={editOta.hotel_ref ?? ""} /></Field><Field label="API key" hint={editOta.has_api_key ? "Saved. Blank keeps it." : undefined}><input name="api_key" type="password" autoComplete="new-password" placeholder={editOta.has_api_key ? "Saved" : "••••••"} /></Field></div>
          <label className="flex items-center gap-2 text-sm normal-case"><input type="checkbox" name="is_live" defaultChecked={editOta.is_live} /> Live</label>
          <Button className="w-full" disabled={pending}>{editOta.id ? "Save" : "Connect"}</Button></form>}
      </Sheet>
    </div>
  );
}

/** a block of the page: a tinted icon, the title, one sentence, the block's own button on the right */
function Block({ id, icon, hue, title, sub, right, children, data }: { id: string; icon: ReactNode; hue: string; title: string; sub: string; right?: ReactNode; children: ReactNode; data: string }) {
  return (
    <section id={id} className="feather p-4 sm:p-5 space-y-4 scroll-mt-24" data-conn={data}>
      <div className="flex flex-wrap items-start gap-3">
        <span className="h-11 w-11 shrink-0 rounded-[13px] grid place-items-center" style={{ background: `color-mix(in srgb, var(${hue}) 15%, transparent)`, color: `var(${hue})` }} aria-hidden>{icon}</span>
        <div className="min-w-0 flex-1"><h2 className="text-[19px] !font-bold tracking-[-0.01em] leading-tight">{title}</h2><p className="text-[13px] text-steel mt-0.5">{sub}</p></div>
        {right && <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">{right}</div>}
      </div>
      {children}
    </section>
  );
}
/** iPad and up (2026-10-24): steps as a connected timeline — a coloured icon tile with its number, the title, the words. */
function Flow({ steps, hue }: { steps: { Icon: typeof QrCode; title: string; body: ReactNode }[]; hue: string }) {
  return (
    <ol className="relative" data-flow>
      {steps.map((st, i) => (
        <li key={i} className="relative flex gap-3.5 pb-5 last:pb-0">
          {i < steps.length - 1 && <span className="absolute left-[21px] top-[50px] bottom-1 w-0.5 rounded-full" style={{ background: `color-mix(in srgb, ${hue} 28%, transparent)` }} aria-hidden />}
          <span className="relative h-11 w-11 shrink-0 rounded-[14px] grid place-items-center" style={{ background: `color-mix(in srgb, ${hue} 14%, var(--color-bg-2))`, color: hue }}>
            <st.Icon size={19} aria-hidden />
            <span className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full grid place-items-center text-[10.5px] font-extrabold num ring-2 ring-[var(--color-bg-2)]" style={{ background: hue, color: "var(--color-on-tint)" }}>{i + 1}</span>
          </span>
          <div className="min-w-0 pt-0.5"><div className="text-[15px] font-bold leading-snug">{st.title}</div><div className="text-[13px] text-steel leading-relaxed mt-0.5">{st.body}</div></div>
        </li>))}
    </ol>
  );
}
/** iPad and up: a form group's heading — its icon tile, the name, one line. Hidden on a phone. */
const GroupHead = ({ Icon, hue, title, sub }: { Icon: typeof QrCode; hue: string; title: string; sub: ReactNode }) => (
  <div className="hidden md:flex items-center gap-3">
    <span className="h-10 w-10 shrink-0 rounded-[12px] grid place-items-center" style={{ background: `color-mix(in srgb, ${hue} 14%, var(--color-bg-2))`, color: hue }}><Icon size={18} aria-hidden /></span>
    <div className="min-w-0"><div className="text-[15px] font-bold leading-tight">{title}</div><div className="text-[12.5px] text-steel mt-0.5">{sub}</div></div>
  </div>
);
const Step = ({ n }: { n: number }) => <span className="h-6 w-6 shrink-0 rounded-full grid place-items-center bg-[var(--color-bg-2)] text-[12px] font-bold num">{n}</span>;
/** a channel card's head: its initial in the platform's colour, the name, the numbers under it, Live or Draft */
function Head({ hue, label, live, meta }: { hue: string; label: string; live: boolean; meta: ReactNode }) {
  return (
    <div className="flex items-start gap-3 min-w-0">
      <span aria-hidden className="h-11 w-11 shrink-0 rounded-[12px] grid place-items-center font-display text-lg font-semibold" style={{ background: `color-mix(in srgb, var(${hue}) 16%, transparent)`, color: `var(${hue})` }}>{label.trim().charAt(0).toUpperCase() || "·"}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-semibold truncate" title={label} data-name>{label}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12px] text-steel min-w-0">{meta}</div>
      </div>
      <span className="shrink-0 inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-[11.5px] font-semibold whitespace-nowrap" data-live
        style={{ background: `color-mix(in srgb, ${live ? "var(--color-green)" : "var(--color-label-2)"} ${live ? 16 : 14}%, transparent)`, color: live ? "var(--color-green)" : "var(--color-label-2)" }}>
        <span className={cn("h-1.5 w-1.5 rounded-full", live && "animate-pulse")} style={{ background: "currentColor" }} />{live ? "Live" : "Draft"}
      </span>
    </div>
  );
}
/** a link as one field: what it is for, the address with its end kept in view, Copy inside it ("Copied" for a moment) */
function LinkField({ icon, label, value, keep, copied, onCopy, aria, data }: { icon: ReactNode; label: string; value: string; keep: number; copied: boolean; onCopy: () => void; aria: string; data: string }) {
  const shown = value.replace(/^https?:\/\//, "");
  return (
    <div className="mt-auto flex items-center gap-2.5 min-w-0 rounded-[14px] p-1.5 pl-3 ring-1 ring-inset ring-[var(--color-separator)] bg-[color-mix(in_srgb,var(--color-fill)_60%,transparent)]" title={label} data-link-field={data}>
      <span className="shrink-0 text-[var(--color-label-2)]" aria-hidden>{icon}</span>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="text-[10.5px] font-semibold uppercase tracking-[.12em] text-steel truncate">{label}</div>
        <div className="mt-0.5 flex min-w-0 text-[12.5px] font-medium tabular-nums text-[var(--color-label)] select-all" data-link><span className="truncate">{shown.slice(0, -keep)}</span><span className="shrink-0">{shown.slice(-keep)}</span></div>
      </div>
      <button type="button" onClick={onCopy} aria-label={aria} data-copy className="shrink-0 px-3 min-h-10 rounded-[10px] inline-flex items-center gap-1.5 text-[12.5px] font-semibold bg-[var(--color-fill-2)] text-[var(--color-label)] hover:brightness-125 transition focus-visible:!outline-offset-0 [&_svg]:shrink-0">
        {copied ? <><Check size={14} className="text-[var(--color-tint)]" /> Copied</> : <><Copy size={14} /> Copy</>}
      </button>
    </div>
  );
}
