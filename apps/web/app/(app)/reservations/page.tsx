import { aiEnabled } from "@/lib/ai";
import { createClient } from "@/lib/supabase/server";
import { holdDue } from "@/lib/holdDue";
import { requireSession } from "@/lib/auth";
import { todayIST } from "@/lib/format";
import { ReservationsClient } from "./ReservationsClient";
export const metadata = { title: "Reservations" };
export const dynamic = "force-dynamic";

const plus = (d: string, n: number) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

export default async function Reservations({ searchParams }: { searchParams: Promise<{ date?: string; new?: string; stay?: string }> }) {
  const { date, new: fresh, stay } = await searchParams; const s = await createClient(); const held = holdDue(s);   // a booking due now holds its table or room (0154)
  const today = todayIST(); const day = date ?? today;
  /* The whole month the chosen day sits in, for the grid. Only the four fields a cell draws —
     a month of bookings is small, and asking for it here keeps the page to one round trip. */
  const [y, m] = day.split("-").map(Number);
  const from = `${day.slice(0, 8)}01`;
  const to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  /* the strip of days over the list: this week from today, or from the chosen day when it is further out */
  const start = day >= today && day <= plus(today, 6) ? today : day;
  // the session travels with the page's own rows, not in front of them: one trip, not two
  const [session, { data: list }, { data: tables }, { data: reviews }, { data: month }, { data: week }, { data: inHouse }, { data: cleans }, { data: running }, { data: taken }] = await Promise.all([
    requireSession(),
    // a booking for someone staying names their stay (0157): its room and guest come with it
    s.from("reservations").select("*, stay:booking_id(id, rooms(number), guests(full_name))").eq("on_date", day).order("at_time"),
    s.from("dining_tables").select("id, name, capacity, status").order("sort_order"),
    s.from("reviews").select("*").order("created_at", { ascending: false }).limit(10),
    s.from("reservations").select("id, on_date, at_time, guest_name, party_size, status").gte("on_date", from).lte("on_date", to).order("at_time"),
    s.from("reservations").select("on_date, status").gte("on_date", start).lte("on_date", plus(start, 6)),
    // who is staying now, for New booking's Room (a restaurant has none)
    s.from("bookings").select("id, rooms(number), guests(full_name, phone)").eq("status", "checked_in").order("check_in"),
    // 0166: Seat now offers only a free table — not one being cleaned, not one with an order open on it
    s.from("table_cleanings").select("table_id").in("status", ["pending", "in_progress"]),
    s.from("orders").select("table_id").eq("status", "open").not("table_id", "is", null),
    // New booking offers only a free table (2026-11-04, the owner): every live booking from today that has a table, so a table
    // already booked near the chosen time is left out whatever day the sheet is set to
    s.from("reservations").select("id, table_id, on_date, at_time").gte("on_date", today).in("status", ["requested", "confirmed", "seated"]).not("table_id", "is", null).limit(1000),
  ]);
  const busy = new Map<string, "cleaning" | "order">();
  for (const o of (running ?? []) as { table_id: string }[]) busy.set(o.table_id, "order");
  for (const c of (cleans ?? []) as { table_id: string }[]) busy.set(c.table_id, "cleaning");
  const seatable = ((tables ?? []) as { id: string; name: string; capacity: number; status: string }[]).map((t) => ({ ...t, busy: busy.get(t.id) ?? null }));
  /* who is staying now, for New booking's Room (2026-10-30, the owner: "show the Room option too"): a hotel or resort only */
  const rooms = session.restaurant.property_type !== "restaurant";
  const stays = ((rooms ? inHouse ?? [] : []) as unknown as { id: string; rooms: { number: string } | null; guests: { full_name: string; phone: string | null } | null }[])
    .map((b) => ({ id: b.id, room: b.rooms?.number ?? "", guest: b.guests?.full_name ?? "", phone: b.guests?.phone ?? "" })).sort((a, b) => a.room.localeCompare(b.room, "en", { numeric: true }));
  const days = Array.from({ length: 7 }, (_, i) => { const d = plus(start, i); return { date: d, n: (week ?? []).filter((r) => r.on_date === d && r.status !== "cancelled" && r.status !== "no_show").length }; });
  await held;
  return <ReservationsClient day={day} today={today} days={days} list={(list ?? []) as never} tables={seatable} reviews={(reviews ?? []) as never} month={(month ?? []) as never} ai={aiEnabled()} restaurant={session.restaurant.name}
    stays={stays} openNew={fresh ? { stay: stay ?? "" } : null} taken={(taken ?? []) as never} />;
}
