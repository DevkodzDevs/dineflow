import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { NeighboursClient } from "./NeighboursClient";
export const metadata = { title: "Neighbours" };
export const dynamic = "force-dynamic";

export default async function Neighbours({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const s = await createClient(); const session = await requireSession();
  const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
  const onBox = !!process.env.DINEFLOW_BOX;
  // On a Box the district lives in the cloud; the agent brings the results down every minute the internet is up.
  const cache = onBox ? (await s.from("neighbours_cache").select("payload, fetched_at").eq("kind", "all").maybeSingle()).data : null;
  const cached = (cache?.payload ?? {}) as { status?: unknown; prices?: unknown[]; surplus?: unknown[]; standby?: unknown[]; demand?: unknown };
  const [{ data: status }, { data: prices }, { data: surplus }, { data: standby }, { data: demand }, { data: ingredients }, { data: labourers }] = await Promise.all([
    onBox ? Promise.resolve({ data: cached.status ?? (await s.rpc("network_status")).data }) : s.rpc("network_status"),
    onBox ? Promise.resolve({ data: cached.prices ?? [] }) : s.rpc("network_prices", { p_days: 21 }),
    onBox ? (async () => { const mine = (await s.rpc("surplus_feed")).data ?? []; return { data: [...mine, ...(cached.surplus ?? [])] }; })() : s.rpc("surplus_feed"),
    onBox ? (async () => { const mine = (await s.rpc("standby_feed", { p_date: today })).data ?? []; return { data: [...mine, ...(cached.standby ?? [])] }; })() : s.rpc("standby_feed", { p_date: today }),
    onBox ? Promise.resolve({ data: cached.demand ?? { available: false, reason: "waiting for first sync" } }) : s.rpc("network_demand"),
    s.from("ingredients").select("id, name, unit, current_stock").eq("is_active", true).order("name"),
    s.from("labourers").select("id, full_name, skill, daily_wage").eq("status", "active").order("full_name"),
  ]);
  return <NeighboursClient tab={(tab as never) ?? "prices"} today={today}
    status={status as never} prices={(prices ?? []) as never} surplus={(surplus ?? []) as never}
    standby={(standby ?? []) as never} demand={demand as never}
    ingredients={ingredients ?? []} labourers={labourers ?? []} restaurant={session.restaurant as never} syncedAt={cache?.fetched_at ?? null} />;
}
