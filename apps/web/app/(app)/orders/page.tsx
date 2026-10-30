import Link from "next/link";
import { ShoppingBag, Phone } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { holdDue } from "@/lib/holdDue";
import { requireSession } from "@/lib/auth";
import { todayIST } from "@/lib/format";
import { CLEAN_BOSSES, isCleaner } from "@/lib/notify";
import { positionByKey } from "@dineflow/shared";
import { SvcHead } from "@/components/ui/Service";
import { Say } from "@/components/ui/Say";
import { OrdersClient } from "./OrdersClient";

export const metadata = { title: "Orders" };
export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const s = await createClient(); const held = holdDue(s);   // a booking due now holds its table or room (0154)
  const [session, { data: tables }, { data: orders }, { data: calls }, { data: cleans }, { data: people }, { data: qr }] = await Promise.all([
    requireSession(),
    s.from("dining_tables").select("*").order("sort_order"),
    // a printed, unpaid bill turns the table violet ("Bill"); each dish's own time decides LATE
    s.from("orders").select("id, order_no, type, table_id, customer_name, status, created_at, token_no, bills(status), order_items(id, name_snapshot, qty, price_snapshot, status, created_at)").eq("status", "open").order("created_at"),
    // tables calling from their QR in the last half hour (0103) — a badge on the card until someone answers
    s.from("service_calls").select("id, table_id, kind, created_at").eq("status", "open").gte("created_at", new Date(Date.now() - 30 * 60000).toISOString()).order("created_at"),
    // tables paid and left, not yet cleaned (0111) — and the names of whoever has them
    s.from("table_cleanings").select("id, table_id, status, created_at, assigned_to, taken_by, taken_at").in("status", ["pending", "in_progress"]),
    s.from("profiles").select("id, full_name, role, department, position").eq("is_active", true),
    // orders placed from a table's QR, waiting for someone to accept them into the kitchen (2026-10-27)
    s.from("online_orders").select("id, table_id, display_id, gross, items, created_at").eq("status", "new").is("order_id", null).not("table_id", "is", null).gte("created_at", new Date(Date.now() - 12 * 3600e3).toISOString()).order("created_at"),
  ]);
  const staff = (people ?? []) as { id: string; full_name: string; role: string; department: string | null; position: string | null }[];
  const nameOf = new Map(staff.map((p) => [p.id, p.full_name]));
  /* who does what with a table to clean (2026-10-30): a cleaner takes it, an owner / manager / supervisor gives it out
     (lib/notify.ts isCleaner, CLEAN_BOSSES), everyone else only sees who has it */
  const role = session.profile.role; const boss = CLEAN_BOSSES.includes(role);
  const cleaner = isCleaner(role, session.profile.department ?? null, session.profile.position ?? null);
  const onDuty = new Set<string>();
  if (boss && cleans?.length) {
    const { data: att } = await s.from("staff_attendance").select("profile_id").eq("work_date", todayIST()).not("in_at", "is", null).is("out_at", null);
    (att ?? []).forEach((a) => onDuty.add(a.profile_id as string));
  }
  // the people a table can be given to: on duty first, then the ones who clean, then by name (JobCard's peopleFor)
  const crew = boss ? staff.filter((p) => !CLEAN_BOSSES.includes(p.role) || p.id === session.profile.id)
    .map((p) => ({ id: p.id, name: p.full_name, title: positionByKey(p.position)?.title ?? null, on_duty: onDuty.has(p.id), cleans: isCleaner(p.role, p.department, p.position) }))
    .sort((a, b) => Number(b.on_duty) - Number(a.on_duty) || Number(b.cleans) - Number(a.cleans) || a.name.localeCompare(b.name)) : [];
  const cleaning =((cleans ?? []) as { id: string; table_id: string; status: "pending" | "in_progress"; created_at: string; assigned_to: string | null; taken_by: string | null; taken_at: string | null }[])
    .map((c) => ({ ...c, assigned_name: c.assigned_to ? nameOf.get(c.assigned_to) ?? "someone" : null, taken_name: c.taken_by ? nameOf.get(c.taken_by) ?? "someone" : null }));
  await held;
  return (
    <>
      {/* dine-in starts from a table on the floor; the header's one button is for an order with no table */}
      <SvcHead icon="orders" title="Orders" sub="Tap a table"
        actions={<>
          <Link href="/orders/phone" className="svc-btn quiet sm !px-4" data-phone-order-link><Phone size={18} aria-hidden /> Phone</Link>
          <Link href="/orders/new?type=takeaway" className="svc-btn go sm !px-5" data-new-parcel><ShoppingBag size={19} aria-hidden /><Say w="parcel" /></Link>
        </>} />
      <OrdersClient tables={tables ?? []} orders={(orders ?? []) as never} calls={(calls ?? []) as never} qrOrders={(qr ?? []) as never} lateAt={Number(session.restaurant.kds_target_minutes ?? 15)}
        cleaning={cleaning} me={session.profile.id} boss={boss} cleaner={cleaner} crew={crew} />
    </>
  );
}
