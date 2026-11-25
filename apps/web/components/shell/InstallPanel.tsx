"use client";
import { useEffect, useState, type ReactNode } from "react";
import { Apple, AppWindow, Check, ChevronRight, Compass, Copy, Download, Globe, Menu, Monitor, MonitorDown, MoreHorizontal, MoreVertical, Share, Smartphone, SquarePlus } from "lucide-react";
import { Loader, cn } from "../ui";
import { copyText } from "@/lib/clipboard";
import { browserName, chromeHref, deviceName, edgeHref, iconHome, msStoreHref, PLATFORMS, stepsPlan, type Env, type Plan, type Platform } from "@/lib/install";
import type { Downloads } from "@/lib/installers";
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
 * Windows (.exe)" — no browser install beside them; an iPhone or iPad gets the App Store when NEXT_PUBLIC_IOS_URL is
 * set, else Add to Home Screen; a Mac its browser's way, never a file.
 *
 * THREE platforms only, the same on every screen (2026-11-25 — the owner: "only Windows .exe, Android .apk and Apple
 * iPhone · iPad · Mac in the installation process, all the same"): this device's platform first and big, then the
 * other two under "Other devices", one row each (`[data-platform=windows|android|ios]`) — the file in one click when
 * it exists. A Linux PC or Chromebook gets the three rows only. Running as the app: "You're in the app".
 *
 * `url` is where "open in Edge / Chrome" and "copy" send the person: the install page, so they land on
 * the button.
 */
export function InstallPanel({ size = "md", url }: { size?: "md" | "lg"; url?: string }) {
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
      body = <Done title="You're in the app" />;
      break;
    case "installed-here":
      body = <>
        <Done title={`Installed on this ${name}`}>Open from your <b>{iconHome(d)}</b></Done>
        <button type="button" onClick={() => setAgain(true)} className="h-11 px-1 text-[13px] font-semibold text-[var(--color-tint)]" data-install-again>Install again</button>
      </>;
      break;
    case "prompt":
      body = <Cta size={size} onClick={() => void install()} busy={busy} icon={<Download size={size === "lg" ? 22 : 20} />} title="Install DineFlow"
        sub={busy ? `Answer ${browserName(b)}'s question…` : "One tap · auto-updates"} data-install-now />;
      break;
    case "ios":
      body = <IosGuide ipad={d === "ipad"} browser={b} />;
      break;
    case "ios-safari-only":
      body = <Card title="Open in Safari">
        <p className="text-[13.5px] text-[var(--color-label-2)] leading-snug">iOS 16.3 or older: Safari only</p>
        <CopyRow url={address} />
      </Card>;
      break;
    case "inapp":
      body = <Card title="Can't install here">
        <p className="text-[13.5px] text-[var(--color-label-2)] leading-snug">Tap <Glyph><MoreHorizontal size={13} /></Glyph> or <Glyph><Compass size={13} /></Glyph> → <b>Open in Safari</b> or <b>browser</b>. Or copy:</p>
        <CopyRow url={address} />
      </Card>;
      break;
    case "mac-safari":
      body = <Card title="Safari — two clicks">
        <Steps>
          <Step n={1} icon={<AppWindow size={17} />}><b>File</b> → <b>Add to Dock…</b> <span className="text-[var(--color-label-2)]">(or Share <Glyph><Share size={13} /></Glyph> → Add to Dock)</span></Step>
          <Step n={2} icon={<Check size={17} />}>Click <b>Add</b></Step>
        </Steps>
        <Hint>Needs macOS Sonoma. Else Chrome or Edge.</Hint>
      </Card>;
      break;
    case "mac-old-safari":
      body = <Card title="Safari too old">
        <p className="text-[13.5px] text-[var(--color-label-2)] leading-snug">Needs Safari 17. Copy into <b>Chrome</b> or <b>Edge</b>:</p>
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
        <a href={chromeHref(address)} className="h-11 inline-flex items-center gap-1.5 px-1 text-[13px] font-semibold text-[var(--color-tint)]" data-open-chrome>Or use Chrome <ChevronRight size={15} /></a>
      </>;
      break;
    case "open-in-edge":
      body = <>
        <Cta size={size} href={edgeHref(address)} icon={<Globe size={size === "lg" ? 22 : 20} />} title="Open in Microsoft Edge"
          sub="One-click install" data-open-edge />
        <p className="text-[13px] text-[var(--color-label-2)] leading-snug">{browserName(b)} can&apos;t install. Or copy into Chrome:</p>
        <CopyRow url={address} />
      </>;
      break;
    case "open-in-chrome":
      body = <>
        <Cta size={size} href={chromeHref(address)} icon={<Globe size={size === "lg" ? 22 : 20} />} title="Open in Chrome"
          sub="One-tap install" data-open-chrome />
        <p className="text-[13px] text-[var(--color-label-2)] leading-snug">{b === "inapp" ? "This window can't install." : `${browserName(b)} can't install.`} Or copy into Chrome:</p>
        <CopyRow url={address} />
      </>;
      break;
    case "other-desktop":
      body = <Card title={`${browserName(b)} can't install`}>
        <p className="text-[13.5px] text-[var(--color-label-2)] leading-snug">Copy into <b>Chrome</b> or <b>Edge</b>{d === "mac" ? <>, or <b>Safari</b> (File → Add to Dock)</> : null}:</p>
        <CopyRow url={address} />
      </Card>;
      break;
    default:
      body = <Card title="Install from browser">
        <ul className="space-y-2 text-[13.5px] leading-snug">
          <li><b>Chrome or Edge</b> — <Glyph><MonitorDown size={13} /></Glyph> in the address bar</li>
          <li><b>iPhone or iPad</b> — Safari → Share <Glyph><Share size={13} /></Glyph> → <b>Add to Home Screen</b></li>
          <li><b>Safari on a Mac</b> — File → <b>Add to Dock</b></li>
        </ul>
        <CopyRow url={address} />
      </Card>;
  }

  // one way only: the device's own file (or App Store link) when it exists, else the browser's way — never both
  // (installPlanFor). "Install it again" on an installed-here device follows the same rule.
  const primary = offer.primary === "installed-here" && again
    ? (offer.kind === "android" && files?.android ? "apk" : offer.kind === "windows" && files?.windows ? "exe"
      : offer.kind === "ios" && files?.ios && (d === "iphone" || d === "ipad") ? "store" : "browser")
    : offer.primary;
  const installed = primary === "installed" || primary === "installed-here";
  const testPlan = installed ? "installed" : offer.kind;
  // the THREE platforms (2026-11-25 — the owner: "only Windows .exe, Android .apk and Apple iPhone · iPad · Mac"):
  // this device's own one first and big, the other two as one row each. A Linux PC or Chromebook has no platform of
  // its own: it gets the three rows only.
  const own: Platform | null = offer.kind === "desktop" ? null : offer.kind;
  const mine = primary === "apk" ? <FileButton kind="android" file={files!.android} big />
    : primary === "msstore" ? <Cta size={size} href={msStoreHref(files!.msstore!.file)} icon={<MonitorDown size={size === "lg" ? 22 : 20} />} title="Get it from Microsoft Store"
      sub="One click · no warnings · updates itself" data-ms-store />
    : primary === "exe" ? <FileButton kind="windows" file={files!.windows} big />
    : primary === "store" ? <Cta size={size} href={files!.ios!.url} icon={<Apple size={size === "lg" ? 22 : 20} />} title="Get it on the App Store"
      sub={`One tap${files!.ios!.version ? ` · v${files!.ios!.version}` : ""}`} data-app-store />
    : own || installed ? body : null;
  const rest = PLATFORMS.filter((p) => p !== own);
  return (
    <div className="space-y-3" data-install-panel data-install-plan={testPlan} data-install-primary={primary} data-steps={shown} data-device={d} data-browser={b}>
      {mine}
      {primary !== "installed" && <div className={cn("space-y-2", mine && "pt-2")} data-platforms>
        <div className="text-[11.5px] font-semibold uppercase tracking-[0.12em] text-[var(--color-label-2)] px-1">{mine ? "Other devices" : "Choose your device"}</div>
        {rest.map((p) => <PlatformRow key={p} p={p} files={files} address={address} />)}
      </div>}
    </div>
  );
}

