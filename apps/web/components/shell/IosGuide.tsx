"use client";
import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Share, MoreHorizontal, Menu, SquarePlus, Copy, Bookmark, RotateCw, ChevronLeft, ChevronRight, Check, Lock } from "lucide-react";
import { cn } from "../ui";

/**
 * Installing on an iPhone or iPad, shown rather than told. Apple gives a web page no install button,
 * so the person has to find three things in Safari's own screens — and the words "tap Share" meant
 * nothing to an owner who had never noticed the Share button. Each step is a drawing of the screen
 * they will see, with the one thing to tap ringed and pulsing and a label pointing at it; Next/Back
 * and a swipe move between them; the last shows the icon where it lands.
 *
 * The drawings are the shapes of Safari's screens in the app's own tokens, not screenshots: a
 * screenshot goes stale with every iOS release and is wrong in one of the two themes.
 *
 * Only the first screen differs by browser — every iOS browser hands over to the same system share
 * sheet. Safari: Share in the bar at the bottom (iPhone) or the top right (iPad). Chrome: Share at the
 * right end of its address bar, at the top. Edge and Firefox: Share is inside their menu (⋯ / ≡), at the
 * bottom right on an iPhone. It used to draw Safari's bar for all of them.
 */
type Props = { ipad?: boolean; browser?: string };

export function IosGuide({ ipad = false, browser = "safari" }: Props) {
  const app = browser === "chrome" ? "Chrome" : browser === "edge" ? "Edge" : browser === "firefox" ? "Firefox" : browser === "safari" ? "Safari" : "your browser";
  const at: At = browser === "chrome" ? "chrome" : browser === "safari" ? "safari" : "menu";
  const menu = browser === "firefox" ? <Menu size={18} /> : <MoreHorizontal size={18} />;
  const steps: { title: string; text: ReactNode; screen: ReactNode }[] = [
    at === "menu"
      ? { title: "Menu, then Share",
          text: <>Tap {browser === "firefox" ? <Menu size={14} className="inline align-[-2px]" /> : <MoreHorizontal size={14} className="inline align-[-2px]" />} <b>{ipad ? "top right" : "bottom right"}</b>, then <b>Share</b></>,
          screen: <ScreenBrowser ipad={ipad} at={at} menu={menu} /> }
      : { title: "Tap Share",
          text: at === "chrome"
            ? <>Right of the <b>address bar</b> <Share size={14} className="inline align-[-2px]" /></>
            : ipad
              ? <>At the <b>top right</b> <Share size={14} className="inline align-[-2px]" /></>
              : <>In the <b>bottom</b> bar <Share size={14} className="inline align-[-2px]" />. Not there? <b>More</b> <MoreHorizontal size={14} className="inline align-[-2px]" /> first.</>,
          screen: <ScreenBrowser ipad={ipad} at={at} menu={menu} /> },
    { title: "Choose “Add to Home Screen”",
      text: <><b>Scroll down</b>, near Copy</>,
      screen: <ScreenShareSheet /> },
    { title: "Tap “Add”",
      text: <>Keep <b>Open as Web App</b> on</>,
      screen: <ScreenAdd /> },
    { title: "Done — open from Home",
      text: <>Use the icon, not {app}</>,
      screen: <ScreenHome /> },
  ];
  const [i, setI] = useState(0);
  const [dir, setDir] = useState(1);
  const go = (n: number) => { if (n < 0 || n >= steps.length) return; setDir(n > i ? 1 : -1); setI(n); };
  const s = steps[i];

  return (
    <div className="space-y-3" data-ios-guide>
      {/* the screen, swipeable */}
      <div className="relative overflow-hidden rounded-[22px] bg-[var(--color-bg)] border border-[var(--color-separator)]" style={{ height: 248 }}>
        <AnimatePresence initial={false} custom={dir} mode="popLayout">
          <motion.div key={i} custom={dir} className="absolute inset-0"
            initial={{ x: dir * 60, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -dir * 60, opacity: 0 }} transition={{ type: "spring", stiffness: 380, damping: 34 }}
            drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={0.18}
            onDragEnd={(_, d) => { if (d.offset.x < -50) go(i + 1); else if (d.offset.x > 50) go(i - 1); }} data-step-screen={i + 1}>
            {s.screen}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* what to do, in words */}
      <div className="min-h-[86px]">
        <div className="flex items-center gap-2.5">
          <span className="h-7 w-7 rounded-full bg-[var(--color-tint)] text-[#06120a] grid place-items-center text-[13px] font-bold num shrink-0">{i === steps.length - 1 ? <Check size={15} /> : i + 1}</span>
          <h4 className="flex-1 min-w-0 text-[16px] font-semibold leading-tight" data-step-title>{s.title}</h4>
          <span className="text-[11px] font-semibold text-[var(--color-label-2)] num shrink-0">Step {i + 1} of {steps.length}</span>
        </div>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-[var(--color-label-2)] pl-[38px]">{s.text}</p>
      </div>

      {/* where you are, and the way on */}
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => go(i - 1)} disabled={i === 0} aria-label="Previous step"
          className="h-11 w-11 rounded-full grid place-items-center bg-[var(--color-fill)] disabled:opacity-30 shrink-0"><ChevronLeft size={18} /></button>
        <div className="flex-1 flex items-center justify-center gap-1.5">
          {steps.map((_, n) => <button key={n} type="button" onClick={() => go(n)} aria-label={`Step ${n + 1}`}
            className={cn("!min-h-0 h-2 rounded-full transition-all", n === i ? "w-6 bg-[var(--color-tint)]" : "w-2 bg-[var(--color-fill-2)]")} />)}
        </div>
        {i < steps.length - 1
          ? <button type="button" onClick={() => go(i + 1)} className="h-11 px-4 rounded-full bg-[var(--color-tint)] text-[#06120a] text-[14px] font-semibold inline-flex items-center gap-1 shrink-0" data-next>Next <ChevronRight size={17} /></button>
          : <button type="button" onClick={() => go(0)} className="h-11 px-4 rounded-full bg-[var(--color-fill)] text-[14px] font-semibold shrink-0">Start again</button>}
      </div>
    </div>
  );
}

