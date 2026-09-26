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
  // the session travels with the page's own rows, not in front of them: one trip, not two
  const [, { data: list }, { data: tables }, { data: reviews }] = await Promise.all([
    requireSession(),
    s.from("reservations").select("*").eq("on_date", day).order("at_time"),
    s.from("dining_tables").select("id, name, capacity, status").order("sort_order"),
    s.from("reviews").select("*").order("created_at", { ascending: false }).limit(10),
  ]);
  return <ReservationsClient day={day} list={(list ?? []) as never} tables={tables ?? []} reviews={(reviews ?? []) as never} ai={aiEnabled()} />;
}
