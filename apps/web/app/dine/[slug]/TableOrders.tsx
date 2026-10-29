"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Send, ChefHat, Flame, BellRing, UtensilsCrossed, X, ChevronDown, ChevronLeft, Check, Receipt, PartyPopper, Wallet } from "lucide-react";
import { cn } from "@/components/ui";
import { formatINR } from "@/lib/format";
import { buzz } from "@/lib/buzz";
import { tableOrders, type TableOrder } from "../actions";
import { reach } from "@/lib/reach";

type Stage = TableOrder["stage"];
const STAGE: Record<Stage, { title: string; word: string; sub: (o: TableOrder) => string; Icon: typeof Send; hue: string; hue2: string; step: number }> = {
  sent: { title: "Order sent", word: "Sent", sub: () => "Waiting for the staff to confirm it", Icon: Send, hue: "var(--color-blue)", hue2: "var(--color-blue-2)", step: 0 },
  accepted: { title: "In the kitchen", word: "Kitchen", sub: () => "The kitchen has your order", Icon: ChefHat, hue: "var(--color-violet)", hue2: "var(--color-violet-2)", step: 1 },
  cooking: { title: "Cooking now", word: "Cooking", sub: (o) => (o.ready ? `${o.ready} of ${o.n} dishes ready` : "Your food is on the stove"), Icon: Flame, hue: "var(--color-orange)", hue2: "var(--color-orange-2)", step: 2 },
  ready: { title: "Ready — on its way", word: "Ready", sub: () => "Coming to your table now", Icon: BellRing, hue: "var(--color-green)", hue2: "var(--color-green-2)", step: 3 },
  served: { title: "Served · enjoy!", word: "Served", sub: () => "Need anything else? Ask below — Bill please when you're done", Icon: UtensilsCrossed, hue: "var(--color-green)", hue2: "var(--color-green-2)", step: 4 },
  bill: { title: "Your bill is ready", word: "Bill", sub: (o) => `${o.bill != null ? formatINR(Number(o.bill)) + " · " : ""}${o.pay ? "pay here — UPI or card — or at the table" : "pay at the table — cash, UPI or card"}`, Icon: Receipt, hue: "var(--color-blue)", hue2: "var(--color-blue-2)", step: 5 },
  paid: { title: "Paid · thank you!", word: "Paid", sub: () => "Hope to see you again soon", Icon: PartyPopper, hue: "var(--color-green)", hue2: "var(--color-green-2)", step: 6 },
  rejected: { title: "Couldn't take this order", word: "Not taken", sub: () => "Please ask a waiter — nothing was charged", Icon: X, hue: "var(--color-red)", hue2: "var(--color-red-2)", step: -1 },
};
const STEPS = ["Sent", "Kitchen", "Cooking", "Ready", "Served", "Paid"];
/* moving: the kitchen is on it; calm: eaten, waiting for the bill or paid — the card tucks itself away then */
const MOVING: Stage[] = ["sent", "accepted", "cooking", "ready"];
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
 * After a guest orders at the table (2026-10-27): a card that sticks to the top of the screen while they browse — the stage
 * as a coloured tile and a headline, the order's number, dishes and total, and a six-step bar (Sent · Kitchen · Cooking ·
 * Ready · Served · Paid; "Your bill is ready" between the last two, 0145). It asks `dine_table_orders` every 6 s while the
 * kitchen is on it, every 12 s once served (for the bill), every 60 s once paid — only while the page is on screen — buzzes
 * on each change and opens by itself for a moment.
 * **Out of the way** (2026-10-27, the owner: "after served hide it — a close, swipe left or right, and an arrow to open it
 * again"): ✕ or a sideways swipe tucks it into a tab on the right edge (‹ and the stage), which brings it back; once the
 * meal is served it tucks itself after 20 s, and a new stage brings it out again. A paid or refused order can be put away
 * for good. The phone remembers its orders for twelve hours (localStorage) and the tuck for the visit (sessionStorage).
 */
export function TableOrders({ slug, token }: { slug: string; token: string }) {
  const [kept, setKept] = useState<Kept[]>([]);
  const [orders, setOrders] = useState<TableOrder[]>([]);
  const [open, setOpen] = useState(false);
  const [tucked, setTuckedState] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null);
  const before = useRef<Record<string, Stage>>({});
  const auto = useRef(false);
  const tuckKey = `${keyOf(slug, token)}:tucked`;
  const setTucked = useCallback((v: boolean) => { setTuckedState(v); try { sessionStorage.setItem(tuckKey, v ? "1" : "0"); } catch { /* private */ } }, [tuckKey]);

  useEffect(() => {
    setKept(readKept(slug, token));
    try { setTuckedState(sessionStorage.getItem(tuckKey) === "1"); } catch { /* private */ }
    const on = (e: Event) => { setKept(readKept(slug, token)); setFresh((e as CustomEvent<string>).detail); setTucked(false); auto.current = true; setOpen(true); };
    window.addEventListener("df-table-order", on); return () => window.removeEventListener("df-table-order", on);
  }, [slug, token, tuckKey, setTucked]);
  const ids = kept.filter((k) => !k.hidden).map((k) => k.id).join(",");

  const load = useCallback(() => {
    if (!ids) { setOrders([]); return; }
    void reach(() => tableOrders(slug, token, ids.split(","))).then((r) => {
      if (!("orders" in r) || !r.orders) return;
      let moved = false;
      for (const o of r.orders) { const was = before.current[o.id]; if (was && was !== o.stage) { moved = true; buzz(o.stage === "ready" || o.stage === "paid" ? "done" : "sent"); } }
      before.current = Object.fromEntries(r.orders.map((o) => [o.id, o.stage]));
      setOrders(r.orders);
      if (moved) { setTucked(false); auto.current = true; setOpen(true); }
    });
  }, [slug, token, ids, setTucked]);
  const pace = orders.some((o) => MOVING.includes(o.stage)) || !orders.length ? 6000 : orders.some((o) => o.stage === "served" || o.stage === "bill") ? 12000 : 60000;
  useEffect(() => {
    load();
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, pace);
    const back = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", back);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", back); };
  }, [load, pace]);
  /* a new or changed order opens the card; it folds itself away again after a while so the menu is free */
  useEffect(() => { if (!open || !auto.current) return; const t = setTimeout(() => { auto.current = false; setOpen(false); setFresh(null); }, 9000); return () => clearTimeout(t); }, [open, orders]);
  const top = orders[0];
  /* 0148: a bill the guest can pay from here is not calm — the card stays out with its Pay button */
  const calm = !!top && !MOVING.includes(top.stage) && !(top.stage === "bill" && !!top.pay);
  // where the pay page sends the guest back to: this table's menu
  const [here, setHere] = useState(""); useEffect(() => { setHere(location.pathname + location.search); }, []);
  /* served, waiting for the bill, paid: out of the way 20 s after the stage arrived (counted from then, not from the last
     fold), unless the guest has the detail open */
  const calmSince = useRef(0);
  useEffect(() => { calmSince.current = calm ? Date.now() : 0; }, [calm, top?.stage]);
  useEffect(() => { if (!calm || tucked || (open && !auto.current)) return; const t = setTimeout(() => { setOpen(false); setTucked(true); }, Math.max(0, 20000 - (Date.now() - (calmSince.current || Date.now())))); return () => clearTimeout(t); }, [calm, tucked, open, top?.stage, setTucked]);

  const hide = (id: string) => { const v = readKept(slug, token).map((k) => (k.id === id ? { ...k, hidden: true } : k)); writeKept(slug, token, v); setKept(v); };
  if (!top) return null;
  const s = STAGE[top.stage]; const more = orders.length - 1;
  const items = top.items.reduce((t, i) => t + Number(i.qty), 0);
  const tuck = () => { auto.current = false; setOpen(false); setTucked(true); };

  return (
    <div className="sticky top-[max(10px,env(safe-area-inset-top))] z-30 mb-5" data-table-orders data-tucked={tucked || undefined} style={{ ["--hue" as string]: s.hue, ["--hue-2" as string]: s.hue2 }}>
      <AnimatePresence initial={false} mode="popLayout">
        {tucked ? (
          /* the tab on the right edge, low, just above the basket bar (it covered the contact card at mid-height): ‹, the stage's tile and its word — a tap brings the card back */
          <motion.button key="tab" type="button" onClick={() => { setTucked(false); auto.current = false; }} aria-label={`Show your order — ${s.title}`} data-order-tab
            initial={{ x: 90, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 90, opacity: 0 }} transition={{ type: "spring", stiffness: 420, damping: 34 }}
            className="fixed right-0 bottom-[max(96px,calc(env(safe-area-inset-bottom)+92px))] z-40 h-[52px] pl-2 pr-3 rounded-l-[20px] flex items-center gap-1.5 bg-[var(--color-bg-2)] border border-r-0 border-[color-mix(in_srgb,var(--hue)_40%,var(--color-separator))] shadow-[0_14px_32px_-14px_rgb(0_0_0/.55)] active:scale-95 transition">
            <ChevronLeft size={18} strokeWidth={2.6} className="text-[var(--color-label-2)]" aria-hidden />
            <span className="relative h-9 w-9 rounded-[12px] grid place-items-center bg-[var(--hue-2)] text-[var(--hue)]" aria-hidden>
              <s.Icon size={18} strokeWidth={2.2} />
              {MOVING.includes(top.stage) && <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-[var(--hue)] ring-2 ring-[var(--color-bg-2)] animate-pulse" />}
            </span>
            <span className="text-[12.5px] font-bold">{s.word}</span>
          </motion.button>
        ) : (
          <motion.div key="card" layout drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={0.7} dragSnapToOrigin
            onDragEnd={(_, i) => { if (Math.abs(i.offset.x) > 80 || Math.abs(i.velocity.x) > 500) tuck(); }}
            initial={{ opacity: 0, y: -12, scale: .97 }} animate={{ opacity: 1, x: 0, y: 0, scale: 1 }} exit={{ opacity: 0, x: 120, scale: .96 }} transition={{ type: "spring", stiffness: 380, damping: 30 }}
            data-order-stage={top.stage} data-order-card
            className="relative overflow-hidden rounded-[24px] bg-[color-mix(in_srgb,var(--color-bg-2)_92%,transparent)] backdrop-blur-xl border border-[color-mix(in_srgb,var(--hue)_35%,var(--color-separator))] shadow-[0_18px_40px_-22px_rgb(0_0_0/.55)]">
            <div className="flex items-center">
              <button type="button" onClick={() => { auto.current = false; setOpen((x) => !x); setFresh(null); }} aria-expanded={open} className="flex-1 min-w-0 text-left flex items-center gap-3 p-3 pr-1 min-h-[64px]" data-order-toggle>
                <span className="relative h-12 w-12 shrink-0 rounded-[16px] grid place-items-center bg-[var(--hue-2)] text-[var(--hue)]" aria-hidden>
                  {MOVING.includes(top.stage) && <span className="absolute inset-0 rounded-[16px] border-2 border-[var(--hue)] opacity-40 animate-ping [animation-duration:2.2s]" />}
                  <s.Icon size={22} strokeWidth={2.2} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-[10.5px] font-extrabold uppercase tracking-[.12em] text-[var(--hue)]">
                    {MOVING.includes(top.stage) && <span className="h-1.5 w-1.5 rounded-full bg-[var(--hue)] animate-pulse" aria-hidden />}
                    {fresh === top.id && top.stage === "sent" ? "Order placed" : "Your order"}{more > 0 ? ` · +${more} more` : ""}
                  </span>
                  <span className="block text-[16px] font-bold leading-tight truncate" data-order-title>{s.title}</span>
                  <span className="block text-[12.5px] text-[var(--color-label-2)] truncate num">{top.order_no ? `#${top.order_no}` : `Ref ${refOf(top.ref)}`} · {items} item{items === 1 ? "" : "s"} · {formatINR(Number(top.stage === "bill" || top.stage === "paid" ? top.bill ?? top.total : top.total))}</span>
                </span>
                <ChevronDown size={20} className={cn("shrink-0 text-[var(--color-label-2)] transition-transform", open && "rotate-180")} aria-hidden />
              </button>
              <button type="button" onClick={tuck} aria-label="Hide — the tab on the right brings it back" className="h-11 w-11 mr-1.5 shrink-0 grid place-items-center rounded-full text-[var(--color-label-2)] hover:bg-[var(--color-fill)]" data-order-close><X size={18} /></button>
            </div>
            {/* six steps: done ones in the stage's colour, the current one breathing */}
            {s.step >= 0 && (
              <div className="px-3.5 pb-3 -mt-0.5 grid grid-cols-6 gap-1.5" aria-label={`${s.title} — step ${Math.min(s.step + 1, 6)} of 6`} data-order-steps>
                {STEPS.map((w, i) => <span key={w} className={cn("h-1.5 rounded-full", i < s.step ? "bg-[var(--hue)]" : i === s.step ? "bg-[var(--hue)] animate-pulse" : "bg-[var(--color-fill-2)]")} />)}
              </div>
            )}
            {/* 0148 (the owner's Stage 3): the bill is printed — pay it from here, UPI or card, without waiting for anyone */}
            {top.stage === "bill" && top.pay && (
              <div className="px-3 pb-3 -mt-0.5">
                <a href={`/pay/${top.pay}${here ? `?from=${encodeURIComponent(here)}` : ""}`} className="h-12 rounded-[16px] flex items-center justify-center gap-2 bg-[var(--hue)] text-white text-[15px] font-bold shadow-[0_12px_24px_-14px_var(--hue)] active:scale-[.985] transition" data-order-pay>
                  <Wallet size={18} aria-hidden /> Pay {formatINR(Number(top.bill ?? top.total))}
                </a>
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
                        {(o.stage === "paid" || o.stage === "rejected") && <button type="button" onClick={() => hide(o.id)} className="ml-auto -my-2 -mr-1.5 h-11 px-2.5 rounded-full text-[12.5px] font-semibold text-[var(--color-label-2)] hover:bg-[var(--color-fill)]">Put away</button>}
                      </div>
                      <p className="text-[12.5px] text-[var(--color-label-2)] mt-0.5 num">{os.sub(o)}</p>
                      {os.step >= 0 && (
                        <ol className="mt-2.5 grid grid-cols-6 gap-1 text-center">
                          {STEPS.map((w, i) => (
                            <li key={w} className="flex flex-col items-center gap-1 min-w-0">
                              <span className={cn("h-6 w-6 rounded-full grid place-items-center text-[10px] font-bold", i < os.step ? "bg-[var(--hue)] text-[var(--color-on-tint)]" : i === os.step ? "bg-[var(--hue-2,var(--color-fill))] text-[var(--hue)] ring-2 ring-[var(--hue)]" : "bg-[var(--color-fill)] text-[var(--color-label-3)]")}>{i < os.step ? <Check size={13} strokeWidth={3} /> : i + 1}</span>
                              <span className={cn("text-[10.5px] font-semibold truncate max-w-full", i <= os.step ? "text-[var(--color-label)]" : "text-[var(--color-label-3)]")}>{i === 5 && o.stage === "bill" ? "Bill" : w}</span>
                            </li>))}
                        </ol>
                      )}
                      <ul className="mt-2.5 pt-2.5 border-t border-[var(--color-separator)] space-y-1 text-[13px]">
                        {o.items.map((i, j) => <li key={j} className="flex gap-2"><span className="num font-bold text-[var(--color-label-2)] w-6 shrink-0">{Number(i.qty)}×</span><span className="min-w-0 truncate">{i.name}</span></li>)}
                      </ul>
                    </div>); })}
                  <p className="text-center text-[11.5px] text-[var(--color-label-3)]">Updates by itself · swipe it aside or ✕ — the tab on the right brings it back</p>
                </div>
              </motion.div>
            )}</AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
