import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { formatINR, todayIST } from "@/lib/format";
import { Live } from "./Live";
import { Sun } from "lucide-react";
import { Overview, type Flap, type LiveRow, type Money, type Rank, type Tile, type Tx, type Who } from "./Overview";

export const metadata = { title: "Control room" };
export const dynamic = "force-dynamic";

const IST = 5.5 * 3600e3;
/** "Mon" for an instant, counted in the only timezone this property trades in. */
const istDay = (iso: string) => new Date(new Date(iso).getTime() + IST).toISOString().slice(0, 10);

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ locked?: string }> }) {
  const s = await createClient();
  const today = todayIST();
  const weekAgo = new Date(Date.now() + IST - 6 * 86400e3).toISOString().slice(0, 10);
  // The session travels with the page's own rows rather than in front of them: one round trip
  // to Mumbai, not two. The rooms queries are asked unconditionally — a restaurant has none, so
  // they come back empty, and waiting to learn which kind of property this is cost more than
  // the empty answers do.
  const [session, { data: bills }, { data: open }, { data: kots }, { data: low }, { data: tables }, { data: top }, { data: rooms }, { data: bookings }, { data: hk }, { data: online }, { data: week }, { data: recent }, { data: staff }] = await Promise.all([
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
    // the week behind today, for the takings curve — seven points, one query
    s.from("bills").select("total, paid_at").eq("status", "paid").gte("paid_at", `${weekAgo}T00:00:00+05:30`),
    // the last few settlements, newest first
    s.from("bills").select("id, bill_no, total, paid_at, payments(method)").eq("status", "paid").order("paid_at", { ascending: false }).limit(6),
    // who else is on the books, for the faces on the board
    s.from("profiles").select("id, full_name, role").neq("role", "owner").limit(9),
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
  const dishes: Rank[] = [...topMap].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, value]) => ({ name, value }));
  const occupied = (tables ?? []).filter((t) => t.status === "occupied").length;
  const hour = new Date(Date.now() + IST).getUTCHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const late = (kots ?? []).filter((k) => Date.now() - new Date(k.created_at).getTime() > 15 * 60000 && k.status !== "ready").length;
  const hkCount = (hk as { count?: number | null })?.count ?? 0;
  const onlineGross = (online ?? []).reduce((t, o) => t + Number(o.gross), 0);
  const onFloor = (open ?? []).reduce((t, o) => t + (o.order_items as { qty: number; price_snapshot: number; status: string }[]).filter((i) => i.status !== "cancelled").reduce((x, i) => x + i.qty * Number(i.price_snapshot), 0), 0);

  /* Seven labelled days, oldest first, so the curve always has the same number of points
     whether the property traded every day or only twice. */
  const byDay = new Map<string, number>();
  for (const b of (week ?? []) as { total: number; paid_at: string }[]) {
    const k = istDay(b.paid_at); byDay.set(k, (byDay.get(k) ?? 0) + Number(b.total));
  }
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() + IST - (6 - i) * 86400e3);
    const key = d.toISOString().slice(0, 10);
    return { day: d.toLocaleDateString("en-IN", { weekday: "short", timeZone: "UTC" }).slice(0, 2), value: byDay.get(key) ?? 0 };
  });

  const parts: Money[] = hotel
    ? [{ label: "Dining", value: sales, tone: "mint" }, { label: "Rooms tonight", value: roomRevenue, tone: "amber" }, { label: "Online", value: onlineGross, tone: "sky" }]
    : [{ label: "Dining", value: sales - onlineGross > 0 ? sales - onlineGross : sales, tone: "mint" }, { label: "Online", value: onlineGross, tone: "amber" }, { label: "On the floor", value: onFloor, tone: "sky" }];

  /* The three the split-flap tiles carry — the same three the old board showed, because they are
     the ones worth reading from the pass rather than from a chair. */
  const flaps: Flap[] = hotel
    ? [{ value: occ, label: "% full", href: "/rooms", tone: occ >= 80 ? "live" : undefined },
       { value: open?.length ?? 0, label: "orders", href: "/orders" },
       { value: kots?.length ?? 0, label: "in kitchen", href: "/kitchen", tone: late ? "alert" : undefined }]
    : [{ value: `${occupied}/${tables?.length ?? 0}`, label: "tables", href: "/orders" },
       { value: open?.length ?? 0, label: "orders", href: "/orders" },
       { value: kots?.length ?? 0, label: "in kitchen", href: "/kitchen", tone: late ? "alert" : undefined }];

  /* A helper only so each branch of the ternaries below is typed as it is written: without a
     contextual type the string literals widen and "mint" stops being a Tone. */
  const tile = (t: Tile): Tile => t;
  const tiles: Tile[] = [
    hotel
      ? tile({ icon: "BedDouble", label: "Occupancy", value: `${occ}%`, sub: `${inHouse.length} in house · ${ready} ready`, tone: occ >= 80 ? "mint" : "plain", href: "/rooms" })
      : tile({ icon: "Users", label: "Tables", value: `${occupied}/${tables?.length ?? 0}`, sub: `${open?.length ?? 0} open orders`, tone: occupied ? "mint" : "plain", href: "/orders" }),
    hotel
      ? tile({ icon: "ConciergeBell", label: "Front desk", value: `${arrivals.length} in · ${departures.length} out`, sub: arrivals.length ? "Waiting to check in" : departures.length ? "Due to check out" : "Nothing due today", tone: arrivals.length + departures.length ? "amber" : "plain", href: "/frontdesk" })
      : tile({ icon: "Bike", label: "Online orders", value: (online ?? []).filter((o) => o.status === "new").length, sub: `${formatINR(onlineGross)} today`, tone: (online ?? []).some((o) => o.status === "new") ? "chili" : "plain", href: "/online-orders" }),
    ...(hotel ? [tile({ icon: "Sparkles", label: "Housekeeping", value: hkCount, sub: hkCount ? "Rooms still to turn" : "All rooms ready", tone: hkCount > 3 ? "chili" : hkCount ? "amber" : "plain", href: "/housekeeping" })] : []),
    tile({ icon: "Timer", label: "Running late", value: late, sub: late ? "Tickets over 15 minutes" : "Kitchen is on time", tone: late ? "chili" : "plain", href: "/kitchen" }),
    tile({ icon: "Boxes", label: "Low stock", value: low?.length ?? 0, sub: low?.length ? low.slice(0, 2).map((l) => l.name).join(", ") : "Pantry healthy", tone: low?.length ? "chili" : "plain", href: "/inventory" }),
  ];

  const floor: LiveRow[] = (open ?? []).map((o) => {
    const items = (o.order_items as { qty: number; price_snapshot: number; status: string }[]).filter((i) => i.status !== "cancelled");
    return {
      id: o.id as string,
      where: ((o.dining_tables as unknown as { name: string } | null)?.name) ?? (o.customer_name as string) ?? String(o.type).replace("_", " "),
      items: items.reduce((t, i) => t + i.qty, 0),
      total: items.reduce((t, i) => t + i.qty * Number(i.price_snapshot), 0),
      href: `/orders/${o.id as string}`,
    };
  });

  /* the same shape for the other two tabs, so one list renders all three */
  const roomRows: LiveRow[] = (inHouse as unknown as { id: string; rate: number; rooms: { number: string } | null; guests: { full_name: string } | null }[])
    .map((b) => ({ id: b.id, where: b.rooms?.number ?? "—", items: 1, total: Number(b.rate), href: `/frontdesk/${b.id}` }));
  const webRows: LiveRow[] = ((online ?? []) as unknown as { id: string; status: string; gross: number }[])
    .filter((o) => !["rejected", "picked_up"].includes(o.status))
    .map((o) => ({ id: o.id, where: o.status === "new" ? "new" : o.status.slice(0, 4), items: 1, total: Number(o.gross), href: "/online-orders" }));

  const tx: Tx[] = ((recent ?? []) as unknown as { id: string; bill_no: number; total: number; paid_at: string; payments: { method: string }[] }[])
    .map((b) => ({ id: b.id, no: b.bill_no, total: Number(b.total), at: b.paid_at, method: b.payments?.[0]?.method ?? null }));
  const rota: Who[] = ((staff ?? []) as { id: string; full_name: string; role: string }[]).map((p) => ({ id: p.id, name: p.full_name, role: p.role }));

  return (
    <Live>
      {(await searchParams)?.locked && <div className="feather p-4 mb-4 text-sm flex items-center gap-3"><span className="h-9 w-9 rounded-xl bg-[var(--color-fill)] grid place-items-center">🔒</span><div><b>That section isn&apos;t switched on for this property.</b> <span className="text-steel">The master controls which modules each property can open. Ask them if you need it.</span></div></div>}
      <Overview
        greet={`${greet}, ${session.profile.full_name.split(" ")[0]}`}
        property={session.restaurant.name}
        owner={session.profile.full_name}
        money={sales + roomRevenue}
        parts={parts}
        tiles={tiles}
        flaps={flaps}
        dishes={dishes}
        tx={tx}
        staff={rota}
        days={days}
        floor={floor}
        rooms={roomRows}
        web={webRows}
        onFloor={onFloor}
        kitchen={kots?.length ?? 0}
      />
      {hour >= 17 && (
        <Link href="/tomorrow" className="feather feather-lift edge-lit flex items-center gap-4 p-5 mt-4 bg-gradient-to-r from-card to-champagne-2/50 border-champagne/50">
          <span className="h-11 w-11 rounded-2xl bg-gradient-to-b from-saffron-2 to-saffron text-ink grid place-items-center shrink-0"><Sun size={20} /></span>
          <div className="flex-1 min-w-0"><div className="font-semibold">Before you lock up — tomorrow&apos;s brief is ready</div><div className="text-xs text-steel">What to prep, what to buy, and how many covers to expect.</div></div>
          <span className="text-sm font-semibold text-steel">Open →</span>
        </Link>
      )}
    </Live>
  );
}
