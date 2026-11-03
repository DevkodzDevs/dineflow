import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { RoomQrSheet } from "./RoomQrSheet";

export const metadata = { title: "Room QR codes" };
export const dynamic = "force-dynamic";

/** One code per room (0170), ready to print and leave in the room: the guest staying there scans it, orders, and the food goes
 *  on their room bill. */
export default async function RoomQrPage() {
  const s = await createClient(); const session = await requireSession();
  const { data: rooms } = await s.from("rooms").select("id, number, floor, qr_token, room_types(name)").order("sort_order").order("number");
  return (
    <>
      <div className="flex items-center gap-3 mb-6 no-print">
        <div><div className="text-xs font-semibold uppercase tracking-[0.14em] text-steel">Order from the room</div><h1 className="text-3xl">Room QR codes</h1></div>
      </div>
      <RoomQrSheet rooms={(rooms ?? []) as never} slug={session.restaurant.booking_slug ?? null} name={session.restaurant.name} />
    </>
  );
}
