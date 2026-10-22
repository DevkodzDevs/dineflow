"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { Search, Crown, Server } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "../ui";
import { ThemeButton } from "../ui/Theme";
import { LangButton } from "../ui/Say";
import { NotificationBell } from "./Notifier";
import { InstallButton } from "./InstallSheet";
import { OutletSwitcher } from "./OutletSwitcher";
import { BackButton } from "./BackButton";
import { ProfileCard } from "./ProfileCard";
import type { Outlet } from "@/lib/auth";

export function TopBar({ membership, daysLeft, alerts, name, boxSync, accountHref, outlets = [], home = "/dashboard" }: { home?: string; membership: string; daysLeft: number; alerts: number; name: string; boxSync?: { cursor: string | null; note: string | null } | null; accountHref?: string | null; outlets?: Outlet[] }) {
  // on a phone, Back and the wordmark do not both fit beside the icons (they overlapped at 360–412, 2026-10-22): where Back
  // shows the wordmark steps aside and its space stays; on home, where Back is not drawn, the wordmark is back
  const path = usePathname(); const backShown = !(path === home || path === "/");
  const stale = boxSync?.cursor ? Date.now() - new Date(boxSync.cursor).getTime() > 10 * 60 * 1000 : true;
  const trialSoon = membership === "trial" && daysLeft <= 3;
  /* Pinned, the bar runs edge to edge — from the sidebar to the right of the screen, square, a
     hairline under it (.topbar[data-stuck] in globals.css); at rest it is the floating card. A
     zero-height marker just above it says when it has reached the top. */
  const mark = useRef<HTMLDivElement>(null); const [stuck, setStuck] = useState(false);
  const [mac, setMac] = useState(false); const [card, setCard] = useState(false);
  useEffect(() => { setMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)); }, []);
  useEffect(() => {
    const el = mark.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting && e.boundingClientRect.top < 1), { threshold: 0 });
    io.observe(el); return () => io.disconnect();
  }, []);
  return (
    <>
    <div ref={mark} aria-hidden className="h-px -mb-px" />
    <motion.header initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} data-stuck={stuck ? "" : undefined} className="topbar material sticky top-[env(safe-area-inset-top,0px)] z-20 mb-8 flex items-center gap-3 px-4 py-2 rounded-[20px] max-[400px]:gap-1 max-[400px]:px-3">
      {/* Back, first, on every screen but home (BackButton.tsx, 2026-10-22) */}
      <Suspense fallback={null}><BackButton home={home} /></Suspense>
      {/* Go to (components/shell/Keys.tsx): the hint said ⌘K for months and nothing answered it */}
      <button type="button" onClick={() => dispatchEvent(new Event("df-palette"))} data-goto-open className="hidden sm:flex items-center gap-2 text-steel text-sm flex-1 min-w-0 h-10 -my-1 px-1 rounded-xl text-left hover:text-[var(--color-label)] transition-colors"><Search size={18} className="shrink-0" /><span className="text-xs truncate">Go to a section — orders, kitchen, billing…</span><kbd className="kbd ml-auto">{mac ? "⌘" : "Ctrl"} K</kbd></button>
      {/* the wordmark goes home, like the sidebar's: /dashboard, or the first section this person holds */}
      {/* with several outlets the phone's top bar shows the outlet instead: there is no room for both (0106) */}
      <div className={cn("sm:hidden flex-1 min-w-0", outlets.length > 1 && "hidden")}><Link href="/dashboard" aria-label="DineFlow — home" className={cn("items-center !min-h-11 font-display text-xl tracking-wide max-[400px]:text-lg", backShown ? "hidden" : "inline-flex")} data-wordmark>DineFlow</Link></div>
      {/* which outlet this device is working in, when there is more than one (0106) */}
      <OutletSwitcher outlets={outlets} className="max-sm:flex-1" />
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
      {/* English, or English with Tamil / Hindi under it, for whoever uses this device (lib/say.ts) */}
      <LangButton />
      <ThemeButton />
      <NotificationBell lateKots={alerts} />
      {/* the circle opens the profile card first (2026-10-23, the owner): who they are, their position, since when — with
          Edit my profile, and Settings for whoever may. It went straight to Settings (or /me) before. */}
      <button type="button" onClick={() => setCard(true)} title={`${name} · your profile`} aria-label={`${name} · your profile`} aria-haspopup="dialog" data-my-profile
        className="tap-square h-9 w-9 rounded-full bg-[var(--color-label)] text-[var(--color-on-label)] grid place-items-center font-display text-base transition hover:opacity-80">{name.slice(0, 1)}</button>
    </motion.header>
    <ProfileCard open={card} onClose={() => setCard(false)} accountHref={accountHref} />
    </>
  );
}
