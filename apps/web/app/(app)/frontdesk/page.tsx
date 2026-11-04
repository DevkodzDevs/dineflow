import { createClient } from "@/lib/supabase/server";
import { holdDue } from "@/lib/holdDue";
import { requireSession } from "@/lib/auth";
import { PageHeader } from "@/components/shell/PageHeader";
import { todayIST } from "@/lib/format";
import { modulesFor, gstCollectable } from "@dineflow/shared";
import { FrontDeskClient } from "./FrontDeskClient";
export const metadata = { title: "Front desk" };
export const dynamic = "force-dynamic";
export default async function FrontDesk({ searchParams }: { searchParams: Promise<{ new?: string; room?: string }> }) {
  const { new: fresh, room } = await searchParams;
  const s = await createClient(); const today = todayIST(); const held = holdDue(s);   // a booking due now holds its table or room (0154)
  // the session is fetched alongside the rows, not in front of them — one round trip, not two
  const [session, { data: bookings }, { data: rooms }, { data: types }, { data: guests }, { data: tableBookings }, { data: dtables }, { data: openOrders }, { data: cleanings }] = await Promise.all([
    requireSession(),
    s.from("bookings").select("*, guests(full_name, phone, vip, preferences), rooms(number, floor, condition, room_types(name))").in("status", ["reserved", "checked_in"]).order("check_in"),
    s.from("rooms").select("id, number, floor, status, condition, room_type_id, room_types(name, base_rate, capacity)").order("sort_order"),
    s.from("room_types").select("*").eq("is_active", true),
    s.from("guests").select("id, full_name, phone, vip, email, id_type, id_last4").order("created_at", { ascending: false }).limit(200),
    // today's table bookings (2026-10-30, the owner: "show the table reservations here too"), with the staying guest's room (0157)
    s.from("reservations").select("id, at_time, guest_name, party_size, status, table:table_id(name), stay:booking_id(rooms(number))").eq("on_date", today).in("status", ["requested", "confirmed", "seated"]).order("at_time"),
    // the dining room (2026-11-04): shown on the desk only where tables are set up
    s.from("dining_tables").select("id"),
    s.from("orders").select("table_id").eq("status", "open").not("table_id", "is", null),
    s.from("table_cleanings").select("table_id").in("status", ["pending", "in_progress"]),
  ]);
  await held;
  const r = session.restaurant;
  const ids = new Set((dtables ?? []).map((t: { id: string }) => t.id));
  const busy = new Set((openOrders ?? []).map((o: { table_id: string }) => o.table_id).filter((t) => ids.has(t)));
  const cleaning = new Set((cleanings ?? []).map((c: { table_id: string }) => c.table_id).filter((t) => ids.has(t) && !busy.has(t)));
  const tables = ids.size ? { total: ids.size, inUse: busy.size, cleaning: cleaning.size, free: ids.size - busy.size - cleaning.size } : null;
  // the GST the folio will add to the room (roomGstFor: the slab by the nightly rate), so Book a room shows the same total
  const tax = { on: gstCollectable(r.gst_scheme, r.gstin), low: Number(r.room_gst_rate ?? 5), high: Number(r.room_gst_rate_high ?? 18), threshold: Number(r.room_gst_threshold ?? 7500) };
  return (
    <>
      <PageHeader eyebrow={session.restaurant.property_type === "resort" ? "Resort · reception" : "Hotel · reception"} title="Front" accent="desk" sub={`Check-in ${session.restaurant.check_in_time.slice(0, 5)} · Check-out ${session.restaurant.check_out_time.slice(0, 5)}`} />
      <FrontDeskClient today={today} bookings={(bookings ?? []) as never} rooms={(rooms ?? []) as never} types={types ?? []} guests={guests ?? []} inspectRule={!!session.restaurant.hk_inspect_required}
        tableBookings={(tableBookings ?? []) as never} tax={tax} openNew={fresh ? { room: room ?? "" } : null} tables={tables} canBook={modulesFor(session.restaurant.property_type, session.profile.role, session.restaurant.enabled_modules ?? null, session.profile.allowed_modules ?? null).includes("reservations")} />
    </>
  );
}
