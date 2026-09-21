"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
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
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <div className="text-sm uppercase tracking-[0.2em] text-white/50">{name} · order board</div>
        <div className="flex items-center gap-4">
          <div className="num text-sm text-white/50">{new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</div>
          <Link href="/kitchen" className="h-9 w-9 grid place-items-center rounded-full bg-white/10 hover:bg-white/20" aria-label="Back to the kitchen"><X size={16} /></Link>
        </div>
      </div>
      <div className="flex-1 grid grid-cols-2 min-h-0">
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
