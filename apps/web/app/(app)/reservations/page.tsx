import { aiEnabled } from "@/lib/ai";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { todayIST } from "@/lib/format";
import { ReservationsClient } from "./ReservationsClient";
export const metadata = { title: "Reservations" };
export const dynamic = "force-dynamic";

export default async function Reservations({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date } = await searchParams; const s = await createClient();
  const day = date ?? todayIST();
  /* The whole month the chosen day sits in, for the grid. Only the four fields a cell draws —
     a month of bookings is small, and asking for it here keeps the page to one round trip. */
  const [y, m] = day.split("-").map(Number);
  const from = `${day.slice(0, 8)}01`;
  const to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  // the session travels with the page's own rows, not in front of them: one trip, not two
  const [session, { data: list }, { data: tables }, { data: reviews }, { data: month }] = await Promise.all([
    requireSession(),
    s.from("reservations").select("*").eq("on_date", day).order("at_time"),
    s.from("dining_tables").select("id, name, capacity, status").order("sort_order"),
    s.from("reviews").select("*").order("created_at", { ascending: false }).limit(10),
    s.from("reservations").select("id, on_date, at_time, guest_name, party_size, status").gte("on_date", from).lte("on_date", to).order("at_time"),
  ]);
  return <ReservationsClient day={day} list={(list ?? []) as never} tables={tables ?? []} reviews={(reviews ?? []) as never} month={(month ?? []) as never} ai={aiEnabled()} restaurant={session.restaurant.name} />;
}
