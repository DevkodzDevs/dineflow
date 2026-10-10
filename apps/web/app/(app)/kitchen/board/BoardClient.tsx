"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { X, ChefHat, BellRing } from "lucide-react";
import { useLive } from "@/lib/useLive";
import { cn } from "@/components/ui";

type K = { id: string; kot_no: number; status: "pending" | "preparing" | "ready"; created_at: string; ready_at: string | null;
  orders: { order_no: number; type: string; customer_name: string | null; dining_tables: { name: string } | null } | null };
type O = { no: number; where: string; ready: boolean; at: number };

/** Big numbers on a dark screen, refreshed live. It covers the app shell so a wall display shows nothing else. */
export function BoardClient({ kots, name }: { kots: K[]; name: string }) {
  useLive(["kots"], 10000);
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 30000); return () => clearInterval(t); }, []);

  /* A screen the public can read names no rooms. A room number on a wall tells a stranger where a
     guest sleeps, which is why hotels train their staff never to say one aloud — room service shows
     as room service and nothing more. Takeaway gets a first name, the way a counter calls one out. */
  const firstName = (n: string | null | undefined) => (n ?? "").trim().split(/\s+/)[0] ?? "";
  // one order can have several tickets; the guest is told "ready" only when all of them are
  const orders = new Map<number, O>();
  kots.forEach((k) => {
    const no = k.orders?.order_no ?? k.kot_no;
    const o = k.orders;
    const where = o?.dining_tables?.name ?? (o?.type === "takeaway" ? (firstName(o?.customer_name) || "Takeaway") : o?.type === "room_service" ? "Room service" : o?.type === "delivery" ? "Delivery" : firstName(o?.customer_name));
    const cur = orders.get(no); const ready = k.status === "ready"; const at = new Date(k.ready_at ?? k.created_at).getTime();
    orders.set(no, { no, where, ready: cur ? cur.ready && ready : ready, at: Math.max(cur?.at ?? 0, at) });
  });
  const all = [...orders.values()];
  const preparing = all.filter((o) => !o.ready).sort((a, b) => a.no - b.no);
  const ready = all.filter((o) => o.ready).sort((a, b) => b.at - a.at);

  return (
    <div className="fixed inset-0 z-[60] bg-[#0b0d10] text-white flex flex-col select-none" style={{ colorScheme: "dark" }}>
      {/* Phone: a two-line header that does not wrap, then Ready first and Preparing under it, as two
          stacked panels of big number tiles — two narrow columns made "Ready · please collect" break
          over three lines and left a lone dash for an empty side. sm and up keep the wall layout. */}
      <div className="sm:hidden flex items-center gap-3 px-4 pt-[calc(env(safe-area-inset-top)+14px)] pb-3 border-b border-white/10">
        <div className="flex-1 min-w-0">
          <div className="font-display text-[22px] leading-tight">Order board</div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-white/45 truncate">{name}</div>
        </div>
        <span className="num text-[13px] text-white/60 h-8 px-3 rounded-full bg-white/[.07] grid place-items-center">{new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
        <Link href="/kitchen" className="h-11 w-11 shrink-0 grid place-items-center rounded-full bg-white/10 hover:bg-white/20" aria-label="Back to the kitchen"><X size={18} /></Link>
      </div>
      <div className="sm:hidden flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4">
        <PhonePanel title="Ready to collect" items={ready} tone="ready" />
        <PhonePanel title="Preparing" items={preparing} tone="prep" />
      </div>
      <div className="hidden sm:flex items-center justify-between px-6 py-4 border-b border-white/10">
        <div className="text-sm uppercase tracking-[0.2em] text-white/50">{name} · order board</div>
        <div className="flex items-center gap-4">
          <div className="num text-sm text-white/50">{new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</div>
          <Link href="/kitchen" className="h-9 w-9 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11 grid place-items-center rounded-full bg-white/10 hover:bg-white/20" aria-label="Back to the kitchen"><X size={16} /></Link>
        </div>
      </div>
      <div className="hidden sm:grid flex-1 grid-cols-2 min-h-0">
        <Column title="Preparing" items={preparing} tone="prep" />
        <Column title="Ready · please collect" items={ready} tone="ready" />
      </div>
    </div>
  );
}

function Column({ title, items, tone }: { title: string; items: O[]; tone: "prep" | "ready" }) {
  return (
    <section className={cn("p-6 overflow-hidden flex flex-col", tone === "ready" && "bg-[rgb(76_217_100/.08)]")}>
      <h2 className={cn("text-2xl md:text-3xl font-semibold mb-5 flex items-center gap-3", tone === "ready" ? "text-[#4cd964]" : "text-white/80")}>
        {tone === "ready" && <span className="h-3 w-3 rounded-full bg-[#4cd964] pulse-dot text-[#4cd964]" />}{title}<span className="num text-lg text-white/40 ml-auto">{items.length}</span>
      </h2>
      <div className="grid grid-cols-2 xl:grid-cols-3 gap-3 content-start overflow-y-auto">
        <AnimatePresence mode="popLayout">
          {items.map((o) => (
            <motion.div key={o.no} layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ type: "spring", stiffness: 300, damping: 28 }}
              className={cn("rounded-2xl px-4 py-3", tone === "ready" ? "bg-[#4cd964] text-[#04240c]" : "bg-white/[.07]")}>
              <div className="num text-4xl md:text-5xl font-bold leading-none">#{o.no}</div>
              <div className={cn("text-sm mt-1.5 truncate", tone === "ready" ? "opacity-80" : "text-white/50")}>{o.where}</div>
            </motion.div>
          ))}
        </AnimatePresence>
        {items.length === 0 && <div className="text-white/30 text-lg">—</div>}
      </div>
    </section>
  );
}

