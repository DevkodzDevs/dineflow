"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Check, X, Bike, Clock, Link2, AlertTriangle, Bell, Flame, PackageCheck, BadgeCheck, Banknote, ExternalLink, MapPin, Globe } from "lucide-react";
import { useLive } from "@/lib/useLive";
import { Button, Card, Sheet, cn, Empty, FlapBreathe } from "@/components/ui";
import { Say } from "@/components/ui/Say";
import { formatINR, fmtSince } from "@/lib/format";
import { usePrinters } from "@/lib/print/usePrinter";
import { acceptOnline, rejectOnline, setOnlineStatus, mapDish, suggestDishMap } from "./actions";
import { AiButton } from "@/components/ui/AiButton";
import { ReasonDialog } from "@/components/ui/ReasonDialog";
import { AssignRider, type Delivery, type Rider } from "./AssignRider";

type OO = { track_token?: string | null; id: string; external_id: string; display_id: string | null; status: string; customer_name: string | null; customer_phone: string | null; address: string | null; items: { menu_item_id: string | null; name: string; qty: number; price: number; note: string | null }[]; unmatched: string[]; gross: number; commission: number; payout: number; is_prepaid: boolean; placed_at: string; order_id: string | null; order_channels: { kind: string; label: string; prep_minutes: number } | null };
/* each channel's own colour on its card's head band — what a packer recognises across the counter */
const BAND: Record<string, string> = { swiggy: "bg-[#fc8019] text-[#1f0f00]", zomato: "bg-[#e23744] text-white", website: "bg-ink text-on-label", ondc: "bg-mint text-on-tint", other: "bg-porcelain-2 text-ink" };
type Tab = "new" | "cook" | "ready";
const TAB_OF = (s: string): Tab => (s === "new" ? "new" : s === "ready" ? "ready" : "cook");

/**
 * Online orders as the packer works them (globals.css SIMPLE SERVICE): three tabs — New (accept them
 * before the aggregator gives up), Cooking, Ready — and one card per order with the channel's colour
 * on top, the dishes with their counts, the total big, and one big button: Accept, Food ready, Picked up.
 */
