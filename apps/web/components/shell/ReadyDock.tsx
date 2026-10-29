"use client";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { Package, BellRing, Check } from "lucide-react";
import { Sheet, cn, useToast } from "@/components/ui";
import { getClient } from "@/lib/supabase/lazy";
import { whenSettled } from "@/lib/idle";
import { setKotStatus } from "@/app/(app)/orders/actions";
import { reach } from "@/lib/reach";

/**
 * Food that is ready, brought to whoever has to take it out (2026-10-24, the owner: "after the kitchen, a floating parcel
 * icon with a count for the takeaway and online food; and a ready-order icon for whoever took the order").
 *
 * Two round bubbles on the right, over the screen, above Assist:
 *   • Parcels (amber, a parcel) — takeaway, delivery and online orders whose ticket is Ready.
 *   • Your orders (green, a bell) — dine-in tickets that are Ready, for the person who took the order (orders.created_by);
 *     a supervisor and above sees every table's.
 * A count on each; a soft ring while something waits. A tap opens the list — the table or token, the dishes, how long it
 * has stood at the pass — with Served / Handed over (setKotStatus 'served', what the kitchen's own button does).
 *
 * Read with the browser's own session (RLS keeps it to this property), after the screen has settled (lib/idle.ts), then
 * live: any change to a ticket asks again (one channel, kots), and every minute as a floor. Never on the kitchen's own
 * screens — the cooks have the board.
 */
type Row = { id: string; kot_no: number; ready_at: string | null; orders: { order_no: number; type: string; token_no: number | null; customer_name: string | null; created_by: string | null; channel_id: string | null; dining_tables: { name: string } | null } | null; order_items: { qty: number; name_snapshot: string; status: string }[] };

const ago = (iso: string | null) => { if (!iso) return ""; const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000)); return m < 1 ? "just now" : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; };