/* ── the pieces of the drawings ───────────────────────────────────────────────────────────── */

/** the thing to tap: a ring that breathes, and a label pointing at it */
function Target({ children, label, side = "top", className }: { children: ReactNode; label: string; side?: "top" | "bottom" | "left" | "top-end" | "bottom-end"; className?: string }) {
  return (
    <span className={cn("relative inline-grid place-items-center", className)} data-target>
      <span className="absolute -inset-1.5 rounded-full border-2 border-[var(--color-tint)] animate-ping opacity-60" />
      <span className="absolute -inset-1.5 rounded-full border-2 border-[var(--color-tint)] bg-[color-mix(in_srgb,var(--color-tint)_18%,transparent)]" />
      <span className="relative text-[var(--color-tint)]">{children}</span>
      <span className={cn("absolute whitespace-nowrap rounded-lg bg-[var(--color-tint)] text-[#06120a] text-[11px] font-bold px-2 py-1 shadow-lg z-10",
        side === "top" && "bottom-[calc(100%+12px)] left-1/2 -translate-x-1/2",
        side === "bottom" && "top-[calc(100%+12px)] left-1/2 -translate-x-1/2",
        side === "left" && "right-[calc(100%+12px)] top-1/2 -translate-y-1/2",
        side === "top-end" && "bottom-[calc(100%+12px)] -right-1.5", side === "bottom-end" && "top-[calc(100%+12px)] -right-1.5")}>
        {label}
        <span className={cn("absolute h-2 w-2 rotate-45 bg-[var(--color-tint)]",
          side === "top" && "-bottom-1 left-1/2 -translate-x-1/2", side === "bottom" && "-top-1 left-1/2 -translate-x-1/2", side === "left" && "-right-1 top-1/2 -translate-y-1/2",
          side === "top-end" && "-bottom-1 right-3", side === "bottom-end" && "-top-1 right-3")} />
      </span>
    </span>
  );
}
/** a web page, faintly, so the screen reads as a browser */
function Page() {
  return (
    <div className="px-5 pt-12 space-y-2.5 opacity-40">
      <div className="h-3 w-24 rounded bg-[var(--color-fill-2)]" />
      <div className="h-6 w-40 rounded bg-[var(--color-fill-2)]" />
      <div className="grid grid-cols-3 gap-2 pt-1">{[0, 1, 2].map((n) => <div key={n} className="h-12 rounded-xl bg-[var(--color-fill)]" />)}</div>
      <div className="h-16 rounded-xl bg-[var(--color-fill)]" />
    </div>
  );
}
function Address() {
  return (
    <div className="flex-1 min-w-0 h-9 rounded-xl bg-[var(--color-fill-2)] flex items-center gap-1.5 px-2.5 text-[12px]">
      <span className="text-[11px] font-bold text-[var(--color-label-2)]">AA</span>
      <span className="flex-1 min-w-0 flex items-center justify-center gap-1 truncate"><Lock size={10} className="text-[var(--color-label-3)]" />dineflow.cloud</span>
      <RotateCw size={12} className="text-[var(--color-label-2)]" />
    </div>
  );
}

