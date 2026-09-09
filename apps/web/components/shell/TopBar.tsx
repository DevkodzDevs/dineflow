"use client";
import Link from "next/link";
import { Bell, Search, Crown, Server } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "../ui";
import { ThemeButton } from "../ui/Theme";

export function TopBar({ membership, daysLeft, alerts, name, boxSync }: { membership: string; daysLeft: number; alerts: number; name: string; boxSync?: { cursor: string | null; note: string | null } | null }) {
  const stale = boxSync?.cursor ? Date.now() - new Date(boxSync.cursor).getTime() > 10 * 60 * 1000 : true;
  const trialSoon = membership === "trial" && daysLeft <= 3;
  return (
    <motion.header initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="material sticky top-4 z-20 mb-8 flex items-center gap-3 px-4 py-2 rounded-[20px]">
      <div className="hidden sm:flex items-center gap-2 text-steel text-sm flex-1"><Search size={16} /><span className="text-xs">Search tables, rooms, guests, dishes…</span><kbd className="ml-auto text-[10px] num bg-[var(--color-fill)] rounded-md px-1.5 py-0.5 text-[var(--color-label-2)]">⌘K</kbd></div>
      <div className="sm:hidden font-display text-xl tracking-wide flex-1">DineFlow</div>
      {boxSync !== null && boxSync !== undefined && (
        <span title={boxSync.cursor ? `Cloud last reached ${new Date(boxSync.cursor).toLocaleString("en-IN")}` : "Cloud not reached yet"} className={cn("hidden md:flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold", stale ? "bg-porcelain-2 text-steel" : "bg-mint-2 text-ink")}><Server size={11} /> Box · {stale ? "cloud out of reach" : "in step with cloud"}</span>
      )}
      {membership === "trial" && (
        <Link href="/membership" className={cn("hidden md:flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold", trialSoon ? "bg-chili-2 text-chili" : "bg-champagne-2 text-ink")}><Crown size={12} /> Trial · {daysLeft} day{daysLeft === 1 ? "" : "s"} left · Activate</Link>
      )}
      <ThemeButton />
      <Link href="/kitchen" className="relative h-11 w-11 grid place-items-center rounded-full hover:bg-[var(--color-fill)]" aria-label="Alerts"><Bell size={17} />{alerts > 0 && <span className="absolute -top-0.5 -right-0.5 num h-4 min-w-4 px-1 rounded-full bg-chili text-white text-[10px] grid place-items-center">{alerts}</span>}</Link>
      <span className="h-9 w-9 rounded-full bg-[var(--color-label)] text-[var(--color-on-label)] grid place-items-center font-display text-base">{name.slice(0, 1)}</span>
    </motion.header>
  );
}
