import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { KitchenClient, type Needs, type Bumped } from "./KitchenClient";
export const metadata = { title: "Kitchen" };
export const dynamic = "force-dynamic";

export default async function KitchenPage() {
  const s = await createClient();
  /**
   * The board shows the last day's service, not everything ever left open. Reading the three live
   * statuses with no time bound meant a ticket nobody marked ready was fetched and rendered for the
   * rest of the property's life, and the board grew heavier every week. Anything older is counted
   * rather than dropped, so the screen can say so instead of silently losing it.
   */
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const recent = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  /* The session goes in the same breath as the board's own rows. None of these queries needs it —
     the database scopes every one of them to the caller regardless — so awaiting it first only put
     a second round trip in front of the screen that is reloaded most often in the building. */
  const [session, { data }, { data: needs }, { data: stale }, { data: bumped }] = await Promise.all([
    requireSession(),
    // each line carries the station that makes it — the dish's own, else its category's
    s.from("kots").select("id, kot_no, status, created_at, orders(order_no, type, customer_name, promised_at, dining_tables(name)), order_items(id, name_snapshot, qty, status, notes, addons, components, menu_items(station, categories(station)))")
      .in("status", ["pending", "preparing", "ready"]).gte("created_at", since).order("created_at").limit(200),
    s.rpc("kots_needs_live"),
    s.rpc("stale_kot_count", { p_hours: 24 }),
    // the recall strip: what left the board in the last half hour, newest first
    s.from("kots").select("id, kot_no, served_at, orders(order_no, type, customer_name, dining_tables(name))")
      .eq("status", "served").gte("served_at", recent).order("served_at", { ascending: false }).limit(6),
  ]);
  const r = session.restaurant;
  return (
    <KitchenClient initial={(data ?? []) as never} needs={(needs ?? {}) as Needs} stale={(stale as number) ?? 0} bumped={(bumped ?? []) as never as Bumped[]}
      stations={r.kds_stations ?? []} warnAt={r.kds_warn_minutes ?? 10} lateAt={r.kds_target_minutes ?? 15} />
  );
}
