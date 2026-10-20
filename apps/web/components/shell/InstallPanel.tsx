"use client";
import { useEffect, useState, type ReactNode } from "react";
import { AppWindow, Check, ChevronRight, Compass, Copy, Download, Globe, Menu, MonitorDown, MoreHorizontal, MoreVertical, Share, Smartphone, SquarePlus } from "lucide-react";
import Link from "next/link";
import { Loader, cn } from "../ui";
import { copyText } from "@/lib/clipboard";
import { browserName, chromeHref, deviceName, edgeHref, iconHome, stepsPlan, type Env, type Plan } from "@/lib/install";
import { IosGuide } from "./IosGuide";
import { FileButton } from "./DownloadFiles";
import { useInstallOffer } from "./useInstall";

/**
 * The one thing to do on the device in hand — the same everywhere it appears: /get, the install sheet,
 * Settings and the sign-in page. `installPlan()` (lib/install.ts) picks it:
 *
 * - the browser has offered its install → one big button, one tap;
 * - Chrome / Edge / Samsung Internet before that offer → the two or three taps in its own menu;
 * - a browser that cannot install → one tap to one that can: Edge on Windows, Chrome on Android
 *   (from Instagram's or Facebook's own window too);
 * - an iPhone or iPad → Share → Add to Home Screen → Add, drawn (IosGuide); Safari on a Mac → Add to Dock;
 * - installed from here already → where its icon is.
 *
 * ONE way per device (installPlanFor, 2026-10-20 — the owner: "don't show unwanted install options"): an Android
 * phone with the .apk available gets only "Download for Android (.apk)", a Windows PC with the .exe only "Download for
 * Windows (.exe)" — no browser install beside them; an iPhone, iPad, Mac, Linux PC or Chromebook only its browser's
 * way, never a file. Other devices are one compact row to /get (`others="row"`), or nothing where the screen already
 * has its own (`others="none"`: /get, the install sheet). Running as the app: nothing but "You're in the app".
 *
 * `url` is where "open in Edge / Chrome" and "copy" send the person: the install page, so they land on
 * the button.
 */
