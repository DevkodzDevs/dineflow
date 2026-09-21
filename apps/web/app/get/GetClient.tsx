"use client";
import { useEffect, useState } from "react";
import { Apple, BookOpen, Check, Copy, Download, ExternalLink, Monitor, Share, Smartphone, SquarePlus } from "lucide-react";
import { QR } from "@/components/QR";

/**
 * One address to hand anybody — an owner, a new waiter, a cook on their own phone — that works out
 * what they are holding and gives them the one button that installs DineFlow on it. Everything else
 * is still here, underneath, for the person setting up a floor of devices from one screen.
 *
 * The detection is deliberately shallow. Getting it wrong costs a person one extra tap on a button
 * that is right there below; being clever about it costs nothing and risks showing an Android file
 * to an iPhone, which cannot install it at all.
 */

type Kind = "windows" | "android" | "ios" | "mac" | "other";
type Links = { windows: string | null; android: string | null };

function detect(): Kind {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return "android";
  // iPadOS reports itself as a Mac; the touch points are the only honest tell
  if (/iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "ios";
  if (/Windows/i.test(ua)) return "windows";
  if (/Mac/i.test(ua)) return "mac";
  return "other";
}

/**
 * Which window the page is sitting in, which decides whether installing is possible at all.
 *
 * The common way this page gets opened is the one that cannot work: somebody sends the link over
 * WhatsApp, the person taps it, and WhatsApp renders it inside itself. That window has no install
 * prompt, no Share menu that offers the Home Screen, and no address bar to escape from — so the
 * install button would simply do nothing, and the person would conclude the app is broken. There is
 * no way to leave an in-app browser from script either, so the only honest answer is to say what
 * happened and make the address trivial to carry out by hand.
 */
type Where = "inapp" | "ios-other" | "normal";
function where(kind: Kind): Where {
  if (typeof navigator === "undefined") return "normal";
  const ua = navigator.userAgent;
  if (/FBAN|FBAV|FB_IAB|Instagram|WhatsApp|Line\/|LinkedInApp|Snapchat|Twitter|MicroMessenger|; wv\)/i.test(ua)) return "inapp";
  // On an iPhone only Safari has "Add to Home Screen" where people expect it; the others hide it or
  // lack it, and sending someone hunting through the wrong menu is the struggle worth avoiding.
  if (kind === "ios" && /CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua)) return "ios-other";
  return "normal";
}

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export function GetClient({ links, pageUrl }: { links: Links; pageUrl: string }) {
  const [kind, setKind] = useState<Kind | null>(null);
  const [spot, setSpot] = useState<Where>("normal");
  const [canPrompt, setCanPrompt] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const k = detect();
    setKind(k);
    setSpot(where(k));
    setInstalled(matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
    // the root layout catches this in <head> long before this page mounts
    setCanPrompt(Boolean((window as Window & { __dfInstall?: unknown }).__dfInstall));
    const on = () => setCanPrompt(true);
    const off = () => { setCanPrompt(false); setInstalled(true); };
    addEventListener("df-installable", on);
    addEventListener("df-installed", off);
    return () => { removeEventListener("df-installable", on); removeEventListener("df-installed", off); };
  }, []);

  const installPwa = async () => {
    const e = (window as Window & { __dfInstall?: PromptEvent }).__dfInstall;
    if (!e) return;
    await e.prompt();
    await e.userChoice;
    (window as Window & { __dfInstall?: unknown }).__dfInstall = null;
    setCanPrompt(false);
  };

  if (kind === null) return <div className="h-40" />;   // one frame, before we know what this is

  return (
    <main className="min-h-dvh deck flex flex-col items-center justify-center px-5 py-14">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mark.png" alt="" width={56} height={56} className="h-14 w-14 object-contain" />
          <h1 className="font-display text-3xl mt-4 tracking-wide text-[#f4f4f1]">Install DineFlow</h1>
          <p className="text-[#9a9aa6] mt-2 text-[15px] leading-relaxed">
            {installed ? "This device already has it." : "One tap. It opens on its own, without a browser around it, and keeps working when the line drops."}
          </p>
        </div>

        {!installed && (
          <div className="mt-8">
            {spot === "normal"
              ? <Primary kind={kind} links={links} canPrompt={canPrompt} onPwa={installPwa} />
              : <WrongWindow spot={spot} url={pageUrl} />}
          </div>
        )}

        <div className="mt-8 pt-6 border-t border-white/10">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#62626e] text-center">Another device</div>
          <div className="mt-4 grid gap-2.5">
            {(kind !== "windows" || !links.windows) && <Other icon={<Monitor size={16} />} title="Windows" note={links.windows ? "Installer · 79 MB" : "Not published yet"} href={links.windows} />}
            {kind !== "android" && <Other icon={<Smartphone size={16} />} title="Android" note={links.android ? "APK · install straight from the file" : "Not published yet"} href={links.android} />}
            {kind !== "ios" && <Other icon={<Apple size={16} />} title="iPhone or iPad" note="Open this page in Safari on the device" href={null} />}
          </div>
        </div>

        {/* the printed manual, for whoever is setting the place up rather than using it */}
        <a href="/DineFlow-Manual.pdf" download
          className="mt-8 flex items-center gap-3 rounded-2xl border border-white/10 bg-[#1f2027] p-3.5 hover:border-white/25 transition-colors">
          <span className="h-9 w-9 rounded-xl bg-white/[.07] grid place-items-center shrink-0 text-[#9a9aa6]"><BookOpen size={16} /></span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-semibold text-[#f4f4f1]">The manual</span>
            <span className="block text-xs text-[#62626e] mt-0.5">Every screen explained, with pictures · PDF</span>
          </span>
          <Download size={15} className="text-[#62626e] shrink-0" />
        </a>

        <div className="mt-8 flex flex-col items-center gap-3">
          <div className="bg-white p-2.5 rounded-xl"><QR value={pageUrl} size={116} /></div>
          <p className="text-xs text-[#62626e] text-center">Scan to open this page on a phone.</p>
        </div>
      </div>
    </main>
  );
}

