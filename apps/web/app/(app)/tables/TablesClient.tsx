"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Armchair, Users, Clock, Receipt, CalendarClock, SprayCan, Plus, QrCode, Settings2, ClipboardList, Phone, IndianRupee, ChevronRight, Check } from "lucide-react";
import { Card, Sheet, cn } from "@/components/ui";
import { SvcHead } from "@/components/ui/Service";
import { QR } from "@/components/QR";
import { useLive } from "@/lib/useLive";
import { formatINR, fmtSince } from "@/lib/format";

export type TableRow = { id: string; name: string; capacity: number; zone: string | null; status: string; sort_order: number; qr_token: string | null };
export type OpenOrder = { id: string; order_no: number; table_id: string; customer_name: string | null; created_at: string; created_by: string | null; bills: { status: string; total: number }[] | null;
  order_items: { id: string; name_snapshot: string; variant_name: string | null; qty: number; price_snapshot: number; status: string }[] };
export type PaidBill = { id: string; bill_no: number; total: number; paid_at: string; orders: { table_id: string; created_at: string } | null };
export type Booking = { id: string; table_id: string; guest_name: string; guest_phone: string | null; party_size: number; at_time: string; status: string; occasion: string | null };
export type Clean = { id: string; table_id: string; status: string; created_at: string; taken_by: string | null };

