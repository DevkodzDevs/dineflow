import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { PageHeader } from "@/components/shell/PageHeader";
import { seesFresh, deptOf } from "@/components/shell/sections";
import { ControlsClient, type Expected } from "./ControlsClient";
export const metadata = { title: "Cash & controls" };
export const dynamic = "force-dynamic";

/** The people who touch the drawer. cash_move and shift_close check the same list. */
const CAN = ["owner", "manager", "supervisor", "cashier"];

export default async function ControlsPage() {
  // the session and this screen's queries in one round trip, not two — the queries are checked by RLS and the RPCs
  // themselves, so nothing is shown before the role gate below; it only stops waiting on the session first (2026-10-18)
  const s = await createClient();
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const [session, [{ data: expected }, { data: moves }, { data: shifts }, { data: voids }, { data: lines }]] = await Promise.all([requireSession(), Promise.all([
    s.rpc("shift_expected"),
    s.from("cash_movements").select("id, kind, amount, reason, note, created_by, created_at").gte("created_at", weekAgo).order("created_at", { ascending: false }).limit(100),
    s.from("shift_closes").select("id, business_date, opened_at, closed_at, expected, counted_cash, float_cash, variance, note, closed_by").order("closed_at", { ascending: false }).limit(30),
    s.from("bills").select("id, bill_no, total, void_reason, voided_at, voided_by, created_at").eq("status", "void").gte("created_at", weekAgo).order("created_at", { ascending: false }).limit(50),
    s.from("order_items").select("id, name_snapshot, qty, price_snapshot, cancel_reason, cancelled_by, cancelled_at, created_at, orders(order_no, status)").eq("status", "cancelled").gte("created_at", weekAgo).order("created_at", { ascending: false }).limit(100),
  ])]);
  // and since 2026-10-20 only the money teams' supervisors and cashiers (sections.ts seesFresh — the link asks the same)
  if (!CAN.includes(session.profile.role) || !seesFresh("controls", session.profile.role, deptOf(session.profile.role, session.profile.department ?? null, session.profile.position ?? null))) redirect("/dashboard?locked=controls");
  // the names behind the ids, one query; a platform admin acting as the owner is not in profiles
  const ids = new Set<string>();
  for (const r of [...(moves ?? []), ...(shifts ?? []), ...(voids ?? []), ...(lines ?? [])] as { created_by?: string | null; closed_by?: string | null; voided_by?: string | null; cancelled_by?: string | null }[]) {
    for (const k of ["created_by", "closed_by", "voided_by", "cancelled_by"] as const) if (r[k]) ids.add(r[k]!);
  }
  const { data: people } = ids.size ? await s.from("profiles").select("id, full_name").in("id", [...ids]) : { data: [] };
  const names = Object.fromEntries((people ?? []).map((p) => [p.id, p.full_name]));
  return (
    <>
      <PageHeader eyebrow="Cash drawer" title="Cash" accent="& controls" sub="Shifts, moves and voids" />
      <ControlsClient expected={(expected ?? null) as Expected | null} moves={(moves ?? []) as never} shifts={(shifts ?? []) as never} voids={(voids ?? []) as never} lines={(lines ?? []) as never} names={names} me={session.profile.full_name} />
    </>
  );
}