/**
 * The page is open somewhere that cannot install. Nothing here can fix that from script — an in-app
 * browser gives no way out — so it says plainly what is wrong and hands over the address in one tap.
 */
function WrongWindow({ spot, url }: { spot: Where; url: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2500); }
    catch { /* an old browser with no clipboard: the address is printed below to read out */ }
  };
  const inApp = spot === "inapp";
  return (
    <div className="feather p-5 !bg-[#1f2027] !border-white/10">
      <p className="text-[15px] text-[#f4f4f1] font-semibold">
        {inApp ? "This window can't install apps" : "Open this in Safari to install"}
      </p>
      <p className="text-sm text-[#9a9aa6] mt-1.5 leading-relaxed">
        {inApp
          ? "You've opened the link inside another app's browser — WhatsApp, Instagram or similar. Those windows have no install option at all. Open it in Chrome or Safari instead and the button appears."
          : "On an iPhone, only Safari can add an app to the Home Screen. Copy the address below and paste it into Safari."}
      </p>
      <div className="mt-4 rounded-xl bg-black/30 px-3 py-2.5 text-[13px] text-[#cfcfd6] break-all num">{url}</div>
      <button onClick={copy} className="mt-3 w-full h-11 rounded-xl bg-[var(--color-tint)] text-[#06120a] font-semibold flex items-center justify-center gap-2">
        {copied ? <><Check size={16} /> Copied — now paste it into {inApp ? "your browser" : "Safari"}</> : <><Copy size={16} /> Copy the address</>}
      </button>
      {inApp && (
        <p className="text-xs text-[#62626e] mt-3 flex items-center gap-1.5">
          <ExternalLink size={12} className="shrink-0" /> Many of these apps also have “Open in browser” in their ⋯ menu.
        </p>
      )}
    </div>
  );
}