type St = "free" | "use" | "bill" | "clean" | "reserved";
/** each state its word and colour — the same hues as the floor on Orders and Pulse */
const ST: Record<St, { label: string; hue: string }> = {
  free: { label: "Free", hue: "--color-green" }, use: { label: "In use", hue: "--color-blue" }, bill: { label: "Bill out", hue: "--color-orange" },
  clean: { label: "Cleaning", hue: "--color-cyan" }, reserved: { label: "Reserved", hue: "--color-violet" },
};
const ITEM_ST: Record<string, string> = { pending: "Ordered", sent: "Ordered", preparing: "Cooking", ready: "Ready", served: "Served", cancelled: "Cancelled" };
const hm = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
const clock = (t: string) => { const [h, m] = t.split(":").map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`; };
const minsOf = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const amountOf = (o: OpenOrder) => { const unpaid = o.bills?.find((b) => b.status === "unpaid"); return unpaid ? Number(unpaid.total) : o.order_items.filter((i) => i.status !== "cancelled").reduce((s, i) => s + Number(i.qty) * Number(i.price_snapshot), 0); };

/**
 * Tables (2026-10-21, the owner: "one more menu — Tables — click one and show its details completely"). The floor in
 * four numbers, the tables by zone with their state, and a tap opens everything about one: what is on it now (the order,
 * its items and their state, who took it, how long they have sat), the bookings on it today, today's bills there and
 * how long a sitting took, its cleaning job and its table-ordering QR — with Take order / Add items and Bill at the foot.
 */
export function TablesClient({ tables, open, paid, booked, cleaning, names, slug, canEdit }: { tables: TableRow[]; open: OpenOrder[]; paid: PaidBill[]; booked: Booking[]; cleaning: Clean[]; names: Record<string, string>; slug: string; canEdit: boolean }) {
  useLive(["orders", "order_items", "bills", "dining_tables", "reservations", "table_cleanings"]);
  const [filter, setFilter] = useState<St | "all">("all"); const [zone, setZone] = useState<string>("all"); const [pick, setPick] = useState<string | null>(null);
  const [origin, setOrigin] = useState(""); useEffect(() => { setOrigin(location.origin); }, []);
  const [now, setNow] = useState(() => Date.now()); useEffect(() => { const i = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(i); }, []);
  const nowMin = minsOf(new Date(now + 5.5 * 3600e3).toISOString().slice(11, 16));
  const openBy = useMemo(() => new Map(open.map((o) => [o.table_id, o])), [open]);
  const cleanBy = useMemo(() => new Map(cleaning.map((c) => [c.table_id, c])), [cleaning]);
  const bookingsOf = (id: string) => booked.filter((b) => b.table_id === id);
  // a booking still holds the table for half an hour after its time — the party may be running late
  const nextOf = (id: string) => bookingsOf(id).find((b) => b.status !== "seated" && minsOf(b.at_time) >= nowMin - 30);
  const paidOf = (id: string) => paid.filter((b) => b.orders?.table_id === id);
  const stOf = (t: TableRow): St => { const o = openBy.get(t.id); if (o) return o.bills?.some((b) => b.status === "unpaid") ? "bill" : "use"; if (cleanBy.has(t.id)) return "clean"; if (nextOf(t.id)) return "reserved"; return "free"; };
  const zones = [...new Set(tables.map((t) => t.zone || "Main"))];
  const counts = tables.reduce((m, t) => { const s = stOf(t); m[s] = (m[s] ?? 0) + 1; return m; }, {} as Partial<Record<St, number>>);
  const shown = tables.filter((t) => (filter === "all" || stOf(t) === filter) && (zone === "all" || (t.zone || "Main") === zone));
  const takings = paid.reduce((s, b) => s + Number(b.total), 0);
  const seatsUsed = tables.filter((t) => openBy.has(t.id)).reduce((s, t) => s + t.capacity, 0), seats = tables.reduce((s, t) => s + t.capacity, 0);
  const t = tables.find((x) => x.id === pick) ?? null;

  const tiles = [
    { k: "free", Icon: Armchair, n: `${counts.free ?? 0}`, of: `of ${tables.length}`, label: "Free to seat", hue: "--color-green" },
    { k: "use", Icon: ClipboardList, n: `${(counts.use ?? 0) + (counts.bill ?? 0)}`, of: `· ${seatsUsed}/${seats} seats`, label: "In use now", hue: "--color-blue" },
    { k: "reserved", Icon: CalendarClock, n: `${booked.filter((b) => b.status !== "seated").length}`, of: "", label: "Bookings today", hue: "--color-violet" },
    { k: "takings", Icon: IndianRupee, n: formatINR(takings, { whole: true }), of: paid.length === 1 ? "· 1 bill" : `· ${paid.length} bills`, label: "Taken at tables today", hue: "--color-orange" },
  ];

  return (
    <div className="space-y-5">
      <SvcHead icon="tables" title="Tables" sub="All tables, live — tap one for details"
        actions={canEdit ? <>
          <Link href="/settings/table-qr" className="svc-btn quiet sm"><QrCode size={17} aria-hidden /> Table QR codes</Link>
          <Link href="/settings#tables" className="svc-btn quiet sm"><Settings2 size={17} aria-hidden /> Set up tables</Link>
        </> : undefined} />

      {/* the floor in four numbers */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3" data-tables-glance>
        {tiles.map(({ k, Icon, n, of, label, hue }) => (
          <Card key={k} className="!p-3 sm:!p-4 !rounded-[20px] flex items-center gap-3 min-w-0">
            <span className="h-10 w-10 shrink-0 rounded-[12px] grid place-items-center" style={{ color: `var(${hue})`, background: `color-mix(in srgb, var(${hue}) 15%, transparent)` }} aria-hidden><Icon size={19} /></span>
            <div className="min-w-0"><div className="flex items-baseline gap-1.5 min-w-0"><span className="font-display num text-[22px] sm:text-[26px] leading-none truncate">{n}</span>{of && <span className="text-[12px] font-semibold text-steel truncate num">{of}</span>}</div>
              <div className="text-[12px] sm:text-[13px] text-steel mt-1 leading-tight truncate">{label}</div></div>
          </Card>))}
      </div>

      {/* On a phone (2026-10-22, the owner: "not looking good"): the states are one sliding row in a soft track — the chosen
          one raised on the card colour, the rest a dot, the word and a quiet count — with the zone as a pill at its end,
          instead of chips wrapping into two rows round the zone select. 44px to the finger. iPad and desktop: below. */}
      <div className="md:hidden flex items-center gap-2" data-tables-filter="phone">
        <div className="rail-fade flex-1 min-w-0 flex gap-1 overflow-x-auto rounded-full bg-[var(--color-fill)] p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Show tables">
          {(["all", "free", "use", "bill", "reserved", "clean"] as const).map((k) => { const n = k === "all" ? tables.length : counts[k] ?? 0; if (k !== "all" && k !== "free" && !n) return null; const on = filter === k; return (
            <button key={k} type="button" onClick={() => setFilter(k)} aria-pressed={on} data-table-filter={k}
              className={cn("shrink-0 h-11 !min-h-11 pl-3 pr-3.5 rounded-full inline-flex items-center gap-1.5 text-[13px] font-bold whitespace-nowrap transition-[background-color,color,box-shadow] duration-150",
                on ? "bg-[var(--color-bg-2)] text-[var(--color-label)] shadow-[0_1px_4px_rgb(0_0_0/0.22)]" : "text-[var(--color-label-2)]")}>
              {k !== "all" && <span className="h-2 w-2 rounded-full shrink-0" style={{ background: `var(${ST[k].hue})` }} aria-hidden />}{k === "all" ? "All" : ST[k].label}
              <span className={cn("num text-[11.5px] font-bold", on ? "text-[var(--color-label-2)]" : "text-[var(--color-label-3)]")}>{n}</span></button>); })}
        </div>
        {zones.length > 1 && <select value={zone} onChange={(e) => setZone(e.target.value)} aria-label="Zone" className="!w-auto max-w-[40%] shrink-0 !h-[52px] !min-h-[52px] !rounded-full !pl-4 text-[13px] font-semibold" data-zone-pick>
          <option value="all">Every zone</option>{zones.map((z) => <option key={z} value={z}>{z}</option>)}</select>}
      </div>
      <div className="max-md:hidden flex flex-wrap items-center gap-2" data-tables-filter>
        {(["all", "free", "use", "bill", "reserved", "clean"] as const).map((k) => { const n = k === "all" ? tables.length : counts[k] ?? 0; if (k !== "all" && k !== "free" && !n) return null; const on = filter === k; return (
          <button key={k} type="button" onClick={() => setFilter(k)} aria-pressed={on} className={cn("!min-h-10 h-10 px-3.5 rounded-full inline-flex items-center gap-2 text-[13px] font-bold transition-colors", on ? "bg-[var(--color-label)] text-[var(--color-on-label)]" : "bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)]")}>
            {k !== "all" && <span className="h-2 w-2 rounded-full" style={{ background: `var(${ST[k].hue})` }} aria-hidden />}{k === "all" ? "All" : ST[k].label}<span className={cn("num text-[11.5px] min-w-5 h-5 px-1.5 rounded-full grid place-items-center", on ? "bg-[color-mix(in_srgb,var(--color-on-label)_18%,transparent)]" : "bg-[var(--color-fill-2)]")}>{n}</span></button>); })}
        {zones.length > 1 && <select value={zone} onChange={(e) => setZone(e.target.value)} aria-label="Zone" className="!w-auto !h-10 !min-h-10 ml-auto text-[13px] font-semibold"><option value="all">Every zone</option>{zones.map((z) => <option key={z} value={z}>{z}</option>)}</select>}
      </div>

      {tables.length === 0 ? <Card className="text-center !py-10"><Armchair className="mx-auto text-steel" size={28} /><p className="mt-3 font-semibold">No tables yet</p><p className="text-[13px] text-steel mt-1">Add them in Settings → Tables & zones.</p></Card>
        : zones.filter((z) => zone === "all" || z === zone).map((z) => { const list = shown.filter((t) => (t.zone || "Main") === z); if (!list.length) return null; return (
          <section key={z} className="min-w-0">
            <div className="flex items-center gap-2 mb-2.5"><span className="text-[12px] font-bold uppercase tracking-[.12em] text-steel">{z}</span><span className="num text-[11.5px] font-bold h-5 min-w-5 px-1.5 rounded-full grid place-items-center bg-[var(--color-fill)]">{list.length}</span></div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-3">
              {list.map((tb) => { const s = stOf(tb); const o = openBy.get(tb.id); const nb = nextOf(tb.id); const c = cleanBy.get(tb.id); const day = paidOf(tb.id); return (
                <button key={tb.id} type="button" onClick={() => setPick(tb.id)} data-table-row={tb.name} data-table-state={s}
                  className="text-left min-w-0 rounded-[20px] p-3.5 flex flex-col gap-2 border transition-colors active:scale-[.99] hover:brightness-110"
                  style={{ borderColor: `color-mix(in srgb, var(${ST[s].hue}) ${s === "free" ? 30 : 55}%, transparent)`, background: s === "free" ? "var(--color-bg-2)" : `color-mix(in srgb, var(${ST[s].hue}) 9%, var(--color-bg-2))` }}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-display text-[28px] leading-none truncate">{tb.name}</span>
                    <span className="ml-auto inline-flex items-center gap-1 h-6 px-2 rounded-full bg-[var(--color-fill-2)] text-[11.5px] font-semibold text-[var(--color-label-2)] num shrink-0"><Users size={12} aria-hidden />{tb.capacity}</span>
                  </div>
                  <span className="self-start inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-[11.5px] font-bold" style={{ color: `var(${ST[s].hue})`, background: `color-mix(in srgb, var(${ST[s].hue}) 15%, transparent)` }}>
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: "currentColor" }} aria-hidden />{ST[s].label}</span>
                  <div className="text-[12.5px] font-semibold text-[var(--color-label-2)] min-w-0 truncate num" suppressHydrationWarning>
                    {o ? <>{formatINR(amountOf(o), { whole: true })} · {o.order_items.filter((i) => i.status !== "cancelled").length} items · {fmtSince(o.created_at)}</>
                      : c ? <>{c.taken_by ? `${names[c.taken_by] ?? "Someone"} on it` : "Waiting"} · {fmtSince(c.created_at)}</>
                      : nb ? <>{nb.guest_name} · {clock(nb.at_time)} · {nb.party_size}</> : "Ready to seat"}
                  </div>
                  <div className="mt-auto pt-2 border-t border-[var(--color-separator)] flex items-center gap-1.5 text-[11.5px] text-steel num">
                    <Receipt size={12} aria-hidden />{day.length ? <>Today {day.length} bill{day.length === 1 ? "" : "s"} · {formatINR(day.reduce((x, b) => x + Number(b.total), 0), { whole: true })}</> : "No bills yet today"}
                    <ChevronRight size={14} className="ml-auto" aria-hidden />
                  </div>
                </button>); })}
            </div>
          </section>); })}
      {tables.length > 0 && shown.length === 0 && <p className="text-[14px] text-steel rounded-2xl border border-dashed border-[var(--color-separator)] p-6 text-center">No table is {filter === "all" ? "in this zone" : ST[filter as St].label.toLowerCase()} right now.</p>}

      <Sheet open={!!t} onClose={() => setPick(null)} title={t ? `Table ${t.name}` : ""} wide>
        {t && <TableDetail t={t} st={stOf(t)} o={openBy.get(t.id)} bookings={bookingsOf(t.id)} bills={paidOf(t.id)} clean={cleanBy.get(t.id)} names={names} qrUrl={t.qr_token && slug && origin ? `${origin}/dine/${slug}?t=${t.qr_token}` : null} />}
      </Sheet>
    </div>
  );
}

/** One table, completely: its facts, what is on it now, today's bookings and bills on it, cleaning, its QR — and the moves. */
function TableDetail({ t, st, o, bookings, bills, clean, names, qrUrl }: { t: TableRow; st: St; o?: OpenOrder; bookings: Booking[]; bills: PaidBill[]; clean?: Clean; names: Record<string, string>; qrUrl: string | null }) {
  const items = o?.order_items.filter((i) => i.status !== "cancelled") ?? [];
  const sat = bills.filter((b) => b.orders?.created_at).map((b) => (new Date(b.paid_at).getTime() - new Date(b.orders!.created_at).getTime()) / 60000).filter((m) => m > 0 && m < 600);
  const avgSit = sat.length ? Math.round(sat.reduce((s, m) => s + m, 0) / sat.length) : null;
  const taken = bills.reduce((s, b) => s + Number(b.total), 0);
  const H = ({ Icon, children }: { Icon: typeof Clock; children: React.ReactNode }) => <div className="flex items-center gap-2 mb-2.5 text-[12px] font-bold uppercase tracking-[.1em] text-steel"><Icon size={14} aria-hidden />{children}</div>;
  return (
    <div className="space-y-5" data-table-detail={t.name}>
      {/* the facts */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[["State", <span key="s" className="inline-flex items-center gap-1.5" style={{ color: `var(${ST[st].hue})` }}><span className="h-2 w-2 rounded-full" style={{ background: "currentColor" }} />{ST[st].label}</span>],
          ["Zone", t.zone || "Main"], ["Seats", <span key="c" className="num">{t.capacity}</span>], ["Table ordering", qrUrl ? "On" : "Off"]].map(([k, v]) => (
          <div key={k as string} className="rounded-2xl bg-[var(--color-fill)] px-3 py-2.5 min-w-0"><div className="text-[11.5px] font-semibold text-steel">{k}</div><div className="text-[15px] font-bold mt-0.5 truncate">{v}</div></div>))}
      </div>

      {/* now */}
      <section>
        <H Icon={ClipboardList}>Now</H>
        {o ? (
          <div className="rounded-2xl border border-[var(--color-separator)] overflow-hidden">
            <div className="px-3.5 py-3 flex flex-wrap items-center gap-x-3 gap-y-1 bg-[var(--color-fill)]">
              <span className="font-bold num">Order #{o.order_no}</span>
              {o.customer_name && <span className="text-[13px] text-[var(--color-label-2)] truncate">{o.customer_name}</span>}
              <span className="ml-auto text-[12.5px] text-steel num inline-flex items-center gap-1" suppressHydrationWarning><Clock size={13} aria-hidden />since {hm(o.created_at)} · {fmtSince(o.created_at)}</span>
              {o.created_by && <span className="w-full text-[12px] text-steel">Taken by {names[o.created_by] ?? "—"}</span>}
            </div>
            <ul className="divide-y divide-[var(--color-separator)]">
              {items.map((i) => (
                <li key={i.id} className="px-3.5 py-2.5 flex items-center gap-3 text-[13.5px] min-w-0">
                  <span className="num font-bold w-7 shrink-0">{Number(i.qty)}×</span>
                  <span className="min-w-0 flex-1 truncate">{i.name_snapshot}{i.variant_name ? <span className="text-steel"> · {i.variant_name}</span> : null}</span>
                  <span className="shrink-0 text-[11.5px] font-semibold px-2 h-6 rounded-full inline-flex items-center bg-[var(--color-fill)] text-[var(--color-label-2)]">{ITEM_ST[i.status] ?? i.status}</span>
                  <span className="shrink-0 num font-semibold w-16 text-right">{formatINR(Number(i.qty) * Number(i.price_snapshot), { whole: true })}</span>
                </li>))}
              {items.length === 0 && <li className="px-3.5 py-3 text-[13px] text-steel">Nothing on the order yet.</li>}
            </ul>
            <div className="px-3.5 py-3 flex items-center justify-between border-t border-[var(--color-separator)]"><span className="text-[13px] font-semibold text-steel">{o.bills?.some((b) => b.status === "unpaid") ? "Bill out — waiting to be paid" : "Running total"}</span><span className="font-display num text-[22px]">{formatINR(amountOf(o))}</span></div>
          </div>
        ) : <p className="rounded-2xl border border-dashed border-[var(--color-separator)] px-4 py-4 text-[13.5px] text-[var(--color-label-2)]">{clean ? "Waiting to be cleaned before the next party." : "Nobody is at this table — it is ready to seat."}</p>}
      </section>

      {/* cleaning */}
      {clean && <section><H Icon={SprayCan}>Cleaning</H>
        <div className="rounded-2xl bg-[color-mix(in_srgb,var(--color-cyan)_10%,transparent)] px-3.5 py-3 text-[13.5px] flex items-center gap-2"><SprayCan size={16} className="text-[var(--color-cyan)]" aria-hidden />{clean.status === "in_progress" ? `${clean.taken_by ? names[clean.taken_by] ?? "Someone" : "Someone"} is cleaning it` : "Waiting for someone to clean it"}<span className="ml-auto text-steel num text-[12.5px]" suppressHydrationWarning>{fmtSince(clean.created_at)}</span></div>
      </section>}

      {/* bookings today */}
      <section>
        <H Icon={CalendarClock}>Bookings today</H>
        {bookings.length ? <ul className="space-y-2">{bookings.map((b) => (
          <li key={b.id} className="rounded-2xl bg-[var(--color-fill)] px-3.5 py-2.5 flex items-center gap-3 min-w-0">
            <span className="font-display num text-[18px] w-[4.5rem] shrink-0">{clock(b.at_time)}</span>
            <div className="min-w-0 flex-1 leading-tight"><div className="font-semibold truncate">{b.guest_name}</div><div className="text-[12px] text-steel truncate">party of <span className="num">{b.party_size}</span>{b.occasion ? ` · ${b.occasion}` : ""}</div></div>
            <span className={cn("shrink-0 text-[11.5px] font-bold px-2 h-6 rounded-full inline-flex items-center", b.status === "seated" ? "bg-[var(--color-green-2)] text-[var(--color-green)]" : "bg-[color-mix(in_srgb,var(--color-violet)_15%,transparent)] text-[var(--color-violet)]")}>{b.status === "seated" ? <><Check size={12} className="mr-1" />Seated</> : b.status === "requested" ? "Requested" : "Confirmed"}</span>
            {b.guest_phone && <a href={`tel:${b.guest_phone}`} aria-label={`Call ${b.guest_name}`} className="shrink-0 h-10 w-10 grid place-items-center rounded-full bg-[var(--color-bg-2)]"><Phone size={15} /></a>}
          </li>))}</ul> : <p className="text-[13.5px] text-steel">No booking on this table today.</p>}
      </section>

      {/* today at this table */}
      <section>
        <H Icon={Receipt}>Today at this table</H>
        <div className="grid grid-cols-3 gap-2 mb-2.5">
          {[["Bills", `${bills.length}`], ["Taken", formatINR(taken, { whole: true })], ["A sitting", avgSit ? `${avgSit} min` : "—"]].map(([k, v]) => (
            <div key={k} className="rounded-2xl bg-[var(--color-fill)] px-3 py-2.5 min-w-0"><div className="text-[11.5px] font-semibold text-steel">{k}</div><div className="font-display num text-[19px] mt-0.5 truncate">{v}</div></div>))}
        </div>
        {bills.length > 0 && <ul className="divide-y divide-[var(--color-separator)] text-[13px]">{bills.slice(0, 8).map((b) => (
          <li key={b.id} className="py-2 flex items-center gap-3"><span className="num font-semibold">Bill #{b.bill_no}</span><span className="text-steel num">{hm(b.paid_at)}</span><span className="ml-auto num font-bold">{formatINR(Number(b.total))}</span></li>))}</ul>}
      </section>

      {/* the table's own QR */}
      {qrUrl && <section><H Icon={QrCode}>Table ordering QR</H>
        <div className="flex items-center gap-4 rounded-2xl bg-[var(--color-fill)] p-3">
          <div className="rounded-xl bg-white p-2 shrink-0"><QR value={qrUrl} size={96} /></div>
          <div className="min-w-0 text-[13px] text-[var(--color-label-2)] leading-snug">Guests scan this at {t.name} to see the menu and order from their phone.<a href={qrUrl} target="_blank" rel="noreferrer" className="mt-1.5 block font-semibold text-[var(--color-tint)] truncate">Open the table menu</a></div>
        </div>
      </section>}

      {/* the moves — the dialog's pinned footer */}
      <div className="flex gap-2">
        <Link href={`/orders/new?table=${t.id}`} className="svc-btn go flex-1"><Plus size={18} aria-hidden />{o ? "Add items" : "Take order"}</Link>
        {o && <Link href={`/billing/${o.id}`} className="svc-btn quiet flex-1"><Receipt size={17} aria-hidden />Bill</Link>}
      </div>
    </div>
  );
}
