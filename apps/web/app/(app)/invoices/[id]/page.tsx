import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { InvoiceView } from "./InvoiceView";
export const dynamic = "force-dynamic";
export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const s = await createClient(); const session = await requireSession();
  const { data: inv } = await s.from("invoices").select("*, bookings(booking_no, check_in, check_out, rooms(number))").eq("id", id).maybeSingle();
  if (!inv) notFound();
  return <InvoiceView inv={inv as never} restaurant={session.restaurant} cashier={session.profile.full_name} />;
}
