"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Send, ChefHat, Flame, BellRing, UtensilsCrossed, X, ChevronDown, Check } from "lucide-react";
import { cn } from "@/components/ui";
import { formatINR } from "@/lib/format";
import { buzz } from "@/lib/buzz";
import { tableOrders, type TableOrder } from "../actions";

type Stage = TableOrder["stage"];
const STAGE: Record<Stage, { title: string; sub: (o: TableOrder) => string; Icon: typeof Send; hue: string; hue2: string; step: number }> = {
  sent: { title: "Order sent", sub: () => "Waiting for the staff to confirm it", Icon: Send, hue: "var(--color-blue)", hue2: "var(--color-blue-2)", step: 0 },
  accepted: { title: "In the kitchen", sub: () => "The kitchen has your order", Icon: ChefHat, hue: "var(--color-violet)", hue2: "var(--color-violet-2)", step: 1 },
  cooking: { title: "Cooking now", sub: (o) => (o.ready ? `${o.ready} of ${o.n} dishes ready` : "Your food is on the stove"), Icon: Flame, hue: "var(--color-orange)", hue2: "var(--color-orange-2)", step: 2 },
  ready: { title: "Ready — on its way", sub: () => "Coming to your table now", Icon: BellRing, hue: "var(--color-green)", hue2: "var(--color-green-2)", step: 3 },
  served: { title: "Served · enjoy!", sub: () => "Need anything else? Ask below", Icon: UtensilsCrossed, hue: "var(--color-green)", hue2: "var(--color-green-2)", step: 4 },
  rejected: { title: "Couldn't take this order", sub: () => "Please ask a waiter — nothing was charged", Icon: X, hue: "var(--color-red)", hue2: "var(--color-red-2)", step: -1 },
};
const STEPS = ["Sent", "Kitchen", "Cooking", "Ready", "Served"];
const keyOf = (slug: string, token: string) => `df-table-orders:${slug}:${token}`;
type Kept = { id: string; at: number; hidden?: boolean };
const HALF_DAY = 12 * 3600e3;
/** the order's short reference as a guest would read it out: "5-ebd2" (the tail of TBL-<time>-<hex>) → "EBD2" */
const refOf = (r: string) => r.replace(/^.*-/, "").toUpperCase();

function readKept(slug: string, token: string): Kept[] {
  try { const v = JSON.parse(localStorage.getItem(keyOf(slug, token)) ?? "[]") as Kept[]; return Array.isArray(v) ? v.filter((k) => k && typeof k.id === "string" && Date.now() - k.at < HALF_DAY) : []; } catch { return []; }
}
function writeKept(slug: string, token: string, v: Kept[]) { try { localStorage.setItem(keyOf(slug, token), JSON.stringify(v.slice(0, 10))); } catch { /* private window: this visit only */ } }

/** Remember an order this phone just placed at this table, and tell the status card to show it now. */
export function keepTableOrder(slug: string, token: string, id: string) {
  writeKept(slug, token, [{ id, at: Date.now() }, ...readKept(slug, token).filter((k) => k.id !== id)]);
  window.dispatchEvent(new CustomEvent("df-table-order", { detail: id }));
}

/**
 * After a guest orders at the table (2026-10-27, the owner: "after placing the order show its status at the top of the menu,
 * floating"): a card that sticks to the top of the screen while they browse — the stage as a coloured tile and a headline,
 * the order's number, dishes and total, and a five-step bar (Sent · Kitchen · Cooking · Ready · Served). It asks
 * `dine_table_orders` every 6 s while an order is moving and the page is on screen (every 30 s once all are served), buzzes
 * on each change, and opens by itself for a moment when an order is new or changes. A tap opens the steps and the dishes;
 * a served or refused order can be put away. The phone remembers its orders for twelve hours (localStorage, per table).
 */
