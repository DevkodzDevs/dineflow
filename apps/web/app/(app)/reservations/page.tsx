import { aiEnabled } from "@/lib/ai";
import { createClient } from "@/lib/supabase/server";
import { holdDue } from "@/lib/holdDue";
import { requireSession } from "@/lib/auth";
import { todayIST } from "@/lib/format";
import { ReservationsClient } from "./ReservationsClient";
export const metadata = { title: "Reservations" };
export const dynamic = "force-dynamic";

const plus = (d: string, n: number) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

export default async function Reservations({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date } = await searchParams; const s = await createClient(); const held = holdDue(s);   // a booking due now holds its table or room (0154)
  const today = todayIST(); const day = date ?? today;
  /* The whole month the chosen day sits in, for the grid. Only the four fields a cell draws —
     a month of bookings is small, and asking for it here keeps the page to one round trip. */
  const [y, m] = day.split("-").map(Number);
  const from = `${day.slice(0, 8)}01`;
  const to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  /* the strip of days over the list: this week from today, or from the chosen day when it is further out */
  const start = day >= today && day <= plus(today, 6) ? today : day;
  // the session travels with the page's own rows, not in front of them: one trip, not two
  const [session, { data: list }, { data: tables }, { data: reviews }, { data: month }, { data: week }] = await Promise.all([
    requireSession(),
    s.from("reservations").select("*").eq("on_date", day).order("at_time"),
    s.from("dining_tables").select("id, name, capacity, status").order("sort_order"),
    s.from("reviews").select("*").order("created_at", { ascending: false }).limit(10),
    s.from("reservations").select("id, on_date, at_time, guest_name, party_size, status").gte("on_date", from).lte("on_date", to).order("at_time"),
    s.from("reservations").select("on_date, status").gte("on_date", start).lte("on_date", plus(start, 6)),
  ]);
  const days = Array.from({ length: 7 }, (_, i) => { const d = plus(start, i); return { date: d, n: (week ?? []).filter((r) => r.on_date === d && r.status !== "cancelled" && r.status !== "no_show").length }; });
  await held;
  return <ReservationsClient day={day} today={today} days={days} list={(list ?? []) as never} tables={tables ?? []} reviews={(reviews ?? []) as never} month={(month ?? []) as never} ai={aiEnabled()} restaurant={session.restaurant.name} />;
}