function Primary({ kind, links, canPrompt, onPwa }: { kind: Kind; links: Links; canPrompt: boolean; onPwa: () => void }) {
  /* The browser's own install comes first on every platform that offers it — Windows, Android, Mac,
     Linux. It is one click, it raises no warning, it needs no file to be downloaded or trusted, and
     it updates itself the moment the site does. A packaged installer can do none of those things, so
     it belongs underneath as the answer for a browser that cannot do this, not above as the headline. */
  if (canPrompt) return (
    <button onClick={onPwa} className="w-full feather !bg-[var(--color-tint)] !border-transparent text-[#06120a] p-5 flex items-center gap-4 text-left transition hover:brightness-105">
      <Download size={20} className="shrink-0" />
      <span>
        <span className="block font-semibold text-[17px]">Install DineFlow</span>
        <span className="block text-[13px] opacity-75 mt-0.5">One tap · no download, no warnings, updates itself</span>
      </span>
    </button>
  );

  if (kind === "ios") return (
    <div className="feather p-5 !bg-[#1f2027] !border-white/10">
      <p className="text-sm text-[#9a9aa6]">Safari installs from its own menu — Apple gives a page no button to do it with. Three taps:</p>
      <ol className="mt-4 space-y-3 text-[15px] text-[#f4f4f1]">
        <Step icon={<Share size={15} />} n="1">Tap <b>Share</b>, at the bottom of the screen</Step>
        <Step icon={<SquarePlus size={15} />} n="2">Choose <b>Add to Home Screen</b></Step>
        <Step icon={<Check size={15} />} n="3">Tap <b>Add</b> — it lands beside your other apps</Step>
      </ol>
    </div>
  );

  /* No install prompt here — Firefox, or Safari on a Mac. The packaged file is the fallback, and its
     warning is named rather than discovered: an unsigned installer stops Windows in its tracks, and
     somebody who was told to expect one click will assume the file is unsafe and abandon it. */
  if (kind === "windows" && links.windows) return (
    <div>
      <Big href={links.windows} icon={<Download size={20} />} title="Download for Windows" note="DineFlow-Setup.exe · 79 MB" />
      <p className="text-xs text-[#62626e] mt-3 leading-relaxed">
        Windows will say <i>“Windows protected your PC”</i> because this installer is not signed yet.
        Choose <b>More info</b>, then <b>Run anyway</b>. Installing from Chrome or Edge instead avoids that entirely.
      </p>
    </div>
  );

  if (kind === "android" && links.android) return (
    <div>
      <Big href={links.android} icon={<Download size={20} />} title="Download for Android" note="APK · open the file when it finishes" />
      <p className="text-xs text-[#62626e] mt-3 leading-relaxed">
        Android will ask permission to install from this source. Opening this page in <b>Chrome</b> installs it in one tap with nothing to allow.
      </p>
    </div>
  );

  return (
    <div className="feather p-5 !bg-[#1f2027] !border-white/10 text-sm text-[#9a9aa6]">
      <p>This browser installs from its own menu:</p>
      <ul className="mt-3 space-y-2">
        <li><b className="text-[#f4f4f1]">Chrome or Edge</b> — the install icon at the right of the address bar.</li>
        <li><b className="text-[#f4f4f1]">Safari on a Mac</b> — <i>File</i> → <i>Add to Dock</i>.</li>
        <li><b className="text-[#f4f4f1]">Firefox</b> — no desktop install; on Android, <i>Add to Home screen</i>.</li>
      </ul>
    </div>
  );
}

function Big({ href, icon, title, note }: { href: string; icon: React.ReactNode; title: string; note: string }) {
  return (
    <a href={href} download className="w-full feather !bg-[var(--color-tint)] !border-transparent text-[#06120a] p-5 flex items-center gap-4 transition hover:brightness-110">
      <span className="shrink-0">{icon}</span>
      <span><span className="block font-semibold text-[17px]">{title}</span><span className="block text-[13px] opacity-75 mt-0.5">{note}</span></span>
    </a>
  );
}

function Other({ icon, title, note, href }: { icon: React.ReactNode; title: string; note: string; href: string | null }) {
  const inner = (
    <>
      <span className="h-9 w-9 rounded-xl bg-white/[.06] grid place-items-center shrink-0 text-[#9a9aa6]">{icon}</span>
      <span className="flex-1 min-w-0"><span className="block text-sm font-semibold text-[#f4f4f1]">{title}</span><span className="block text-xs text-[#62626e] mt-0.5">{note}</span></span>
      {href && <Download size={15} className="text-[#62626e] shrink-0" />}
    </>
  );
  const cls = "flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[.03] p-3";
  return href ? <a href={href} download className={`${cls} transition hover:bg-white/[.07]`}>{inner}</a> : <div className={cls}>{inner}</div>;
}

function Step({ icon, n, children }: { icon: React.ReactNode; n: string; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3">
      <span className="h-8 w-8 rounded-xl bg-white/[.06] grid place-items-center shrink-0 text-[#9a9aa6]">{icon}</span>
      <span className="flex-1">{children}</span>
      <span className="num text-xs text-[#62626e]">{n}</span>
    </li>
  );
}
