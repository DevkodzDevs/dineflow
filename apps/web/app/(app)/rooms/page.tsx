import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shell/PageHeader";
import { RoomsClient } from "./RoomsClient";
export const metadata = { title: "Rooms" };
export const dynamic = "force-dynamic";
export default async function RoomsPage() {
  const s = await createClient();
  const [{ data: rooms }, { data: types }, { data: bookings }] = await Promise.all([
    s.from("rooms").select("*, room_types(name, base_rate)").order("sort_order"),
    s.from("room_types").select("*").eq("is_active", true).order("base_rate"),
    s.from("bookings").select("id, room_id, check_out, guests(full_name)").eq("status", "checked_in"),
  ]);
  return (<><PageHeader eyebrow="Inventory of keys" title="Rooms" accent="& rates" /><RoomsClient rooms={(rooms ?? []) as never} types={types ?? []} bookings={(bookings ?? []) as never} /></>);
}
