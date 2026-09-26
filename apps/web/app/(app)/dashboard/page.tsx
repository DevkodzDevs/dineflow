import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { formatINR, todayIST } from "@/lib/format";
import { Live } from "./Live";
import { Sun, BedDouble, ConciergeBell, Sparkles, Bike, Timer, Boxes, ChevronRight, type LucideIcon } from "lucide-react";
import { Board } from "./Board";
export const metadata = { title: "Control room" };
export const dynamic = "force-dynamic";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ locked?: string }> }) {
  const s = await createClient();
  const today = todayIST();
  // The session travels with the page's own rows rather than in front of them: one round trip
  // to Mumbai, not two. The rooms queries are asked unconditionally — a restaurant has none, so
  // they come back empty, and waiting to learn which kind of property this is cost more than
  // the empty answers do.
  const [session, { data: bills }, { data: open }, { data: kots }, { data: low }, { data: tables }, { data: top }, { data: rooms }, { data: bookings }, { data: hk }, { data: online }] = await Promise.all([
    requireSession(),
    s.from("bills").select("total, payments(method, amount)").eq("status", "paid").gte("paid_at", `${today}T00:00:00+05:30`),
    s.from("orders").select("id, order_no, created_at, type, customer_name, dining_tables(name), order_items(qty, price_snapshot, status)").eq("status", "open"),
    s.from("kots").select("id, status, created_at").in("status", ["pending", "preparing", "ready"]),
    s.from("v_low_stock").select("id, name, unit, current_stock, reorder_level").limit(8),
    s.from("dining_tables").select("status"),
    s.from("order_items").select("name_snapshot, qty").gte("created_at", `${today}T00:00:00+05:30`).neq("status", "cancelled"),
    s.from("rooms").select("status"),
    s.from("bookings").select("id, status, check_in, check_out, rate, rooms(number), guests(full_name)").in("status", ["reserved", "checked_in"]),
    s.from("housekeeping_tasks").select("id", { count: "exact", head: true }).neq("status", "done"),
    s.from("online_orders").select("id, status, gross").gte("placed_at", `${today}T00:00:00+05:30`),
  ]);
  const hotel = session.restaurant.property_type !== "restaurant";   // decides what is drawn, not what is asked
  const sales = (bills ?? []).reduce((t, b) => t + Number(b.total), 0);
  const inHouse = (bookings ?? []).filter((b: { status: string }) => b.status === "checked_in");
  const roomRevenue = inHouse.reduce((t: number, b: { rate: number }) => t + Number(b.rate), 0);
  const arrivals = (bookings ?? []).filter((b: { status: string; check_in: string }) => b.status === "reserved" && b.check_in <= today);
  const departures = inHouse.filter((b: { check_out: string }) => b.check_out <= today);
  const occ = rooms?.length ? Math.round((rooms.filter((r) => r.status === "occupied").length / rooms.length) * 100) : 0;
  const ready = rooms?.filter((r) => r.status === "available").length ?? 0;
  const topMap = new Map<string, number>(); (top ?? []).forEach((i) => topMap.set(i.name_snapshot, (topMap.get(i.name_snapshot) ?? 0) + i.qty));
  const topList = [...topMap].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const occupied = (tables ?? []).filter((t) => t.status === "occupied").length;
  const hour = new Date(Date.now() + 5.5 * 3600e3).getUTCHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const late = (kots ?? []).filter((k) => Date.now() - new Date(k.created_at).getTime() > 15 * 60000 && k.status !== "ready").length;
  const hkCount = (hk as { count?: number | null })?.count ?? 0;
  const onFloor = (open ?? []).reduce((t, o) => t + (o.order_items as { qty: number; price_snapshot: number; status: string }[]).filter((i) => i.status !== "cancelled").reduce((x, i) => x + i.qty * Number(i.price_snapshot), 0), 0);

  return (
    <Live>
      {(await searchParams)?.locked && <div className="feather p-4 mb-6 text-sm flex items-center gap-3"><span className="h-9 w-9 rounded-xl bg-[var(--color-fill)] grid place-items-center">🔒</span><div><b>That section isn't switched on for this property.</b> <span className="text-steel">The master controls which modules each property can open. Ask them if you need it.</span></div></div>}
      <Board
        greet={`${greet}, ${session.profile.full_name.split(" ")[0]}`} property={session.restaurant.name}
        tiles={hotel
          ? [{ value: occ, label: "% full", href: "/rooms", tone: occ >= 80 ? "live" : undefined }, { value: open?.length ?? 0, label: "orders", href: "/orders" }, { value: kots?.length ?? 0, label: "in kitchen", href: "/kitchen", tone: late ? "alert" : undefined }]
          : [{ value: `${occupied}/${tables?.length ?? 0}`, label: "tables", href: "/orders" }, { value: open?.length ?? 0, label: "orders", href: "/orders" }, { value: kots?.length ?? 0, label: "in kitchen", href: "/kitchen", tone: late ? "alert" : undefined }]}
        money={formatINR(sales + roomRevenue)} moneySub={hotel ? `dining ${formatINR(sales)} · rooms ${formatINR(roomRevenue)} tonight · ${formatINR(onFloor)} still on the floor` : `${(bills ?? []).length} bills settled · ${formatINR(onFloor)} still on the floor`} />
      {hour >= 17 && (
        <Link href="/tomorrow" className="feather feather-lift edge-lit flex items-center gap-4 p-5 mb-4 bg-gradient-to-r from-card to-champagne-2/50 border-champagne/50">
          <span className="h-11 w-11 rounded-2xl bg-gradient-to-b from-saffron-2 to-saffron text-ink grid place-items-center shrink-0"><Sun size={20} /></span>
          <div className="flex-1 min-w-0"><div className="font-semibold">Before you lock up — tomorrow&apos;s brief is ready</div><div className="text-xs text-steel">What to prep, what to buy, and how many covers to expect.</div></div>
          <span className="text-sm font-semibold text-steel">Open →</span>
        </Link>
      )}
      {/* The glance row: whatever needs a person right now, biggest first. The tiles
          size themselves — three of them or six, the row always fills the width. */}
      <div className="stat-row">
        {hotel && <Tile href="/rooms" icon={BedDouble} label="Occupancy" value={occ} unit="%" meter={occ} tone={occ >= 80 ? "good" : undefined}
          sub={`${inHouse.length} in house · ${ready} ready`} />}
        {hotel && <Tile href="/frontdesk" icon={ConciergeBell} label="Front desk" tone={arrivals.length + departures.length === 0 ? "good" : undefined}
          value={<>{arrivals.length}<span className="stat-unit">in</span><span className="stat-sep">·</span>{departures.length}<span className="stat-unit">out</span></>}
          sub={arrivals.length ? "Waiting to check in" : departures.length ? "Due to check out" : "Nothing due today"} />}
        {hotel && <Tile href="/housekeeping" icon={Sparkles} label="Housekeeping" value={hkCount} tone={hkCount > 3 ? "alert" : hkCount ? "warn" : "good"}
          sub={hkCount ? "Rooms still to turn" : "All rooms ready"} />}
        {(online ?? []).length > 0 && <Tile href="/online-orders" icon={Bike} label="Online orders" value={(online ?? []).filter((o) => o.status === "new").length}
          tone={(online ?? []).some((o) => o.status === "new") ? "alert" : undefined} sub={`${formatINR((online ?? []).reduce((t, o) => t + Number(o.gross), 0))} today`} />}
        {late > 0 && <Tile href="/kitchen" icon={Timer} label="Running late" value={late} tone="alert" sub="Tickets over 15 minutes" />}
        <Tile href="/inventory" icon={Boxes} label="Low stock" value={low?.length ?? 0} tone={low?.length ? "alert" : "good"}
          sub={low?.length ? low.slice(0, 2).map((l) => l.name).join(", ") : "Pantry healthy"} />
      </div>
      <div className="grid gap-4 mt-4 lg:grid-cols-3 2xl:grid-cols-4">
        <div className="feather p-5 lg:col-span-2 2xl:col-span-3">
          <div className="flex items-center justify-between mb-3"><h3 className="text-xl">Live floor</h3><Link href="/orders" className="text-xs font-semibold text-steel hover:text-ink">Open orders →</Link></div>
          {!open?.length ? <p className="text-sm text-steel">No open orders right now.</p> : (
            <div className="grid sm:grid-cols-2 gap-2">
              {open.map((o) => { const t = o.dining_tables as unknown as { name: string } | null; const items = o.order_items as { qty: number; price_snapshot: number; status: string }[]; const live = items.filter((i) => i.status !== "cancelled");
                return <Link key={o.id} href={`/orders/${o.id}`} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5 hover:bg-porcelain"><span className="font-display text-lg w-10">{t?.name ?? (o.type === "room_service" ? "RS" : "TA")}</span><span className="text-sm flex-1 truncate">#{o.order_no} · {live.reduce((a, i) => a + i.qty, 0)} items{o.type === "room_service" && o.customer_name ? ` · ${o.customer_name}` : ""}</span><span className={`h-2 w-2 rounded-full ${live.some((i) => i.status === "ready") ? "bg-mint" : live.some((i) => i.status === "preparing") ? "bg-saffron" : "bg-line"}`} /><span className="num text-sm font-semibold">{formatINR(live.reduce((a, i) => a + i.qty * Number(i.price_snapshot), 0))}</span></Link>; })}
            </div>
          )}
          {hotel && inHouse.length > 0 && <div className="mt-5 pt-4 border-t border-line"><div className="flex items-center justify-between mb-2"><h3 className="text-lg">In house tonight</h3><Link href="/frontdesk" className="text-xs font-semibold text-steel hover:text-ink">Front desk →</Link></div>
            <div className="flex flex-wrap gap-2">{(inHouse as unknown as { id: string; rooms: { number: string } | null; guests: { full_name: string } | null; check_out: string }[]).slice(0, 12).map((b) => <Link key={b.id} href={`/frontdesk/${b.id}`} className={`keycard occupied px-3 py-2 text-xs ${b.check_out <= today ? "ring-2 ring-chili/50" : ""}`}><span className="font-display text-base">{b.rooms?.number}</span> <span className="text-white/70">{b.guests?.full_name?.split(" ")[0]}</span></Link>)}</div></div>}
        </div>
        <div className="feather p-5">
          <h3 className="text-xl mb-3">Selling today</h3>
          {topList.length === 0 ? <p className="text-sm text-steel">Nothing sold yet.</p> : <ol className="space-y-2">{topList.map(([name, q], i) => <li key={name} className="flex items-center gap-3 text-sm"><span className="num text-steel w-4">{i + 1}</span><span className="flex-1 truncate">{name}</span><span className="num font-semibold">{q}</span></li>)}</ol>}
          {!!low?.length && <div className="mt-5 pt-4 border-t border-line"><div className="text-xs font-semibold uppercase tracking-wide text-chili mb-2">Reorder now</div><ul className="space-y-1 text-sm">{low.map((l) => <li key={l.id} className="flex justify-between"><span>{l.name}</span><span className="num text-steel">{Number(l.current_stock).toFixed(1)} {l.unit}</span></li>)}</ul></div>}
        </div>
      </div>
    </Live>
  );
}

function Tile({ href, icon: Icon, label, value, unit, sub, tone, meter }: {
  href: string; icon: LucideIcon; label: string; value: React.ReactNode; unit?: string;
  sub: string; tone?: "good" | "warn" | "alert"; meter?: number;
}) {
  /* Head, number, foot — in that order, and the foot is pinned to the bottom so every
     tile in the row lines up whether its caption runs to one line or two. The meter
     only appears where the number really is a share of something (occupancy is; a
     count of low-stock items is not), because a bar with no denominator is a lie. */
  return (
    <Link href={href} className={`feather feather-lift stat${tone ? ` stat-${tone}` : ""}`}>
      <div className="stat-head">
        <span className="stat-chip"><Icon size={15} strokeWidth={2} /></span>
        <span className="stat-label">{label}</span>
        <ChevronRight size={15} className="stat-go" />
      </div>
      <div className="stat-value num">{value}{unit && <span className="stat-unit">{unit}</span>}</div>
      <div className="stat-base">
        {meter !== undefined && <span className="stat-meter"><i style={{ width: `${Math.min(100, Math.max(0, meter))}%` }} /></span>}
        <div className="stat-foot"><span className="stat-dot" /><span className="stat-sub">{sub}</span></div>
      </div>
    </Link>
  );
}
