import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { PageHeader } from "@/components/shell/PageHeader";
import { ChainClient, type Person } from "./ChainClient";
import type { OutletLive } from "./actions";
export const metadata = { title: "Outlets" };
export const dynamic = "force-dynamic";

/** Every outlet at once, live (0106) — and, for the owner, opening one, sending the menu, and who may switch. */
export default async function ChainPage() {
  // the session and this screen's queries in one round trip, not two — the queries are checked by RLS and the RPCs
  // themselves, so nothing is shown before the role gate below; it only stops waiting on the session first (2026-10-18)
  const s = await createClient();
  const [session, [{ data: list }, { data: people }]] = await Promise.all([requireSession(), Promise.all([s.rpc("chain_overview"), s.rpc("chain_people")])]);
  if (!["owner", "manager"].includes(session.profile.role)) redirect("/dashboard?locked=chain");   // 2026-10-20: no longer every supervisor's
  return (
    <>
      <PageHeader eyebrow="Your chain" title="Outlets" sub="All outlets live. Tap one to work in it, or copy the menu across." />
      <ChainClient initial={(list ?? []) as OutletLive[]} people={(people ?? []) as Person[]} role={session.profile.role} current={session.restaurant.id} currentName={session.restaurant.name} isDemo={!!session.restaurant.demo_expires_at} />
    </>
  );
}