export function InstallPanel({ size = "md", url, others = "row" }: { size?: "md" | "lg"; url?: string; others?: "row" | "none" }) {
  const { env, plan, busy, install, files, offer } = useInstallOffer();
  const [again, setAgain] = useState(false);
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(location.origin), []);
  if (!env || !plan || !offer) return <div className="h-24" aria-hidden />;   // a frame, before the device and its files are known
  const address = url ?? `${origin}/get`;
  const shown: Plan = plan === "installed-here" && again ? stepsPlan(env) : plan;
  const { device: d, browser: b } = env;
  const name = deviceName(d);

  let body: ReactNode;
  switch (shown) {
    case "installed":
      body = <Done title="You're in the app">DineFlow is installed on this {name} and open as the app.</Done>;
      break;
    case "installed-here":
      body = <>
        <Done title={`Installed on this ${name}`}>Open it from your <b>{iconHome(d)}</b> — the DineFlow icon. It opens on its own, without {browserName(b)} around it.</Done>
        <button type="button" onClick={() => setAgain(true)} className="h-11 px-1 text-[13px] font-semibold text-[var(--color-tint)]" data-install-again>Not there? Install it again</button>
      </>;
      break;
    case "prompt":
      body = <Cta size={size} onClick={() => void install()} busy={busy} icon={<Download size={size === "lg" ? 22 : 20} />} title="Install DineFlow"
        sub={busy ? `Answer ${browserName(b)}'s question…` : "One tap · no app store · updates itself"} data-install-now />;
      break;
    case "ios":
      body = <IosGuide ipad={d === "ipad"} browser={b} />;
      break;
    case "ios-safari-only":
      body = <Card title="Open this page in Safari">
        <p className="text-[13.5px] text-[var(--color-label-2)] leading-snug">On iOS 16.3 or older only Safari can add apps to the Home Screen. Copy the address and paste it into Safari — or update the {name}.</p>
        <CopyRow url={address} />
      </Card>;
      break;
    case "inapp":
      body = <Card title="This window can't install apps">
        <p className="text-[13.5px] text-[var(--color-label-2)] leading-snug">The link opened inside another app — Instagram, Facebook, WhatsApp. Open it in Safari: tap <Glyph><MoreHorizontal size={13} /></Glyph> or the compass <Glyph><Compass size={13} /></Glyph>, then <b>Open in Safari</b> (or <b>Open in browser</b>). Or copy the address:</p>
        <CopyRow url={address} />
      </Card>;
      break;
    case "mac-safari":
      body = <Card title="In Safari on this Mac — two clicks">
        <Steps>
          <Step n={1} icon={<AppWindow size={17} />}>In the menu bar: <b>File</b> → <b>Add to Dock…</b> <span className="text-[var(--color-label-2)]">(or Share <Glyph><Share size={13} /></Glyph> → Add to Dock)</span></Step>
          <Step n={2} icon={<Check size={17} />}>Click <b>Add</b> — DineFlow sits in your Dock and Launchpad, in its own window</Step>
        </Steps>
        <Hint>Needs macOS Sonoma or newer. No <b>Add to Dock</b>? Use Chrome or Edge.</Hint>
      </Card>;
      break;
    case "mac-old-safari":
      body = <Card title="This Safari can't add apps">
        <p className="text-[13.5px] text-[var(--color-label-2)] leading-snug">Adding to the Dock needs Safari 17 on macOS Sonoma or newer. Open this page in <b>Chrome</b> or <b>Edge</b> instead — copy the address:</p>
        <CopyRow url={address} />
      </Card>;
      break;
    case "menu":
      body = <MenuSteps env={env} />;
      break;
    case "firefox-android":
      body = <>
        <Card title="In Firefox — three taps">
          <Steps>
            <Step n={1} icon={<MoreVertical size={17} />}>Tap <Glyph><MoreVertical size={13} /></Glyph>, Firefox&apos;s menu</Step>
            <Step n={2} icon={<SquarePlus size={17} />}>Tap <b>Add app to Home screen</b> (or <b>Install</b>)</Step>
            <Step n={3} icon={<Check size={17} />}>Tap <b>Add</b></Step>
          </Steps>
        </Card>
        <a href={chromeHref(address)} className="h-11 inline-flex items-center gap-1.5 px-1 text-[13px] font-semibold text-[var(--color-tint)]" data-open-chrome>Or open it in Chrome <ChevronRight size={15} /></a>
      </>;
      break;
    case "open-in-edge":
      body = <>
        <Cta size={size} href={edgeHref(address)} icon={<Globe size={size === "lg" ? 22 : 20} />} title="Open in Microsoft Edge"
          sub="Edge comes with Windows — it installs DineFlow in one click" data-open-edge />
        <p className="text-[13px] text-[var(--color-label-2)] leading-snug">{browserName(b)} can&apos;t install apps. Have Chrome? Open this page there instead:</p>
        <CopyRow url={address} />
      </>;
      break;
    case "open-in-chrome":
      body = <>
        <Cta size={size} href={chromeHref(address)} icon={<Globe size={size === "lg" ? 22 : 20} />} title="Open in Chrome"
          sub="Chrome installs DineFlow in one tap" data-open-chrome />
        <p className="text-[13px] text-[var(--color-label-2)] leading-snug">{b === "inapp" ? "This window, inside another app, can't install apps." : `${browserName(b)} can't install apps.`} Or copy the address into Chrome:</p>
        <CopyRow url={address} />
      </>;
      break;
    case "other-desktop":
      body = <Card title={`${browserName(b)} can't install apps`}>
        <p className="text-[13.5px] text-[var(--color-label-2)] leading-snug">Open this page in <b>Chrome</b> or <b>Edge</b>{d === "mac" ? <>, or <b>Safari</b> (File → Add to Dock)</> : null} — copy the address:</p>
        <CopyRow url={address} />
      </Card>;
      break;
    default:
      body = <Card title="Install from the browser's menu">
        <ul className="space-y-2 text-[13.5px] leading-snug">
          <li><b>Chrome or Edge</b> — the install icon <Glyph><MonitorDown size={13} /></Glyph> at the right of the address bar</li>
          <li><b>iPhone or iPad</b> — Safari → Share <Glyph><Share size={13} /></Glyph> → <b>Add to Home Screen</b></li>
          <li><b>Safari on a Mac</b> — File → <b>Add to Dock</b></li>
        </ul>
        <CopyRow url={address} />
      </Card>;
  }

  // one way only: the device's own file when it exists, else the browser's way — never both, never another
  // platform's file (installPlanFor). "Install it again" on an installed-here device follows the same rule.
  const primary = offer.primary === "installed-here" && again ? (offer.kind === "android" && files?.android ? "apk" : offer.kind === "windows" && files?.windows ? "exe" : "browser") : offer.primary;
  const testPlan = primary === "installed" || primary === "installed-here" ? "installed" : offer.kind;
  return (
    <div className="space-y-3" data-install-panel data-install-plan={testPlan} data-install-primary={primary} data-steps={shown} data-device={d} data-browser={b}>
      {primary === "apk" ? <FileButton kind="android" file={files!.android} big />
        : primary === "exe" ? <FileButton kind="windows" file={files!.windows} big />
        : body}
      {others === "row" && primary !== "installed" && <Link href="/get" data-install-other
        className="flex items-center gap-2.5 rounded-2xl bg-[var(--color-fill)] px-3.5 min-h-12 text-[13px] font-semibold hover:bg-[var(--color-fill-2)] transition-colors">
        <Smartphone size={16} className="text-[var(--color-label-2)] shrink-0" aria-hidden /> Install on another device<span className="ml-auto text-[var(--color-label-2)] font-normal">QR & link →</span>
      </Link>}
    </div>
  );
}

