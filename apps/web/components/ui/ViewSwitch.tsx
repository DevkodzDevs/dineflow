"use client";
import { useEffect, useState } from "react";
import { Pin, type LucideIcon } from "lucide-react";
import { cn } from "./index";

/**
 * How a list is shown, and the owner's say in it (2026-10-23 — Customers, Pantry, Attendance, OTA channels; since 2026-10-25
 * also Orders, Staff, Master control, Menu, Guests, Invoices and Labour's wages — the one switch for this in the app). `useViewPref(key, valid)` holds two things per device: what is chosen now (this visit) and the saved default
 * (`localStorage df-view:<key>`, read after mount so the server render and the first paint agree). `chosen` is the one to
 * honour — now, else the default, else null, and null means the screen's own default, which a screen showing cards on a
 * phone and a grid from md decides with CSS, so the first paint is right at every width. `wide` (md and up) only lights the
 * right segment while nothing is chosen.
 */
export function useViewPref<V extends string>(key: string, valid: readonly V[], opts?: { legacy?: string; wideAt?: number }) {
  const [saved, setSaved] = useState<V | null>(null);
  const [now, setNow] = useState<V | null>(null);
  const [wide, setWide] = useState<boolean | null>(null);
  useEffect(() => {
    /* `legacy`: the key a screen kept its choice under before it used this switch (2026-10-25 — Orders df-orders-view,
       Staff df-staff-layout, Master control df-estate-view). A choice made there reads as this device's default (pinned). */
    try {
      const v = (localStorage.getItem(`df-view:${key}`) ?? (opts?.legacy ? localStorage.getItem(opts.legacy) : null)) as V | null;
      if (v && valid.includes(v)) setSaved(v);
    } catch { /* none kept */ }
    // `wideAt`: the width the screen's own CSS switches at (768 unless it says, Menu 640)
    const mq = matchMedia(`(min-width: ${opts?.wideAt ?? 768}px)`); const on = () => setWide(mq.matches); on();
    mq.addEventListener("change", on); return () => mq.removeEventListener("change", on);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const keep = (v: V) => { setSaved(v); setNow(v); try { localStorage.setItem(`df-view:${key}`, v); } catch { /* fine */ } };
  return { saved, now, wide, pick: setNow, keep, chosen: now ?? saved };
}

export type ViewOpt<V extends string> = { v: V; label: string; icon: LucideIcon; word?: string };
/**
 * The switch: round segments in a soft track (icon, and the word from sm when it has one), the shown one raised on the card
 * colour. With `onKeep`, a pin at its end makes the shown choice this device's default — filled when it already is.
 * 40px with a mouse, 44px on a touch screen.
 */
export function ViewSwitch<V extends string>({ label, options, shown, onPick, saved, onKeep, data }: {
  label: string; options: ViewOpt<V>[]; shown: V | null; onPick: (v: V) => void; saved?: V | null; onKeep?: (v: V) => void; data?: string;
}) {
  const pinned = !!shown && saved === shown;
  const seg = "!min-h-10 h-10 pointer-coarse:!min-h-11 pointer-coarse:h-11 min-w-10 pointer-coarse:min-w-11 rounded-full inline-flex items-center justify-center gap-1.5 text-[13px] font-extrabold transition-[background-color,color,box-shadow] duration-150";
  return (
    <div className="shrink-0 inline-flex items-center gap-0.5 rounded-full bg-[var(--color-fill)] p-1" role="group" aria-label={label} data-view-switch={data}>
      {options.map(({ v, label: l, icon: I, word }) => (
        <button key={v} type="button" onClick={() => onPick(v)} aria-pressed={shown === v} title={l} aria-label={l} data-view-pick={v}
          className={cn(seg, word ? "px-3" : "px-2.5", shown === v ? "bg-[var(--color-bg-2)] text-[var(--color-label)] shadow-[0_1px_4px_rgb(0_0_0/0.22)]" : "text-steel hover:text-[var(--color-label)]")}>
          <I size={16} aria-hidden />{word && <span className="hidden sm:inline">{word}</span>}
        </button>))}
      {onKeep && <>
        <span className="w-px h-5 mx-0.5 bg-[var(--color-separator)]" aria-hidden />
        <button type="button" onClick={() => shown && onKeep(shown)} disabled={!shown} aria-pressed={pinned} data-view-keep
          title={pinned ? "This is your default" : "Make this my default"} aria-label={pinned ? "This is your default" : "Make this my default"}
          className={cn(seg, "px-2.5", pinned ? "text-[var(--color-tint)]" : "text-steel hover:text-[var(--color-label)]")}>
          <Pin size={15} aria-hidden className={cn("transition-transform", pinned && "fill-current rotate-[-30deg]")} />
        </button></>}
    </div>
  );
}
