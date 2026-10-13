"use client";
import { useState } from "react";
import { InstallSheet, useInstallable } from "./InstallSheet";
import { useInstall } from "./useInstall";
import Link from "next/link";
import { Download } from "lucide-react";
import { cn } from "@/components/ui";

/**
 * "Install app", where people look for it — the sidebar's foot — not only deep in Settings. Where the
 * browser has already offered its one-tap install (caught in <head> as window.__dfInstall) one click
 * runs it; otherwise it opens InstallSheet, which shows the way for the device in hand without leaving
 * the app. Hidden once the app is installed (standalone).
 */
export function InstallEntry({ variant }: { variant: "rail" | "sheet" }) {
  const show = useInstallable(); const [sheet, setSheet] = useState(false);
  const { canPrompt, install } = useInstall();
  if (!show) return null;
  const onClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!canPrompt) { setSheet(true); return; }   // no one-tap offer (Safari, Firefox, or not yet): the way for this device, in place
    await install();
  };
  return <>{variant === "rail"
    ? <Link href="/get" onClick={onClick} data-install className="rail-hide mb-2 flex items-center gap-2 h-9 px-3 rounded-xl bg-white/[.06] text-[12px] font-semibold text-white/80 hover:bg-white/10 hover:text-white transition"><Download size={14} /> Install the app</Link>
    : <Link href="/get" onClick={onClick} data-install className={cn("flex items-center gap-3 h-12 px-3.5 rounded-2xl bg-[var(--color-fill)] text-[14px] font-semibold hover:bg-[var(--color-fill-2)] transition-colors")}><Download size={17} /> Install the app<span className="ml-auto text-xs font-normal text-[var(--color-label-2)]">Android · iPhone · Windows · Mac</span></Link>}
    <InstallSheet open={sheet} onClose={() => setSheet(false)} /></>;
}