export function OnlineClient({ orders, channels, menu, ai = false, deliveries = [], riders = [], base = "", property = "", tracking = true }: { deliveries?: Delivery[]; riders?: Rider[]; base?: string; property?: string; tracking?: boolean; orders: OO[]; channels: { id: string; kind: string; label: string; is_live: boolean }[]; menu: { id: string; name: string; price: number; online_available?: boolean }[]; ai?: boolean }) {
  const [pending, start] = useTransition(); const [err, setErr] = useState<string | null>(null);
  const [fix, setFix] = useState<{ order: OO; line: string } | null>(null);
  const [rejecting, setRejecting] = useState<OO | null>(null);
  /* Send out (0140): the order a rider is being chosen for, and who already rides each */
  const [assign, setAssign] = useState<OO | null>(null);
  const dOf = (o: OO) => deliveries.find((d) => d.online_order_id === o.id) ?? null;
  // every action's answer reaches the screen; a refused write used to look exactly like a saved one
  const run = (p: Promise<{ error?: string } | { ok: boolean }>, then?: () => void) => start(async () => { const r = await p; if ("error" in r && r.error) setErr(r.error); else { setErr(null); then?.(); } });
  const [hint, setHint] = useState<{ line: string; menu_item_id: string | null; name: string | null; confidence: number } | null>(null); const [hinting, setHinting] = useState(false);
  const { printKot } = usePrinters();
  useLive(["online_orders"], 30000);
  const live = orders.filter((o) => ["new", "accepted", "preparing", "ready"].includes(o.status));
  const n = (t: Tab) => live.filter((o) => TAB_OF(o.status) === t).length;
  // New when anything is waiting; otherwise whatever has orders in it
  const [tab, setTab] = useState<Tab>(() => (n("new") ? "new" : n("cook") ? "cook" : n("ready") ? "ready" : "new"));
  const newCount = orders.filter((o) => o.status === "new").length; const prev = useRef(newCount);
  // a new order brings the New tab forward; its sound is the alert system's (Notifier, "New online orders") — the
  // data: clip that played here was an empty WAV header and never made a sound (2026-10-23)
  useEffect(() => { if (newCount > prev.current) setTab("new"); prev.current = newCount; }, [newCount]);
  const [, tick] = useState(0); useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 30000); return () => clearInterval(t); }, []);
  // dishes switched off online (0132): an aggregator keeps its own menu and can still send one — say so on the card
  const offOnline = new Set(menu.filter((m) => m.online_available === false).map((m) => m.id));
  const today = orders.filter((o) => o.status !== "rejected");
  const shown = live.filter((o) => TAB_OF(o.status) === tab);
  const accept = (o: OO) => start(async () => {
    const r = await acceptOnline(o.id); if ("error" in r) return setErr(r.error!);
    try { await printKot({ kotNo: o.display_id ?? o.external_id, when: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }), tableOrType: `${o.order_channels?.label ?? "Online"} · ${o.customer_name ?? ""}`, items: o.items.map((i) => ({ name: i.name, qty: i.qty, note: i.note })) }); } catch { setErr("Accepted, but the kitchen ticket did not print. Check the printer."); }
  });
  const TABS: { k: Tab; w: "new" | "cooking" | "ready"; Icon: typeof Bell }[] = [{ k: "new", w: "new", Icon: Bell }, { k: "cook", w: "cooking", Icon: Flame }, { k: "ready", w: "ready", Icon: PackageCheck }];
  return (
    <div className="space-y-5">
      {channels.length === 0 && <Card className="!bg-champagne-2 flex items-start gap-3"><Link2 size={18} className="shrink-0 mt-0.5" /><div className="text-sm"><b>No channels connected yet.</b> Add one in <Link href="/channels" className="underline font-semibold">Channels</Link>.</div></Card>}
      <div className="grid grid-cols-3 gap-2 sm:max-w-xl" role="tablist" aria-label="Online orders" data-online-tabs>
        {TABS.map(({ k, w, Icon }) => {
          const c = n(k); const on = tab === k;
          return (
            <button key={k} type="button" role="tab" aria-selected={on} onClick={() => setTab(k)}
              className={cn("!min-h-12 rounded-full px-2 flex items-center justify-center gap-1.5 text-[14px] font-extrabold transition-colors min-w-0", on ? "bg-[var(--color-label)] text-[var(--color-on-label)]" : "bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)]")}>
              <Icon size={16} aria-hidden className="shrink-0" /><Say w={w} />
              {/* 2026-10-20: orders not yet accepted breathe until someone takes them (Flap.tsx) */}
              {k === "new" && c > 0 ? <span className="shrink-0 ml-0.5" data-new-count={c}><FlapBreathe value={c} pad={0} size="xs" tile="32px" tone="alert" say={`${c} new`} /></span> :
              <b className={cn("num shrink-0 min-w-6 h-6 px-1.5 rounded-full grid place-items-center text-[13px]", k === "new" && c ? "bg-[var(--color-red)] text-white" : on ? "bg-[color-mix(in_srgb,var(--color-on-label)_16%,transparent)]" : "bg-[var(--color-fill-2)]")}>{c}</b>}
            </button>
          );
        })}
      </div>
      {shown.length === 0 ? <Empty title={tab === "new" ? "No new online orders" : tab === "cook" ? "Nothing cooking for delivery" : "Nothing to send out"} hint="Arrive with a sound" /> : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"><AnimatePresence>
          {shown.map((o) => {
            const kind = o.order_channels?.kind ?? "other"; const total = Number(o.gross);
            return (
              <motion.div key={o.id} layout initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} data-online={o.id}
                className={cn("feather !rounded-[22px] overflow-hidden flex flex-col min-w-0", o.status === "new" && "ring-2 ring-[var(--color-red)]/50")}>
                {/* the channel's band: who sent it, its number, how long it has waited */}
                <div className={cn("flex items-center gap-2 px-4 min-h-[60px]", BAND[kind] ?? BAND.other)}>
                  <span className="font-display text-[24px] leading-none truncate">{o.order_channels?.label ?? "Online"}</span>
                  <span className="num text-[15px] font-bold opacity-85 truncate">#{o.display_id ?? o.external_id}</span>
                  <span className="ml-auto shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-full bg-black/20 text-[15px] font-extrabold num"><Clock size={15} aria-hidden />{fmtSince(o.placed_at)}</span>
                </div>
                <div className="p-4 flex flex-col gap-3 flex-1 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-extrabold text-[17px] truncate">{o.customer_name || "Customer"}</span>
                    {o.is_prepaid ? <span className="svc-chip lone st-ready !min-h-7 !text-[12.5px] !px-2.5 ml-auto shrink-0"><BadgeCheck size={14} aria-hidden /> Paid online</span>
                      : <span className="svc-chip lone st-cook !min-h-7 !text-[12.5px] !px-2.5 ml-auto shrink-0"><Banknote size={14} aria-hidden /> Collect cash</span>}
                  </div>
                  {o.address && <div className="-mt-2 text-[13px] text-steel truncate flex items-center gap-1"><MapPin size={13} className="shrink-0" aria-hidden />{o.address}</div>}
                  <ul className="space-y-2">{o.items.map((i, k) => (
                    <li key={k} className={cn("flex items-center gap-3 text-[15px] font-semibold min-w-0", !i.menu_item_id && "text-chili")}>
                      <span className="h-8 min-w-8 px-1.5 rounded-full bg-[var(--color-fill-2)] grid place-items-center font-display num text-[16px] shrink-0">{i.qty}</span>
                      <span className="flex-1 min-w-0 truncate">{i.name}{i.note ? <span className="text-[12px] font-normal text-steel"> · {i.note}</span> : null}</span>
                    </li>))}</ul>
                  {/* a dish the channel sent that is not on the menu: one callout — what, why, and the button to fix it (2026-10-21) */}
                  {(() => { const offs = o.items.filter((i) => i.menu_item_id && offOnline.has(i.menu_item_id)); return offs.length > 0 && o.status === "new" && (
                    <div className="flex items-start gap-2.5 rounded-[16px] p-2.5 pl-3 text-[13.5px] bg-[color-mix(in_srgb,var(--color-orange)_12%,transparent)]" data-off-online>
                      <Globe size={16} aria-hidden className="shrink-0 mt-0.5 text-[var(--color-orange)]" />
                      <span className="min-w-0"><b>Off online:</b> {offs.map((i) => i.name).join(", ")}. Can you make it?</span>
                    </div>); })()}
                  {o.unmatched.length > 0 && <div className="flex items-center gap-3 rounded-[16px] p-2.5 pl-3 border border-[color-mix(in_srgb,var(--color-red)_35%,transparent)] bg-[color-mix(in_srgb,var(--color-red)_8%,transparent)]" data-unmatched>
                    <span className="h-9 w-9 shrink-0 rounded-[11px] grid place-items-center bg-[color-mix(in_srgb,var(--color-red)_16%,transparent)] text-[var(--color-red)]" aria-hidden><AlertTriangle size={17} /></span>
                    <div className="min-w-0 flex-1 leading-tight">
                      <div className="text-[13.5px] font-bold text-[var(--color-red)]"><span className="num">{o.unmatched.length}</span> {o.unmatched.length === 1 ? "dish" : "dishes"} not on menu</div>
                      <div className="text-[12px] text-[var(--color-label-2)] mt-0.5">Map {o.unmatched.length === 1 ? "it" : "them"} for ticket, stock</div>
                    </div>
                    <button type="button" onClick={() => setFix({ order: o, line: o.unmatched[0] })} className="shrink-0 !min-h-10 h-10 px-3.5 rounded-full inline-flex items-center gap-1.5 text-[13px] font-bold bg-[var(--color-red)] text-white active:scale-[.97] transition" data-map-now><Link2 size={15} aria-hidden />Map now</button>
                  </div>}
                  {/* what the guest paid big; what the aggregator kept and what arrives under it */}
                  <div className="mt-auto pt-3 border-t border-line flex items-end gap-3">
                    <div className="min-w-0"><div className="text-[13px] font-semibold text-steel">Total</div>
                      <div className="text-[11.5px] text-steel num truncate">{Number(o.commission) > 0 ? `payout ${formatINR(Number(o.payout))} after ${formatINR(Number(o.commission))}` : `payout ${formatINR(Number(o.payout))}`}</div></div>
                    <span className="ml-auto font-display num text-[30px] leading-none shrink-0">{formatINR(total, { whole: Number.isInteger(total) })}</span>
                  </div>
                  <div className="flex gap-2">
                    {o.status === "new" ? <>
                      <button type="button" className="svc-btn go flex-1" disabled={pending} onClick={() => accept(o)} data-accept><Check size={20} aria-hidden /><Say w="accept" /></button>
                      <button type="button" className="svc-btn no !px-5" disabled={pending} aria-label="Reject this order" onClick={() => setRejecting(o)}><X size={20} aria-hidden /><Say w="reject" /></button>
                    </> : o.status === "ready"
                      ? (tracking && !!o.address
                        /* a delivery with tracking on: Send out picks the rider and hands over the two links; once sent, the rider's name and a way back to the links, and Picked up beside it for a rider without the page */
                        ? (dOf(o)
                          ? <div className="flex-1 min-w-0 flex gap-2">
                              <button type="button" className="svc-btn quiet flex-1 min-w-0" disabled={pending} onClick={() => setAssign(o)} data-rider-links><Bike size={20} aria-hidden /><span className="truncate">{dOf(o)!.rider_name ?? "Rider"}{dOf(o)!.status === "picked_up" ? " · on the way" : " · links"}</span></button>
                              <button type="button" className="svc-btn ink !px-5" disabled={pending} onClick={() => run(setOnlineStatus(o.id, "picked_up"))} aria-label="Picked up" title="Picked up"><PackageCheck size={20} aria-hidden /></button>
                            </div>
                          : <button type="button" className="svc-btn ink flex-1" disabled={pending} onClick={() => setAssign(o)} data-send-out><Bike size={20} aria-hidden /> Send out</button>)
                        : <button type="button" className="svc-btn ink flex-1" disabled={pending} onClick={() => run(setOnlineStatus(o.id, "picked_up"))}><Bike size={20} aria-hidden /> Picked up</button>)
                      : <button type="button" className="svc-btn go flex-1" disabled={pending} onClick={() => run(setOnlineStatus(o.id, "ready"))}><PackageCheck size={20} aria-hidden /><Say w="food_ready" /></button>}
                    {o.order_id && <Link href={`/orders/${o.order_id}`} aria-label="Open the kitchen order" title="Open the kitchen order" className="h-14 w-14 shrink-0 rounded-[18px] grid place-items-center bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)]"><ExternalLink size={18} /></Link>}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence></div>
      )}
      {err && <p className="text-sm text-chili">{err}</p>}
      {/* today's money from the apps, in one line */}
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-[14px] text-steel" data-online-today>
        <span>Today <b className="num text-[var(--color-label)]">{formatINR(today.reduce((t, o) => t + Number(o.gross), 0))}</b></span>
        <span>Commission <b className="num text-[var(--color-label)]">{formatINR(today.reduce((t, o) => t + Number(o.commission), 0))}</b></span>
        <span>Payout <b className="num text-[var(--color-label)]">{formatINR(today.reduce((t, o) => t + Number(o.payout), 0))}</b></span>
      </div>
      <Sheet open={!!fix} onClose={() => setFix(null)} title={`Map "${fix?.line ?? ""}"`}>
        <div className="flex items-start gap-3 mb-3">
          <p className="text-sm text-steel flex-1">Pick the dish — remembered</p>
          {ai && <AiButton label="Find it" busy={hinting} onClick={() => { setHinting(true); void suggestDishMap([fix!.line]).then((r) => { if ("error" in r) setErr(r.error!); else setHint(r.matches?.[0] ?? null); }).finally(() => setHinting(false)); }} />}
        </div>
        {hint && hint.line === fix?.line && (
          <div className="mb-3 rounded-xl border border-[var(--color-tint)]/40 bg-[var(--color-green-2)] p-3 text-sm flex items-center gap-3">
            <span className="flex-1 min-w-0">{hint.menu_item_id ? <>Looks like <b>{hint.name}</b> <span className="num text-xs text-steel">· {hint.confidence}% sure</span></> : <>Not on your menu</>}</span>
            {hint.menu_item_id && <Button size="sm" disabled={pending} onClick={() => run(mapDish(hint.menu_item_id!, fix!.order.order_channels?.kind ?? "other", fix!.line), () => { setHint(null); setFix(null); })}>Map it</Button>}
          </div>
        )}
        <div className="space-y-2">{menu.map((m) => <button key={m.id} className="feather feather-lift w-full text-left p-3 flex justify-between" disabled={pending} onClick={() => run(mapDish(m.id, fix!.order.order_channels?.kind ?? "other", fix!.line), () => setFix(null))}><span>{m.name}</span><span className="num text-steel">{formatINR(Number(m.price))}</span></button>)}</div>
      </Sheet>
      <AssignRider order={assign} riders={riders} base={base} property={property} existing={assign ? dOf(assign) : null} onClose={() => setAssign(null)} />
      <ReasonDialog open={!!rejecting} onClose={() => setRejecting(null)} title={rejecting ? `Reject ${rejecting.display_id ?? rejecting.external_id}?` : ""}
        hint="Guest is told. No undo." chips={["Item unavailable", "Kitchen too busy", "Closing soon", "Too far to deliver"]} confirmLabel="Reject order"
        onConfirm={async (reason) => { const r = await rejectOnline(rejecting!.id, reason); if ("error" in r) return { error: r.error }; }} />
    </div>
  );
}
