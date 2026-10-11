"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { cn } from "@/components/ui";

type Prompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/**
 * "Install app", where people look for it — the sidebar's foot and the phone's More sheet — not only
 * deep in Settings. Android, Windows and Mac install from Chrome or Edge, iPhone and iPad from Safari's
 * Share sheet: nothing has to be published to a store. Where the browser has already offered its
 * one-tap install (caught in <head> as window.__dfInstall) this runs it; otherwise it opens /get, which
 * shows the steps for the device in hand. Hidden once the app is installed (standalone).
 */
export function InstallEntry({ variant }: { variant: "rail" | "sheet" }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const standalone = matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setShow(!standalone);
    const gone = () => setShow(false);
    addEventListener("df-installed", gone);
    return () => removeEventListener("df-installed", gone);
  }, []);
  if (!show) return null;
  const onClick = async (e: React.MouseEvent) => {
    const p = (window as Window & { __dfInstall?: Prompt | null }).__dfInstall;
    if (!p) return; // no prompt held: follow the link to /get
    e.preventDefault();
    await p.prompt(); await p.userChoice;
    (window as Window & { __dfInstall?: Prompt | null }).__dfInstall = null;
  };
  return variant === "rail"
    ? <Link href="/get" onClick={onClick} data-install className="rail-hide mb-2 flex items-center gap-2 h-9 px-3 rounded-xl bg-white/[.06] text-[12px] font-semibold text-white/80 hover:bg-white/10 hover:text-white transition"><Download size={14} /> Install the app</Link>
    : <Link href="/get" onClick={onClick} data-install className={cn("flex items-center gap-3 h-12 px-3.5 rounded-2xl bg-[var(--color-fill)] text-[14px] font-semibold hover:bg-[var(--color-fill-2)] transition-colors")}><Download size={17} /> Install the app<span className="ml-auto text-xs font-normal text-[var(--color-label-2)]">Android · iPhone · Windows</span></Link>;
}