/** A phone's panel: a header with the count, the numbers as tiles three across, and a sentence when
 *  there is nothing — "Ready" in the board's green, "Preparing" quiet. */
function PhonePanel({ title, items, tone }: { title: string; items: O[]; tone: "prep" | "ready" }) {
  const ready = tone === "ready";
  return (
    <section className={cn("rounded-[24px] border p-4", ready ? "bg-[rgb(76_217_100/.09)] border-[rgb(76_217_100/.28)]" : "bg-white/[.03] border-white/10")}>
      <h2 className={cn("flex items-center gap-2.5 text-[19px] font-semibold", ready ? "text-[#4cd964]" : "text-white/85")}>
        {ready ? <span className="h-2.5 w-2.5 rounded-full bg-[#4cd964] pulse-dot text-[#4cd964]" /> : <ChefHat size={18} className="text-white/55" />}
        {title}
        <span className={cn("ml-auto num text-[13px] font-bold min-w-7 h-7 px-2 rounded-full grid place-items-center", ready ? "bg-[#4cd964] text-[#04240c]" : "bg-white/10 text-white/70")}>{items.length}</span>
      </h2>
      {items.length > 0 ? (
        <div className="grid grid-cols-3 gap-2 mt-3.5">
          <AnimatePresence mode="popLayout">
            {items.map((o) => (
              <motion.div key={o.no} layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ type: "spring", stiffness: 300, damping: 28 }}
                className={cn("rounded-2xl px-2 py-3 text-center min-w-0", ready ? "bg-[#4cd964] text-[#04240c]" : "bg-white/[.07]")}>
                <div className="num text-[30px] font-bold leading-none">#{o.no}</div>
                <div className={cn("text-[11.5px] mt-1.5 truncate", ready ? "opacity-80" : "text-white/50")}>{o.where}</div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <div className="mt-3.5 rounded-2xl border border-dashed border-white/12 px-4 py-6 text-center">
          <span className={cn("mx-auto h-11 w-11 rounded-2xl grid place-items-center", ready ? "bg-[rgb(76_217_100/.14)] text-[#4cd964]" : "bg-white/[.06] text-white/50")}>{ready ? <BellRing size={20} /> : <ChefHat size={20} />}</span>
          <div className="text-[14px] font-semibold text-white/80 mt-2.5">{ready ? "Nothing ready yet" : "No orders cooking"}</div>
          <div className="text-[12px] text-white/45 mt-1">{ready ? "Numbers appear here the moment the kitchen marks them ready." : "New orders show here as soon as they reach the kitchen."}</div>
        </div>
      )}
    </section>
  );
}
