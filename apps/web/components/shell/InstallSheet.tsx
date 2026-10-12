"use client";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, Download, MoreHorizontal, MoreVertical, Share, MonitorDown, AppWindow, Smartphone } from "lucide-react";
import { Button, Sheet, cn } from "../ui";
import { copyText } from "@/lib/clipboard";
import { IosGuide } from "./IosGuide";

/**
 * Install DineFlow on the device in hand, without leaving the app.
 *
 * Apple gives a web page no install button — on an iPhone, an iPad and in Safari on a Mac, the app is
 * added from the browser's own Share menu. So on those this sheet shows the exact taps for that device
 * and that browser (they differ: an iPhone's Share sits beside the address bar or under ⋯, an iPad's at
 * the top right, a Mac's in the File menu as "Add to Dock"). Where the browser has already offered its
 * one-tap install (Chrome and Edge on Android, Windows and the Mac — caught in <head> as
 * window.__dfInstall), it runs that instead. Inside WhatsApp's or Instagram's browser nothing can
 * install, so it says so and hands over the address.
 */
type Device = "iphone" | "ipad" | "mac" | "android" | "windows" | "other";
type Browser = "safari" | "chrome" | "edge" | "firefox" | "inapp" | "other";
type Prompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export function detectDevice(): { device: Device; browser: Browser } {
  if (typeof navigator === "undefined") return { device: "other", browser: "other" };
  const ua = navigator.userAgent;
  const device: Device = /iPhone|iPod/i.test(ua) ? "iphone"
    // iPadOS asks for the desktop site and reports itself as a Mac; its touch points give it away
    : /iPad/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) ? "ipad"
    : /Android/i.test(ua) ? "android" : /Windows/i.test(ua) ? "windows" : /Macintosh|Mac OS X/i.test(ua) ? "mac" : "other";
  const browser: Browser = /FBAN|FBAV|FB_IAB|Instagram|WhatsApp|Line\/|LinkedInApp|Snapchat|MicroMessenger|; wv\)/i.test(ua) ? "inapp"
    : /EdgiOS|Edg\//i.test(ua) ? "edge" : /CriOS|Chrome\//i.test(ua) ? "chrome" : /FxiOS|Firefox\//i.test(ua) ? "firefox"
    : /Safari\//i.test(ua) ? "safari" : "other";
  return { device, browser };
}
export const isInstalled = () => typeof window !== "undefined" && (matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

/** Whether to offer installing at all: not once it is installed. */
export function useInstallable() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    setShow(!isInstalled());
    const gone = () => setShow(false);
    addEventListener("df-installed", gone);
    return () => removeEventListener("df-installed", gone);
  }, []);
  return show;
}

