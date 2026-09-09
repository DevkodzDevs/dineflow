import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { PageHeader } from "@/components/shell/PageHeader";
import { todayIST } from "@/lib/format";
import { FrontDeskClient } from "./FrontDeskClient";
export const metadata = { title: "Front desk" };
export const dynamic = "force-dynamic";
export default async function FrontDesk() {
  const s = await createClient(); const session = await requireSession(); const today = todayIST();
  const [{ data: bookings }, { data: rooms }, { data: types }, { data: guests }] = await Promise.all([
    s.from("bookings").select("*, guests(full_name, phone), rooms(number, floor, room_types(name))").in("status", ["reserved", "checked_in"]).order("check_in"),
    s.from("rooms").select("id, number, floor, status, room_type_id, room_types(name, base_rate, capacity)").order("sort_order"),
    s.from("room_types").select("*").eq("is_active", true),
    s.from("guests").select("id, full_name, phone").order("created_at", { ascending: false }).limit(200),
  ]);
  return (
    <>
      <PageHeader eyebrow={session.restaurant.property_type === "resort" ? "Resort · reception" : "Hotel · reception"} title="Front" accent="desk" sub={`Check-in ${session.restaurant.check_in_time.slice(0, 5)} · Check-out ${session.restaurant.check_out_time.slice(0, 5)}`} />
      <FrontDeskClient today={today} bookings={(bookings ?? []) as never} rooms={(rooms ?? []) as never} types={types ?? []} guests={guests ?? []} />
    </>
  );
}