/** Chrome / Edge / Samsung Internet that has not offered its one-tap install (yet): its own menu. */
function MenuSteps({ env: { device: d, browser: b } }: { env: Env }) {
  if (d === "android") {
    if (b === "samsung") return <Card title="In Samsung Internet — three taps">
      <Steps>
        <Step n={1} icon={<Menu size={17} />}>Tap <Glyph><Menu size={13} /></Glyph> at the bottom right</Step>
        <Step n={2} icon={<SquarePlus size={17} />}>Tap <b>Add page to</b> → <b>Home screen</b></Step>
        <Step n={3} icon={<Check size={17} />}>Tap <b>Add</b></Step>
      </Steps>
    </Card>;
    if (b === "edge") return <Card title="In Edge — three taps">
      <Steps>
        <Step n={1} icon={<MoreHorizontal size={17} />}>Tap <Glyph><MoreHorizontal size={13} /></Glyph> at the bottom of the screen</Step>
        <Step n={2} icon={<Smartphone size={17} />}>Tap <b>Add to phone</b></Step>
        <Step n={3} icon={<Check size={17} />}>Tap <b>Install</b></Step>
      </Steps>
    </Card>;
    return <Card title="In Chrome — three taps">
      <Steps>
        <Step n={1} icon={<MoreVertical size={17} />}>Tap <Glyph><MoreVertical size={13} /></Glyph> at the top right</Step>
        <Step n={2} icon={<Download size={17} />}>Tap <b>Add to Home screen</b> (or <b>Install app</b>)</Step>
        <Step n={3} icon={<Check size={17} />}>Tap <b>Install</b></Step>
      </Steps>
    </Card>;
  }
  if (b === "edge") return <Card title="In Edge — two clicks">
    <Steps>
      <Step n={1} icon={<MoreHorizontal size={17} />}>Click <Glyph><MoreHorizontal size={13} /></Glyph> at the top right → <b>Apps</b> → <b>Install DineFlow</b></Step>
      <Step n={2} icon={<Check size={17} />}>Click <b>Install</b> — it opens in its own window{d === "windows" ? ", and Edge offers to pin it to Start and the taskbar" : ""}</Step>
    </Steps>
    <Hint>Or the <b>App available</b> icon <Glyph><AppWindow size={13} /></Glyph> at the right of the address bar.</Hint>
  </Card>;
  return <Card title="In Chrome — two clicks">
    <Steps>
      <Step n={1} icon={<MonitorDown size={17} />}>Click the install icon <Glyph><MonitorDown size={13} /></Glyph> at the right of the address bar</Step>
      <Step n={2} icon={<Check size={17} />}>Click <b>Install</b> — it opens in its own window</Step>
    </Steps>
    <Hint>No icon? <Glyph><MoreVertical size={13} /></Glyph> → <b>Cast, save and share</b> → <b>Install page as app</b>.</Hint>
  </Card>;
}

