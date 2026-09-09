import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shell/PageHeader";
import { FacilitiesClient } from "./FacilitiesClient";
export const metadata = { title: "Facilities" };
export const dynamic = "force-dynamic";
export default async function Facilities() {
  const s = await createClient();
  const [{ data: facilities }, { data: slots }, { data: inHouse }] = await Promise.all([
    s.from("facilities").select("*").eq("is_active", true).order("kind"),
    s.from("facility_bookings").select("*, facilities(name, kind), bookings(booking_no, rooms(number), guests(full_name))").gte("starts_at", new Date(Date.now() - 6 * 3600e3).toISOString()).neq("status", "cancelled").order("starts_at").limit(60),
    s.from("bookings").select("id, booking_no, rooms(number), guests(full_name)").eq("status", "checked_in"),
  ]);
  return (<><PageHeader eyebrow="Resort · experiences" title="Spa, activities" accent="& venues" /><FacilitiesClient facilities={facilities ?? []} slots={(slots ?? []) as never} inHouse={(inHouse ?? []) as never} /></>);
}
