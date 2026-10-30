import { createClient } from "@/lib/supabase/server";
import { holdDue } from "@/lib/holdDue";
import { requireSession } from "@/lib/auth";
import { PageHeader } from "@/components/shell/PageHeader";
import { todayIST } from "@/lib/format";
import { modulesFor } from "@dineflow/shared";
import { FrontDeskClient } from "./FrontDeskClient";
export const metadata = { title: "Front desk" };
export const dynamic = "force-dynamic";
export default async function FrontDesk() {
  const s = await createClient(); const today = todayIST(); const held = holdDue(s);   // a booking due now holds its table or room (0154)
  // the session is fetched alongside the rows, not in front of them — one round trip, not two
  const [session, { data: bookings }, { data: rooms }, { data: types }, { data: guests }, { data: tableBookings }] = await Promise.all([
    requireSession(),
    s.from("bookings").select("*, guests(full_name, phone, vip, preferences), rooms(number, floor, condition, room_types(name))").in("status", ["reserved", "checked_in"]).order("check_in"),
    s.from("rooms").select("id, number, floor, status, condition, room_type_id, room_types(name, base_rate, capacity)").order("sort_order"),
    s.from("room_types").select("*").eq("is_active", true),
    s.from("guests").select("id, full_name, phone, vip").order("created_at", { ascending: false }).limit(200),
    // today's table bookings (2026-10-30, the owner: "show the table reservations here too"), with the staying guest's room (0157)
    s.from("reservations").select("id, at_time, guest_name, party_size, status, table:table_id(name), stay:booking_id(rooms(number))").eq("on_date", today).in("status", ["requested", "confirmed", "seated"]).order("at_time"),
  ]);
  await held;
  return (
    <>
      <PageHeader eyebrow={session.restaurant.property_type === "resort" ? "Resort · reception" : "Hotel · reception"} title="Front" accent="desk" sub={`Check-in ${session.restaurant.check_in_time.slice(0, 5)} · Check-out ${session.restaurant.check_out_time.slice(0, 5)}`} />
      <FrontDeskClient today={today} bookings={(bookings ?? []) as never} rooms={(rooms ?? []) as never} types={types ?? []} guests={guests ?? []} inspectRule={!!session.restaurant.hk_inspect_required}
        tableBookings={(tableBookings ?? []) as never} canBook={modulesFor(session.restaurant.property_type, session.profile.role, session.restaurant.enabled_modules ?? null, session.profile.allowed_modules ?? null).includes("reservations")} />
    </>
  );
}
