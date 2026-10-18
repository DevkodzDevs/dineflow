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
  const session = await requireSession();
  if (!["owner", "manager", "supervisor"].includes(session.profile.role)) redirect("/dashboard?locked=chain");
  const s = await createClient();
  const [{ data: list }, { data: people }] = await Promise.all([s.rpc("chain_overview"), s.rpc("chain_people")]);
  return (
    <>
      <PageHeader eyebrow="Your chain" title="Outlets" sub="Every outlet's day as it happens — orders, tables, the kitchen, sales — and one tap to work in any of them. The menu can go from this outlet to the others." />
      <ChainClient initial={(list ?? []) as OutletLive[]} people={(people ?? []) as Person[]} role={session.profile.role} current={session.restaurant.id} currentName={session.restaurant.name} isDemo={!!session.restaurant.demo_expires_at} />
    </>
  );
}