type At = "safari" | "chrome" | "menu";
function ScreenBrowser({ ipad, at, menu }: { ipad: boolean; at: At; menu: ReactNode }) {
  if (at === "menu") return (
    <div className="h-full flex flex-col">
      {/* Edge and Firefox: the address at the top; Share is inside the menu — bottom right on an iPhone, top right on an iPad */}
      <div className="h-12 shrink-0 flex items-center gap-3 px-3 bg-[var(--color-bg-3)] border-b border-[var(--color-separator)]">
        <Address />
        {ipad && <Target label="Tap here, then Share" side="bottom-end">{menu}</Target>}
      </div>
      <div className="flex-1 overflow-hidden"><Page /></div>
      {!ipad && (
        <div className="h-12 shrink-0 px-5 flex items-center justify-between bg-[var(--color-bg-3)] border-t border-[var(--color-separator)] text-[var(--color-label-3)]">
          <ChevronLeft size={17} /><ChevronRight size={17} /><SquarePlus size={17} /><span className="h-4 w-4 rounded-[4px] border-2 border-current" />
          <Target label="Tap here, then Share" side="top-end">{menu}</Target>
        </div>
      )}
    </div>
  );
  if (ipad || at === "chrome") return (
    <div className="h-full flex flex-col">
      {/* an iPad's toolbar, and Chrome's address bar on any device, are at the top: the address in the middle, Share at its right */}
      <div className="h-14 shrink-0 flex items-center gap-3 px-3 bg-[var(--color-bg-3)] border-b border-[var(--color-separator)]">
        <ChevronLeft size={17} className="text-[var(--color-label-3)] shrink-0" />
        <Address />
        <Target label="Tap Share" side="bottom-end"><Share size={18} /></Target>
        {ipad && <span className="text-[var(--color-label-3)] text-[18px] leading-none">+</span>}
      </div>
      <div className="flex-1 pt-6"><Page /></div>
    </div>
  );
  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-hidden"><Page /></div>
      {/* an iPhone's bar is at the bottom: the address, then Share; on iOS 26 Share is under More */}
      <div className="shrink-0 px-3 pt-2.5 pb-3 bg-[var(--color-bg-3)] border-t border-[var(--color-separator)]">
        <div className="flex items-center gap-3">
          <ChevronLeft size={17} className="text-[var(--color-label-3)] shrink-0" />
          <Address />
          <Target label="Tap Share" side="top"><Share size={18} /></Target>
          <span className="h-7 w-7 rounded-full grid place-items-center text-[var(--color-label-2)] shrink-0"><MoreHorizontal size={17} /></span>
        </div>
      </div>
    </div>
  );
}