/** The big green action: the browser's install, or the jump to a browser that can. */
function Cta({ size, onClick, href, icon, title, sub, busy, ...data }:
  { size: "md" | "lg"; onClick?: () => void; href?: string; icon: ReactNode; title: string; sub: string; busy?: boolean } & Record<`data-${string}`, boolean>) {
  const cls = cn("w-full flex items-center gap-4 text-left rounded-[20px] bg-[var(--color-tint)] text-[var(--color-on-tint)] transition hover:brightness-105 active:scale-[.99] disabled:opacity-80",
    size === "lg" ? "px-5 py-5" : "px-4 py-4");
  const inner = <>
    <span className={cn("rounded-2xl grid place-items-center shrink-0 bg-[color-mix(in_srgb,var(--color-on-tint)_12%,transparent)]", size === "lg" ? "h-12 w-12" : "h-11 w-11")}>
      {busy ? <Loader size="xs" tone="plain" /> : icon}
    </span>
    <span className="flex-1 min-w-0">
      <span className={cn("block font-bold leading-tight", size === "lg" ? "text-[19px]" : "text-[17px]")}>{title}</span>
      <span className="block text-[13px] opacity-75 mt-1 leading-snug text-balance">{sub}</span>
    </span>
    <ChevronRight size={20} className="shrink-0 opacity-60" />
  </>;
  const shadow = { boxShadow: "0 16px 34px -20px var(--color-tint)" };
  return href
    ? <a href={href} className={cls} style={shadow} {...data}>{inner}</a>
    : <button type="button" onClick={onClick} disabled={busy} className={cls} style={shadow} {...data}>{inner}</button>;
}

function Done({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl bg-[var(--color-green-2)] p-4 flex items-start gap-3" data-installed>
      <span className="h-10 w-10 rounded-full bg-[var(--color-green)] text-[var(--color-on-tint)] grid place-items-center shrink-0"><Check size={20} strokeWidth={3} /></span>
      <div className="min-w-0 pt-0.5">
        <div className="font-semibold text-[15px] leading-tight">{title}</div>
        <p className="text-[13.5px] text-[var(--color-label-2)] mt-1 leading-snug">{children}</p>
      </div>
    </div>
  );
}

/** The address, and a Copy that says so. An old browser that refuses the clipboard still shows it to read. */
export function CopyRow({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => { if (await copyText(url)) { setCopied(true); setTimeout(() => setCopied(false), 2200); } };
  return (
    <div className="mt-3 flex items-center gap-2 rounded-[14px] bg-[var(--color-fill)] p-1.5 pl-3.5">
      <span className="flex-1 min-w-0 truncate text-[13px] font-medium" title={url} data-address>{url.replace(/^https?:\/\//, "")}</span>
      <button type="button" onClick={copy} className="h-11 px-4 rounded-[11px] bg-[var(--color-tint)] text-[var(--color-on-tint)] text-[13px] font-semibold inline-flex items-center gap-1.5 shrink-0" data-copy>
        {copied ? <><Check size={15} /> Copied</> : <><Copy size={15} /> Copy</>}
      </button>
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return <div className="rounded-2xl border border-[var(--color-separator)] bg-[var(--color-bg-2)] p-4"><div className="text-[14px] font-semibold mb-3">{title}</div>{children}</div>;
}
function Steps({ children }: { children: ReactNode }) { return <ol className="space-y-2.5">{children}</ol>; }
function Step({ n, icon, children }: { n: number; icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="relative h-9 w-9 shrink-0 rounded-xl bg-[var(--color-fill)] grid place-items-center text-[var(--color-tint)]">{icon}
        <span className="absolute -top-1 -left-1 h-4 w-4 rounded-full bg-[var(--color-tint)] text-[var(--color-on-tint)] text-[10px] font-bold grid place-items-center num">{n}</span></span>
      <span className="flex-1 min-w-0 text-[14px] leading-snug pt-1.5">{children}</span>
    </li>
  );
}
function Hint({ children }: { children: ReactNode }) { return <p className="mt-3 text-[12.5px] leading-snug text-[var(--color-label-2)]">{children}</p>; }
/** the button's own symbol, inline, so the person can match it on screen. Never "⋯" as text — the font draws it as a dash. */
function Glyph({ children }: { children: ReactNode }) {
  return <span className="inline-grid place-items-center h-5 w-5 align-[-4px] rounded-md bg-[var(--color-fill-2)] text-[var(--color-label)]">{children}</span>;
}
