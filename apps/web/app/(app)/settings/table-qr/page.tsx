import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { TableQrSheet } from "./TableQrSheet";

export const metadata = { title: "Table QR codes" };
export const dynamic = "force-dynamic";

/** One code per table, ready to print, cut out and stand on the table. */
export default async function TableQrPage() {
  const s = await createClient(); const session = await requireSession();
  const { data: tables } = await s.from("dining_tables").select("id, name, zone, qr_token").order("sort_order");
  return (
    <>
      <div className="flex items-center gap-3 mb-6 no-print">
        <Link href="/settings" className="h-10 w-10 grid place-items-center rounded-xl border border-line bg-card" aria-label="Back"><ChevronLeft size={18} /></Link>
        <div><div className="text-xs font-semibold uppercase tracking-[0.14em] text-steel">Order from the table</div><h1 className="text-3xl">Table QR codes</h1></div>
      </div>
      <TableQrSheet tables={tables ?? []} slug={session.restaurant.booking_slug ?? null} name={session.restaurant.name} />
    </>
  );
}