function ScreenShareSheet() {
  const Row = ({ icon, label, on }: { icon: ReactNode; label: string; on?: boolean }) => (
    <div className={cn("h-9 flex items-center justify-between px-3.5 text-[13px]", on && "relative")}>
      <span className={cn(on && "font-semibold")}>{label}</span>
      {on ? <Target label="Tap this" side="left"><span className="text-[var(--color-tint)]">{icon}</span></Target> : <span className="text-[var(--color-label-2)]">{icon}</span>}
    </div>
  );
  return (
    <div className="h-full relative">
      <div className="absolute inset-0 opacity-30"><Page /></div>
      {/* the share sheet over the page */}
      <div className="absolute inset-x-2 bottom-0 top-9 rounded-t-[18px] bg-[var(--color-bg-2)] border border-[var(--color-separator)] shadow-2xl overflow-hidden">
        <div className="flex items-center gap-2.5 px-3.5 py-2 border-b border-[var(--color-separator)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/apple-touch-icon.png" alt="" className="h-8 w-8 rounded-lg" />
          <div className="leading-tight min-w-0"><div className="text-[12.5px] font-semibold">DineFlow</div><div className="text-[11px] text-[var(--color-label-2)]">dineflow.cloud</div></div>
        </div>
        <div className="flex gap-3 px-3.5 py-2 border-b border-[var(--color-separator)]">{[0, 1, 2, 3, 4].map((n) => <span key={n} className="h-6 w-6 rounded-full bg-[var(--color-fill-2)] shrink-0" />)}</div>
        <div className="m-2 rounded-xl bg-[var(--color-fill)] divide-y divide-[var(--color-separator)]">
          <Row icon={<Copy size={15} />} label="Copy" />
          <Row icon={<Bookmark size={15} />} label="Add Bookmark" />
          <Row icon={<SquarePlus size={16} />} label="Add to Home Screen" on />
        </div>
      </div>
    </div>
  );
}

function ScreenAdd() {
  return (
    <div className="h-full bg-[var(--color-bg-2)] flex flex-col">
      <div className="h-12 shrink-0 flex items-center justify-between px-3.5 border-b border-[var(--color-separator)] text-[13px]">
        <span className="text-[var(--color-label-2)]">Cancel</span>
        <span className="font-semibold">Add to Home Screen</span>
        <Target label="Tap Add" side="bottom"><span className="font-bold text-[13px] px-1">Add</span></Target>
      </div>
      <div className="m-3 rounded-xl bg-[var(--color-fill)] p-3 flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/apple-touch-icon.png" alt="" className="h-12 w-12 rounded-[12px]" />
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold border-b border-[var(--color-separator)] pb-1">DineFlow</div>
          <div className="text-[11.5px] text-[var(--color-label-2)] pt-1 truncate">https://dineflow.cloud/dashboard</div>
        </div>
      </div>
      <div className="mx-3 rounded-xl bg-[var(--color-fill)] h-11 px-3 flex items-center justify-between text-[13px]">
        <span className="font-semibold">Open as Web App</span>
        {/* the switch, on — leave it that way */}
        <span className="relative h-6 w-10 rounded-full bg-[var(--color-tint)]"><span className="absolute right-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow" /></span>
      </div>
      <p className="mx-4 mt-2 text-[11px] text-[var(--color-label-2)]">Keep on for full screen</p>
    </div>
  );
}

function ScreenHome() {
  return (
    <div className="h-full bg-[linear-gradient(160deg,color-mix(in_srgb,var(--color-tint)_14%,var(--color-bg))_0%,var(--color-bg)_70%)] px-6 pt-10">
      <div className="grid grid-cols-4 gap-x-4 gap-y-5">
        {Array.from({ length: 7 }).map((_, n) => (
          <div key={n} className="flex flex-col items-center gap-1"><span className="h-12 w-12 rounded-[13px] bg-[var(--color-fill-2)]" /><span className="h-1.5 w-8 rounded bg-[var(--color-fill)]" /></div>
        ))}
        <div className="flex flex-col items-center gap-1">
          <Target label="Your app" side="top" className="!rounded-[13px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/apple-touch-icon.png" alt="" className="h-12 w-12 rounded-[13px]" />
          </Target>
          <span className="text-[10px] font-semibold mt-0.5">DineFlow</span>
        </div>
      </div>
    </div>
  );
}
