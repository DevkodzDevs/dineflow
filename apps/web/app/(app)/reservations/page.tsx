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
  const [session, { data: list }, { data: tables }, { data: reviews }, { data: month }, { data: week }, { data: inHouse }] = await Promise.all([
    requireSession(),
    // a booking for someone staying names their stay (0157): its room and guest come with it
    s.from("reservations").select("*, stay:booking_id(id, rooms(number), guests(full_name))").eq("on_date", day).order("at_time"),
    s.from("dining_tables").select("id, name, capacity, status").order("sort_order"),
    s.from("reviews").select("*").order("created_at", { ascending: false }).limit(10),
    s.from("reservations").select("id, on_date, at_time, guest_name, party_size, status").gte("on_date", from).lte("on_date", to).order("at_time"),
    s.from("reservations").select("on_date, status").gte("on_date", start).lte("on_date", plus(start, 6)),
    // who is staying now, for New booking's Room (a restaurant has none)
    s.from("bookings").select("id, rooms(number), guests(full_name, phone)").eq("status", "checked_in").order("check_in"),
  ]);
  /* who is staying now, for New booking's Room (2026-10-30, the owner: "show the Room option too"): a hotel or resort only */
  const rooms = session.restaurant.property_type !== "restaurant";
  const stays = ((rooms ? inHouse ?? [] : []) as unknown as { id: string; rooms: { number: string } | null; guests: { full_name: string; phone: string | null } | null }[])
    .map((b) => ({ id: b.id, room: b.rooms?.number ?? "", guest: b.guests?.full_name ?? "", phone: b.guests?.phone ?? "" })).sort((a, b) => a.room.localeCompare(b.room, "en", { numeric: true }));
  const days = Array.from({ length: 7 }, (_, i) => { const d = plus(start, i); return { date: d, n: (week ?? []).filter((r) => r.on_date === d && r.status !== "cancelled" && r.status !== "no_show").length }; });
  await held;
  return <ReservationsClient day={day} today={today} days={days} list={(list ?? []) as never} tables={tables ?? []} reviews={(reviews ?? []) as never} month={(month ?? []) as never} ai={aiEnabled()} restaurant={session.restaurant.name}
    stays={stays} openNew={fresh ? { stay: stay ?? "" } : null} />;
}
