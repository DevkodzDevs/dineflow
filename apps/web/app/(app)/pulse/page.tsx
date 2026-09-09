import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { PulseClient } from "./PulseClient";
export const metadata = { title: "Pulse" };
export const dynamic = "force-dynamic";

export default async function Pulse() {
  const s = await createClient(); const session = await requireSession();
  const [{ data: pulse }, { data: queue }] = await Promise.all([
    s.rpc("table_pulse"),
    s.from("walkins").select("id, token, name, phone, party, quoted_min, status, joined_at, called_at, table_id").in("status", ["waiting", "called"]).order("joined_at"),
  ]);
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  return <PulseClient pulse={(pulse ?? { tables: [] }) as never} queue={(queue ?? []) as never} slug={session.restaurant.booking_slug ?? ""} base={base} listed={!!session.restaurant.is_listed} />;
}