export function InstallSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [env, setEnv] = useState<{ device: Device; browser: Browser } | null>(null);
  const [canPrompt, setCanPrompt] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!open) return;
    setEnv(detectDevice());
    setCanPrompt(Boolean((window as Window & { __dfInstall?: unknown }).__dfInstall));
    const on = () => setCanPrompt(true);
    addEventListener("df-installable", on);
    return () => removeEventListener("df-installable", on);
  }, [open]);
  const install = async () => {
    const p = (window as Window & { __dfInstall?: Prompt | null }).__dfInstall;
    if (!p) return;
    await p.prompt(); const r = await p.userChoice;
    (window as Window & { __dfInstall?: Prompt | null }).__dfInstall = null; setCanPrompt(false);
    if (r.outcome === "accepted") onClose();
  };
  const url = typeof location !== "undefined" ? `${location.origin}/dashboard` : "";
  const copy = async () => { if (await copyText(url)) { setCopied(true); setTimeout(() => setCopied(false), 2500); } };

  /* drawn into <body>, not where the button sits: inside the sidebar the sheet opened behind the
     page (the aside is its own stacking context), and inside the sticky top bar the phone's tab bar
     and the assistant's button covered its lower half */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const d = env?.device, b = env?.browser;
  const name = d === "iphone" ? "iPhone" : d === "ipad" ? "iPad" : d === "mac" ? "Mac" : d === "android" ? "phone" : d === "windows" ? "PC" : "device";
  if (!mounted) return null;
  return createPortal(
    <Sheet open={open} onClose={onClose} title={`Install on this ${name}`}>
      {env && <div className="space-y-4" data-install-sheet data-device={d} data-browser={b}>
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- the app's own icon, as it will look on the Home Screen */}
          <img src="/apple-touch-icon.png" alt="" width={52} height={52} className="h-[52px] w-[52px] rounded-[14px] shadow-[0_6px_18px_-6px_rgb(0_0_0/.6)]" />
          <p className="text-[13px] text-[var(--color-label-2)] leading-snug">DineFlow opens full screen from its own icon, like any app — no store, nothing to download, and it updates itself.</p>
        </div>

        {b === "inapp" ? (
          <Card title="This window can't install apps">
            <p className="text-[13px] text-[var(--color-label-2)]">The link was opened inside another app (WhatsApp, Instagram…). Open it in {d === "iphone" || d === "ipad" ? "Safari" : "Chrome"} instead — copy the address and paste it there, or use that app&apos;s <Glyph><MoreHorizontal size={13} /></Glyph> menu → <b>Open in browser</b>.</p>
            <div className="mt-3 rounded-xl bg-[var(--color-fill)] px-3 py-2.5 text-[13px] break-all num">{url}</div>
            <Button className="w-full mt-2" onClick={copy}>{copied ? <><Check size={16} /> Copied</> : <><Copy size={16} /> Copy the address</>}</Button>
          </Card>
        ) : canPrompt ? (
          <Button size="lg" className="w-full" onClick={install} data-install-now><Download size={18} /> Install DineFlow</Button>
        ) : d === "iphone" || d === "ipad" ? (
          /* shown, not told: a drawing of each Safari screen with the button to tap ringed */
          <>
            <IosGuide ipad={d === "ipad"} browser={b} />
            {b === "firefox" && <p className="text-xs text-[var(--color-label-2)]">If Firefox doesn&apos;t show Add to Home Screen, open this page in Safari.</p>}
          </>
        ) : d === "mac" ? (
          b === "safari" ? (
            <Card title="In Safari on this Mac — two clicks">
              <ol className="space-y-2.5">
                <Step n={1} icon={<AppWindow size={17} />}>Menu bar: <b>File</b> → <b>Add to Dock…</b> <span className="text-[var(--color-label-2)]">(or the Share button <Glyph><Share size={13} /></Glyph> → Add to Dock)</span></Step>
                <Step n={2} icon={<Check size={17} />}>Click <b>Add</b> — DineFlow sits in your Dock and Launchpad, in its own window</Step>
              </ol>
              <p className="mt-3 text-xs text-[var(--color-label-2)]">Needs macOS Sonoma or newer. On an older Mac, use Chrome or Edge.</p>
            </Card>
          ) : (
            <Card title={`In ${b === "edge" ? "Edge" : "Chrome"} on this Mac`}>
              <ol className="space-y-2.5">
                <Step n={1} icon={<MonitorDown size={17} />}>Click the install icon <Glyph><MonitorDown size={13} /></Glyph> at the right of the address bar</Step>
                <Step n={2} icon={<MoreVertical size={17} />}>Or <Glyph><MoreVertical size={13} /></Glyph> → <b>Cast, save and share</b> → <b>Install page as app</b>{b === "edge" ? <> (Edge: <Glyph><MoreHorizontal size={13} /></Glyph> → <b>Apps</b> → <b>Install</b>)</> : null}</Step>
              </ol>
            </Card>
          )
        ) : d === "android" ? (
          <Card title="In Chrome — three taps">
            <ol className="space-y-2.5">
              <Step n={1} icon={<MoreVertical size={17} />}>Tap <Glyph><MoreVertical size={13} /></Glyph> at the top right</Step>
              <Step n={2} icon={<Download size={17} />}>Choose <b>Install app</b> (or <b>Add to Home screen</b>)</Step>
              <Step n={3} icon={<Check size={17} />}>Tap <b>Install</b></Step>
            </ol>
          </Card>
        ) : (
          <Card title="From the browser's menu">
            <ol className="space-y-2.5">
              <Step n={1} icon={<MonitorDown size={17} />}><b>Edge:</b> <Glyph><MoreHorizontal size={13} /></Glyph> → <b>Apps</b> → <b>Install DineFlow</b></Step>
              <Step n={2} icon={<MonitorDown size={17} />}><b>Chrome:</b> the install icon at the right of the address bar</Step>
            </ol>
          </Card>
        )}

        <a href="/get" className="flex items-center gap-2.5 rounded-2xl bg-[var(--color-fill)] px-3.5 h-12 text-[13px] font-semibold hover:bg-[var(--color-fill-2)] transition-colors">
          <Smartphone size={16} className="text-[var(--color-label-2)]" /> Another phone, iPad or computer?<span className="ml-auto text-[var(--color-label-2)] font-normal">QR & steps →</span>
        </a>
      </div>}
    </Sheet>, document.body);
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return <div className="rounded-2xl border border-[var(--color-separator)] bg-[var(--color-bg-2)] p-4"><div className="text-[13px] font-semibold mb-3">{title}</div>{children}</div>;
}
function Step({ n, icon, children }: { n: number; icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="relative h-9 w-9 shrink-0 rounded-xl bg-[var(--color-fill)] grid place-items-center text-[var(--color-tint)]">{icon}
        <span className="absolute -top-1 -left-1 h-4 w-4 rounded-full bg-[var(--color-tint)] text-[#06120a] text-[10px] font-bold grid place-items-center num">{n}</span></span>
      <span className="flex-1 min-w-0 text-[14px] leading-snug pt-1.5">{children}</span>
    </li>
  );
}
/** the button's own symbol, inline, so the person can match it on screen */
function Glyph({ children }: { children: ReactNode }) {
  return <span className={cn("inline-grid place-items-center h-5 w-5 align-[-4px] rounded-md bg-[var(--color-fill-2)] text-[var(--color-label)]")}>{children}</span>;
}

/** The round button in the top bar that opens the sheet — shown only until the app is installed. */
export function InstallButton({ className }: { className?: string }) {
  const show = useInstallable(); const [open, setOpen] = useState(false);
  if (!show) return null;
  return (<>
    <button type="button" onClick={() => setOpen(true)} aria-label="Install the app" title="Install the app" data-install-btn
      className={cn("h-11 w-11 grid place-items-center rounded-full hover:bg-[var(--color-fill)] text-[var(--color-label-2)]", className)}><Download size={17} /></button>
    <InstallSheet open={open} onClose={() => setOpen(false)} />
  </>);
}