export function TableOrders({ slug, token }: { slug: string; token: string }) {
  const [kept, setKept] = useState<Kept[]>([]);
  const [orders, setOrders] = useState<TableOrder[]>([]);
  const [open, setOpen] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null);
  const before = useRef<Record<string, Stage>>({});
  const auto = useRef(false);

  useEffect(() => {
    setKept(readKept(slug, token));
    const on = (e: Event) => { setKept(readKept(slug, token)); setFresh((e as CustomEvent<string>).detail); auto.current = true; setOpen(true); };
    window.addEventListener("df-table-order", on); return () => window.removeEventListener("df-table-order", on);
  }, [slug, token]);
  const ids = kept.filter((k) => !k.hidden).map((k) => k.id).join(",");

  const load = useCallback(() => {
    if (!ids) { setOrders([]); return; }
    void tableOrders(slug, token, ids.split(",")).then((r) => {
      if (!("orders" in r) || !r.orders) return;
      let moved = false;
      for (const o of r.orders) { const was = before.current[o.id]; if (was && was !== o.stage) { moved = true; buzz(o.stage === "ready" ? "done" : "sent"); } }
      before.current = Object.fromEntries(r.orders.map((o) => [o.id, o.stage]));
      setOrders(r.orders);
      if (moved) { auto.current = true; setOpen(true); }
    });
  }, [slug, token, ids]);
  const moving = orders.some((o) => o.stage !== "served" && o.stage !== "rejected");
  useEffect(() => {
    load();
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, moving || !orders.length ? 6000 : 30000);
    const back = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", back);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", back); };
  }, [load, moving, orders.length]);
  /* a new or changed order opens the card; it folds itself away again after a while so the menu is free */
  useEffect(() => { if (!open || !auto.current) return; const t = setTimeout(() => { auto.current = false; setOpen(false); setFresh(null); }, 9000); return () => clearTimeout(t); }, [open, orders]);

  const hide = (id: string) => { const v = readKept(slug, token).map((k) => (k.id === id ? { ...k, hidden: true } : k)); writeKept(slug, token, v); setKept(v); };
  if (!orders.length) return null;
  const top = orders[0]; const s = STAGE[top.stage]; const more = orders.length - 1;
  const items = top.items.reduce((t, i) => t + Number(i.qty), 0);

  return (
    <div className="sticky top-[max(10px,env(safe-area-inset-top))] z-30 mb-5" data-table-orders>
      <motion.div layout initial={{ opacity: 0, y: -12, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 380, damping: 30 }}
        style={{ ["--hue" as string]: s.hue, ["--hue-2" as string]: s.hue2 }} data-order-stage={top.stage}
        className="relative overflow-hidden rounded-[24px] bg-[color-mix(in_srgb,var(--color-bg-2)_92%,transparent)] backdrop-blur-xl border border-[color-mix(in_srgb,var(--hue)_35%,var(--color-separator))] shadow-[0_18px_40px_-22px_rgb(0_0_0/.55)]">
        <button type="button" onClick={() => { auto.current = false; setOpen((x) => !x); setFresh(null); }} aria-expanded={open} className="w-full text-left flex items-center gap-3 p-3 pr-2 min-h-[64px]" data-order-toggle>
          <span className="relative h-12 w-12 shrink-0 rounded-[16px] grid place-items-center bg-[var(--hue-2)] text-[var(--hue)]" aria-hidden>
            {top.stage !== "served" && top.stage !== "rejected" && <span className="absolute inset-0 rounded-[16px] border-2 border-[var(--hue)] opacity-40 animate-ping [animation-duration:2.2s]" />}
            <s.Icon size={22} strokeWidth={2.2} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 text-[10.5px] font-extrabold uppercase tracking-[.12em] text-[var(--hue)]">
              {top.stage !== "served" && top.stage !== "rejected" && <span className="h-1.5 w-1.5 rounded-full bg-[var(--hue)] animate-pulse" aria-hidden />}
              {fresh === top.id && top.stage === "sent" ? "Order placed" : "Your order"}{more > 0 ? ` · +${more} more` : ""}
            </span>
            <span className="block text-[16px] font-bold leading-tight truncate" data-order-title>{s.title}</span>
            <span className="block text-[12.5px] text-[var(--color-label-2)] truncate num">{top.order_no ? `#${top.order_no}` : `Ref ${refOf(top.ref)}`} · {items} item{items === 1 ? "" : "s"} · {formatINR(Number(top.total))}</span>
          </span>
          <span className="h-11 w-11 shrink-0 grid place-items-center rounded-full text-[var(--color-label-2)]" aria-hidden><ChevronDown size={20} className={cn("transition-transform", open && "rotate-180")} /></span>
        </button>
        {/* five steps: done ones in the stage's colour, the current one breathing */}
        {s.step >= 0 && (
          <div className="px-3.5 pb-3 -mt-0.5 grid grid-cols-5 gap-1.5" aria-label={`Step ${s.step + 1} of 5: ${STEPS[s.step]}`} data-order-steps>
            {STEPS.map((w, i) => <span key={w} className={cn("h-1.5 rounded-full", i < s.step ? "bg-[var(--hue)]" : i === s.step ? "bg-[var(--hue)] animate-pulse" : "bg-[var(--color-fill-2)]")} />)}
          </div>
        )}
        <AnimatePresence initial={false}>{open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden" data-order-detail>
            <div className="px-3.5 pb-3.5 space-y-3">
              {orders.map((o) => { const os = STAGE[o.stage]; return (
                <div key={o.id} className="rounded-[18px] bg-[var(--color-bg)] border border-[var(--color-separator)] p-3" style={{ ["--hue" as string]: os.hue }}>
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-bold num">{o.order_no ? `Order #${o.order_no}` : `Ref ${refOf(o.ref)}`}</span>
                    <span className="text-[12px] font-semibold text-[var(--hue)]">· {os.title}</span>
                    {(o.stage === "served" || o.stage === "rejected") && <button type="button" onClick={() => hide(o.id)} className="ml-auto -my-2 -mr-1.5 h-11 px-2.5 rounded-full text-[12.5px] font-semibold text-[var(--color-label-2)] hover:bg-[var(--color-fill)]">Put away</button>}
                  </div>
                  <p className="text-[12.5px] text-[var(--color-label-2)] mt-0.5">{os.sub(o)}</p>
                  {os.step >= 0 && (
                    <ol className="mt-2.5 grid grid-cols-5 gap-1 text-center">
                      {STEPS.map((w, i) => (
                        <li key={w} className="flex flex-col items-center gap-1 min-w-0">
                          <span className={cn("h-6 w-6 rounded-full grid place-items-center text-[10px] font-bold", i <= os.step ? "bg-[var(--hue)] text-[var(--color-on-tint)]" : "bg-[var(--color-fill)] text-[var(--color-label-3)]")}>{i < os.step || o.stage === "served" ? <Check size={13} strokeWidth={3} /> : i + 1}</span>
                          <span className={cn("text-[10.5px] font-semibold truncate max-w-full", i <= os.step ? "text-[var(--color-label)]" : "text-[var(--color-label-3)]")}>{w}</span>
                        </li>))}
                    </ol>
                  )}
                  <ul className="mt-2.5 pt-2.5 border-t border-[var(--color-separator)] space-y-1 text-[13px]">
                    {o.items.map((i, j) => <li key={j} className="flex gap-2"><span className="num font-bold text-[var(--color-label-2)] w-6 shrink-0">{Number(i.qty)}×</span><span className="min-w-0 truncate">{i.name}</span></li>)}
                  </ul>
                </div>); })}
              <p className="text-center text-[11.5px] text-[var(--color-label-3)]">Updates by itself · pay at the table when you're done</p>
            </div>
          </motion.div>
        )}</AnimatePresence>
      </motion.div>
    </div>
  );
}