export function ReadyDock({ me, all, parcels }: { me: string; all: boolean; parcels: boolean }) {
  const path = usePathname();
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState<"parcel" | "mine" | null>(null);
  const [pending, start] = useTransition(); const toast = useToast();
  const alive = useRef(true);
  const load = useCallback(async () => {
    try {
      const c = await getClient();
      const { data } = await c.from("kots").select("id, kot_no, ready_at, orders!inner(order_no, type, token_no, customer_name, created_by, channel_id, dining_tables(name)), order_items(qty, name_snapshot, status)")
        .eq("status", "ready").gte("created_at", new Date(Date.now() - 36 * 3600e3).toISOString()).order("ready_at", { ascending: true }).limit(40);
      if (alive.current) setRows((data ?? []) as unknown as Row[]);
    } catch { /* offline: keep what we had */ }
  }, []);
  useEffect(() => {
    alive.current = true; let ch: { unsubscribe: () => void } | null = null; let iv: ReturnType<typeof setInterval> | null = null;
    const cancel = whenSettled(() => {
      void load(); iv = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 60000);
      void getClient().then((c) => { if (!alive.current) return; ch = c.channel("df-ready").on("postgres_changes", { event: "UPDATE", schema: "public", table: "kots" }, () => void load()).subscribe(); }).catch(() => {});
    }, 2000);
    const vis = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", vis);
    return () => { alive.current = false; cancel(); if (iv) clearInterval(iv); ch?.unsubscribe(); document.removeEventListener("visibilitychange", vis); };
  }, [load]);

  if (path.startsWith("/kitchen")) return null;
  const isParcel = (r: Row) => !!r.orders && (r.orders.type === "takeaway" || r.orders.type === "delivery" || !!r.orders.channel_id);
  const parcelRows = parcels ? rows.filter(isParcel) : [];
  const mineRows = rows.filter((r) => !isParcel(r) && r.orders?.type === "dine_in" && (all || r.orders.created_by === me));
  const list = open === "parcel" ? parcelRows : open === "mine" ? mineRows : [];
  const label = (r: Row) => r.orders?.dining_tables?.name ? r.orders.dining_tables.name
    : r.orders?.token_no ? `Token ${r.orders.token_no}` : r.orders?.customer_name || `#${r.orders?.order_no ?? r.kot_no}`;
  const kind = (r: Row) => r.orders?.channel_id ? "Online" : r.orders?.type === "delivery" ? "Delivery" : r.orders?.type === "takeaway" ? "Takeaway" : "Dine in";
  const served = (r: Row) => start(async () => {
    const x = await reach(() => setKotStatus(r.id, "served"));
    if ("error" in x && x.error) { toast(x.error, "err"); return; }
    setRows((rs) => rs.filter((y) => y.id !== r.id));
    if (list.length <= 1) setOpen(null);
  });
  const bubbles = ([["parcel", parcelRows.length, Package, "var(--color-orange)", "Parcels ready"], ["mine", mineRows.length, BellRing, "var(--color-green)", "Your orders ready"]] as const).filter(([, n]) => n > 0);
  if (!bubbles.length && !open) return null;

  return (
    <>
      <div className="fixed z-40 right-4 md:right-6 flex flex-col gap-3 bottom-[calc(var(--tabbar)+12px+56px+14px)] md:bottom-[calc(24px+56px+14px)]" data-ready-dock>
        {bubbles.map(([k, n, Icon, hue, title]) => (
          <button key={k} type="button" onClick={() => setOpen(k)} aria-label={`${title}: ${n}`} title={title} data-ready={k}
            className="ready-bubble relative h-14 w-14 rounded-full grid place-items-center text-white" style={{ background: hue, ["--hue" as string]: hue }}>
            <Icon size={24} strokeWidth={2.2} aria-hidden />
            <span className="absolute -top-1 -right-1 min-w-[22px] h-[22px] px-1.5 rounded-full bg-[var(--color-red)] text-white text-[12px] font-bold grid place-items-center ring-2 ring-[var(--color-bg)] num" data-ready-count={n}>{n}</span>
          </button>
        ))}
      </div>
      <Sheet open={!!open} onClose={() => setOpen(null)} title={open === "parcel" ? "Parcels ready" : "Your orders ready"}>
        <ul className="space-y-2.5" data-ready-list={open ?? ""}>
          {list.map((r) => {
            const dishes = r.order_items.filter((i) => i.status !== "cancelled");
            return (
              <li key={r.id} className="flex items-center gap-3 rounded-2xl border border-[var(--color-separator)] bg-[var(--color-bg-2)] p-3 min-w-0" data-ready-row>
                <span className={cn("h-12 w-12 shrink-0 rounded-[14px] grid place-items-center text-white", open === "parcel" ? "bg-[var(--color-orange)]" : "bg-[var(--color-green)]")} aria-hidden>
                  {open === "parcel" ? <Package size={22} /> : <BellRing size={22} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2 min-w-0"><span className="font-display text-[20px] leading-none truncate">{label(r)}</span><span className="text-[11.5px] font-semibold text-steel shrink-0">{kind(r)} · #{r.orders?.order_no}</span></span>
                  <span className="block mt-1 text-[13px] text-[var(--color-label-2)] truncate">{dishes.map((i) => `${i.qty} ${i.name_snapshot}`).join(", ")}</span>
                  <span className="block mt-0.5 text-[12px] font-semibold text-[var(--color-orange)] num">Ready {ago(r.ready_at)}</span>
                </span>
                <button type="button" disabled={pending} onClick={() => served(r)} className="svc-btn go sm !px-4 shrink-0" data-ready-served><Check size={16} aria-hidden />{open === "parcel" ? "Handed over" : "Served"}</button>
              </li>
            );
          })}
          {list.length === 0 && <li className="text-sm text-steel py-4 text-center">All taken out.</li>}
        </ul>
      </Sheet>
    </>
  );
}