const PLATFORM: Record<Platform, { title: string; tag: string; Icon: typeof Smartphone; how: string }> = {
  windows: { title: "Windows PC · laptop", tag: ".exe", Icon: Monitor, how: "in Edge → Install" },
  android: { title: "Android phone · tablet", tag: ".apk", Icon: Smartphone, how: "in Chrome → Install" },
  ios: { title: "iPhone · iPad · Mac", tag: "Apple", Icon: Apple, how: "in Safari → Share → Add to Home Screen" },
};

/** One of the other platforms, one row: its file (or App Store link) to download in one click when it exists, else the
 *  one line that installs it from the browser on that device. */
function PlatformRow({ p, files, address }: { p: Platform; files: Downloads | null; address: string }) {
  const m = PLATFORM[p];
  // Windows: the Microsoft Store listing when there is one (no SmartScreen warning), else the .exe
  const store = p === "windows" ? files?.msstore ?? null : null;
  const f = store ?? files?.[p] ?? null;
  const mb = f?.size ? `${(f.size / 1048576).toFixed(f.size > 10485760 ? 0 : 1)} MB` : null;
  const sub = f
    ? (store ? "Microsoft Store · one click, no warnings" : [p === "ios" ? "App Store · one tap" : "One-click install", f.version && `v${f.version}`, mb].filter(Boolean).join(" · "))
    : `Open ${address.replace(/^https?:\/\//, "")} ${m.how}`;
  const inner = <>
    <span className={cn("h-10 w-10 rounded-xl grid place-items-center shrink-0", f ? "bg-[var(--color-fill)] text-[var(--color-tint)]" : "bg-[var(--color-fill)] text-[var(--color-label-2)]")}><m.Icon size={18} aria-hidden /></span>
    <span className="flex-1 min-w-0">
      <span className="block text-[14.5px] font-semibold leading-tight">{m.title} <span className="text-[var(--color-label-2)] font-medium">({store ? "Microsoft Store" : m.tag})</span></span>
      <span className="block text-[12px] text-[var(--color-label-2)] mt-1 leading-snug break-words">{sub}</span>
    </span>
    {f && (p === "ios" || store ? <ChevronRight size={17} className="shrink-0 text-[var(--color-label-2)]" aria-hidden /> : <Download size={17} className="shrink-0 text-[var(--color-label-2)]" aria-hidden />)}
  </>;
  const cls = "w-full flex items-center gap-3 rounded-2xl border border-[var(--color-separator)] bg-[var(--color-bg-2)] px-3.5 py-3 min-h-14 text-left";
  if (!f) return <div className={cls} data-platform={p}>{inner}</div>;
  return p === "ios" || store
    ? <a href={f.url} target="_blank" rel="noopener" className={cn(cls, "hover:bg-[var(--color-fill)] transition-colors")} data-platform={p} {...(store ? { "data-ms-store": "" } : { "data-app-store": "" })}>{inner}</a>
    : <a href={f.url} download={f.file} rel="noopener" className={cn(cls, "hover:bg-[var(--color-fill)] transition-colors")} data-platform={p} data-download={p}>{inner}</a>;
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
        <Step n={1} icon={<MoreHorizontal size={17} />}>Tap <Glyph><MoreHorizontal size={13} /></Glyph> at the bottom</Step>
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
      <Step n={1} icon={<MoreHorizontal size={17} />}>Click <Glyph><MoreHorizontal size={13} /></Glyph> → <b>Apps</b> → <b>Install DineFlow</b></Step>
      <Step n={2} icon={<Check size={17} />}>Click <b>Install</b></Step>
    </Steps>
    <Hint>Or <b>App available</b> <Glyph><AppWindow size={13} /></Glyph> in the address bar</Hint>
  </Card>;
  return <Card title="In Chrome — two clicks">
    <Steps>
      <Step n={1} icon={<MonitorDown size={17} />}>Click <Glyph><MonitorDown size={13} /></Glyph> in the address bar</Step>
      <Step n={2} icon={<Check size={17} />}>Click <b>Install</b></Step>
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

function Done({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl bg-[var(--color-green-2)] p-4 flex items-start gap-3" data-installed>
      <span className="h-10 w-10 rounded-full bg-[var(--color-green)] text-[var(--color-on-tint)] grid place-items-center shrink-0"><Check size={20} strokeWidth={3} /></span>
      <div className="min-w-0 pt-0.5">
        <div className="font-semibold text-[15px] leading-tight">{title}</div>
        {children && <p className="text-[13.5px] text-[var(--color-label-2)] mt-1 leading-snug">{children}</p>}
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
