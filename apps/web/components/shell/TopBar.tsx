"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Search, Crown, Server } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "../ui";
import { ThemeButton } from "../ui/Theme";
import { NotificationBell } from "./Notifier";
import { InstallButton } from "./InstallSheet";

export function TopBar({ membership, daysLeft, alerts, name, boxSync, accountHref }: { membership: string; daysLeft: number; alerts: number; name: string; boxSync?: { cursor: string | null; note: string | null } | null; accountHref?: string | null }) {
  const stale = boxSync?.cursor ? Date.now() - new Date(boxSync.cursor).getTime() > 10 * 60 * 1000 : true;
  const trialSoon = membership === "trial" && daysLeft <= 3;
  /* Pinned, the bar runs edge to edge — from the sidebar to the right of the screen, square, a
     hairline under it (.topbar[data-stuck] in globals.css); at rest it is the floating card. A
     zero-height marker just above it says when it has reached the top. */
  const mark = useRef<HTMLDivElement>(null); const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const el = mark.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting && e.boundingClientRect.top < 1), { threshold: 0 });
    io.observe(el); return () => io.disconnect();
  }, []);
  return (
    <>
    <div ref={mark} aria-hidden className="h-px -mb-px" />
    <motion.header initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} data-stuck={stuck ? "" : undefined} className="topbar material sticky top-[env(safe-area-inset-top,0px)] z-20 mb-8 flex items-center gap-3 px-4 py-2 rounded-[20px]">
      <div className="hidden sm:flex items-center gap-2 text-steel text-sm flex-1"><Search size={18} /><span className="text-xs">Search tables, rooms, guests, dishes…</span><kbd className="ml-auto text-[10px] num bg-[var(--color-fill)] rounded-md px-1.5 py-0.5 text-[var(--color-label-2)]">⌘K</kbd></div>
      {/* the wordmark goes home, like the sidebar's: /dashboard, or the first section this person holds */}
      <div className="sm:hidden flex-1 min-w-0"><Link href="/dashboard" aria-label="DineFlow — home" className="inline-flex items-center !min-h-11 font-display text-xl tracking-wide">DineFlow</Link></div>
      {boxSync !== null && boxSync !== undefined && (
        <span title={boxSync.cursor ? `Cloud last reached ${new Date(boxSync.cursor).toLocaleString("en-IN")}` : "Cloud not reached yet"} className={cn("hidden md:flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold", stale ? "bg-porcelain-2 text-steel" : "bg-mint-2 text-ink")}><Server size={11} /> Box · {stale ? "cloud out of reach" : "in step with cloud"}</span>
      )}
      {membership === "trial" && (
        <Link href="/membership" className={cn("hidden md:flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold", trialSoon ? "bg-chili-2 text-chili" : "bg-champagne-2 text-ink")}><Crown size={12} /> Trial · {daysLeft} day{daysLeft === 1 ? "" : "s"} left · Activate</Link>
      )}
      {/* install, until it is installed: on a phone and an iPad there is no sidebar foot to hold it (the
          icon rail hides its label), and an iPhone has no browser install button to fall back on */}
      {/* every width: the sidebar no longer carries an Install row (owner, 2026-10-13); gone once installed */}
      <InstallButton />
      <ThemeButton />
      <NotificationBell lateKots={alerts} />
      {/* same rule as the sidebar: a button only when there is somewhere to go */}
      {accountHref
        ? <Link href={accountHref} title={`${name} · your settings`} aria-label={`${name} · your settings`} className="tap-square h-9 w-9 rounded-full bg-[var(--color-label)] text-[var(--color-on-label)] grid place-items-center font-display text-base transition hover:opacity-80">{name.slice(0, 1)}</Link>
        : <span title={name} className="tap-square h-9 w-9 rounded-full bg-[var(--color-label)] text-[var(--color-on-label)] grid place-items-center font-display text-base">{name.slice(0, 1)}</span>}
    </motion.header>
    </>
  );
}
