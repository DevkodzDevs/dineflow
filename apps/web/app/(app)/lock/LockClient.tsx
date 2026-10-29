"use client";
import { useState, useTransition } from "react";
import { Lock, Eye, MousePointerClick, ShieldCheck, ArrowUpDown, MonitorSmartphone, Check, Ban, LayoutGrid } from "lucide-react";
import { Sheet, Switch, Button, cn, useToast } from "@/components/ui";
import { PageHeader } from "@/components/shell/PageHeader";
import { sectionByKey } from "@/components/shell/sections";
import type { LockMode } from "@/lib/displayLock";
import { setPageLock, lockThisDisplay } from "./actions";

export type LockGroup = { title: string | null; items: { key: string; label: string; href: string }[] };
type Ask = { kind: "enable" | "change" | "disable" | "lock"; key: string; label: string; href: string; mode: LockMode };

const MODES: Record<LockMode, { title: string; short: string; Icon: typeof Eye; hue: string; hue2: string; points: string[] }> = {
  view: { title: "Static display", short: "View only", Icon: Eye, hue: "var(--color-blue)", hue2: "var(--color-blue-2)",
    points: ["View only, no taps", "Scrolls", "For TVs and boards"] },
  work: { title: "Work on one page", short: "Work here", Icon: MousePointerClick, hue: "var(--color-green)", hue2: "var(--color-green-2)",
    points: ["Only this page works", "Menu and Back hidden", "Scrolls"] },
};

/**
 * Display lock (0141): turn a page's lock on (choosing how it locks) or off, change its kind, and lock this device to it.
 * Every change asks first. The owner's and a manager's; the database checks the role again.
 */
export function LockClient({ groups, setting: initial, me }: { groups: LockGroup[]; setting: Record<string, LockMode>; me: string }) {
  const toast = useToast();
  const [setting, setSetting] = useState(initial);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const on = Object.keys(setting).length;
  const close = () => { setAsk(null); setErr(null); };

  const confirm = () => ask && start(async () => {
    setErr(null);
    if (ask.kind === "lock") {
      const r = await lockThisDisplay(ask.key);
      if ("error" in r && r.error) { setErr(r.error); return; }
      window.location.assign(ask.href); // the layout draws it locked
      return;
    }
    const r = await setPageLock(ask.key, ask.kind === "disable" ? null : ask.mode);
    if ("error" in r && r.error) { setErr(r.error); return; }
    if ("setting" in r && r.setting) setSetting(r.setting);
    toast(ask.kind === "disable" ? `Lock off: ${ask.label}` : `${ask.label}: ${MODES[ask.mode].short}`);
    close();
  });

  return (
    <div className="space-y-6" data-lock-page>
      <PageHeader eyebrow="Devices" title="Display" accent="lock" sub="Pin a screen" />

      {/* the two kinds, side by side */}
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" data-lock-modes>
        {(["view", "work"] as const).map((m) => { const M = MODES[m]; return (
          <div key={m} className="rounded-[22px] border border-[var(--color-separator)] bg-[var(--color-bg-2)] p-4 sm:p-5 min-w-0" style={{ ["--hue" as string]: M.hue, ["--hue-2" as string]: M.hue2 }}>
            <div className="flex items-center gap-3">
              <span className="h-11 w-11 shrink-0 rounded-[14px] grid place-items-center bg-[var(--hue-2)] text-[var(--hue)]"><M.Icon size={20} aria-hidden /></span>
              <div className="min-w-0"><div className="text-[16px] font-extrabold leading-tight">{M.title}</div><div className="text-[12.5px] font-semibold text-[color-mix(in_srgb,var(--hue)_70%,var(--color-label))]">{M.short}</div></div>
            </div>
            <ul className="mt-3 space-y-1.5">{M.points.map((p) => <li key={p} className="flex items-start gap-2 text-[13px] text-[var(--color-label-2)] leading-snug"><Check size={14} className="mt-0.5 shrink-0 text-[var(--hue)]" aria-hidden />{p}</li>)}</ul>
          </div>); })}
      </div>

      <div className="flex flex-wrap items-center gap-2.5 rounded-[18px] border border-[var(--color-separator)] bg-[var(--color-bg-2)] px-4 py-3" data-lock-who>
        <ShieldCheck size={18} className="text-[var(--color-green)] shrink-0" aria-hidden />
        <span className="text-[13.5px] text-[var(--color-label-2)] flex-1 min-w-[16rem]"><b className="text-[var(--color-label)]">Owner</b> and <b className="text-[var(--color-label)]">managers</b> only</span>
        <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[12.5px] font-bold bg-[var(--color-fill)]" data-lock-count={on}><Lock size={13} aria-hidden />{on} {on === 1 ? "page" : "pages"} on</span>
      </div>

      {groups.map((g, gi) => (
        <section key={g.title ?? gi} className="rounded-[22px] border border-[var(--color-separator)] bg-[var(--color-bg-2)] overflow-hidden" data-lock-group>
          <div className="px-4 sm:px-5 pt-4 pb-2 text-[12px] font-bold uppercase tracking-[.1em] text-[var(--color-label-2)]">{g.title ?? "The day"}</div>
          <ul className="divide-y divide-[var(--color-separator)]">
            {g.items.map((i) => {
              const mode = setting[i.key]; const Icon = sectionByKey(i.key)?.Icon ?? LayoutGrid; const M = mode ? MODES[mode] : null;
              return (
                <li key={i.key} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 sm:px-5 py-3 min-h-[68px]" data-lock-row={i.key} data-lock-mode={mode ?? "off"}>
                  <span className={cn("h-10 w-10 shrink-0 rounded-[12px] grid place-items-center", M ? "" : "bg-[var(--color-fill)] text-[var(--color-label-2)]")}
                    style={M ? { background: M.hue2, color: M.hue } : undefined}><Icon size={18} aria-hidden /></span>
                  <div className="flex-1 min-w-[9rem]">
                    <div className="text-[15px] font-bold leading-tight">{i.label}</div>
                    <div className="text-[12px] text-[var(--color-label-3)] num">{i.href}</div>
                  </div>
                  {M && (
                    <div className="flex items-center gap-2 max-sm:order-last max-sm:w-full max-sm:pl-[52px]">
                      <button type="button" onClick={() => setAsk({ kind: "change", key: i.key, label: i.label, href: i.href, mode: mode! })} data-lock-change
                        className="h-11 px-3 rounded-full inline-flex items-center gap-1.5 text-[12.5px] font-bold border border-[var(--color-separator)] hover:border-[var(--color-line-2)]"
                        style={{ color: `color-mix(in srgb, ${M.hue} 72%, var(--color-label))` }}><M.Icon size={14} aria-hidden />{M.short}<ArrowUpDown size={12} className="opacity-60" aria-hidden /></button>
                      <button type="button" onClick={() => setAsk({ kind: "lock", key: i.key, label: i.label, href: i.href, mode: mode! })} data-lock-now
                        className="h-11 px-4 rounded-full inline-flex items-center gap-1.5 text-[13px] font-bold bg-[var(--color-label)] text-[var(--color-on-label)] active:scale-[.97] transition"><Lock size={14} aria-hidden /> Lock this display</button>
                    </div>
                  )}
                  <label className="shrink-0 inline-flex items-center min-h-11 min-w-11 justify-center cursor-pointer" data-lock-switch>
                    <Switch on={!!mode} name={`Display lock for ${i.label}`}
                      onChange={(v) => setAsk({ kind: v ? "enable" : "disable", key: i.key, label: i.label, href: i.href, mode: mode ?? "work" })} />
                  </label>
                </li>);
            })}
          </ul>
        </section>
      ))}

      <Sheet open={!!ask} onClose={close} title={!ask ? "" : ask.kind === "enable" ? `Turn on lock: ${ask.label}?` : ask.kind === "change" ? `How ${ask.label} locks` : ask.kind === "disable" ? `Turn off lock: ${ask.label}?` : `Lock screen to ${ask.label}?`}>
        {ask && <div className="space-y-4" data-lock-ask={ask.kind}>
          {(ask.kind === "enable" || ask.kind === "change") && (
            <div className="grid gap-2.5" role="radiogroup" aria-label="How it locks">
              {(["work", "view"] as const).map((m) => { const M = MODES[m]; const sel = ask.mode === m; return (
                <button key={m} type="button" role="radio" aria-checked={sel} onClick={() => setAsk({ ...ask, mode: m })} data-lock-pick={m}
                  className={cn("flex items-start gap-3 rounded-[18px] border p-3.5 text-left min-h-[72px] transition", sel ? "border-[var(--hue)] bg-[var(--hue-2)]" : "border-[var(--color-separator)] hover:border-[var(--color-line-2)]")}
                  style={{ ["--hue" as string]: M.hue, ["--hue-2" as string]: M.hue2 }}>
                  <span className="h-10 w-10 shrink-0 rounded-[12px] grid place-items-center bg-[var(--color-bg-2)] text-[var(--hue)]"><M.Icon size={18} aria-hidden /></span>
                  <span className="flex-1 min-w-0"><span className="block text-[15px] font-bold">{M.title}</span><span className="block text-[12.5px] text-[var(--color-label-2)] leading-snug mt-0.5">{M.points[0]}. {M.points[1]}.</span></span>
                  <span className={cn("mt-1 h-5 w-5 shrink-0 rounded-full border-2 grid place-items-center", sel ? "border-[var(--hue)] bg-[var(--hue)]" : "border-[var(--color-line-2)]")}>{sel && <Check size={12} strokeWidth={3} className="text-[var(--color-on-tint)]" aria-hidden />}</span>
                </button>); })}
            </div>
          )}
          {ask.kind === "enable" && <p className="text-[13.5px] text-[var(--color-label-2)] leading-relaxed">Then lock any screen to <b className="text-[var(--color-label)]">{ask.label}</b></p>}
          {ask.kind === "disable" && <p className="text-[13.5px] text-[var(--color-label-2)] leading-relaxed">Screens on <b className="text-[var(--color-label)]">{ask.label}</b> unlock</p>}
          {ask.kind === "lock" && (() => { const M = MODES[ask.mode]; return (
            <div className="space-y-3">
              <div className="flex items-start gap-3 rounded-[18px] p-3.5" style={{ background: M.hue2 }}>
                <span className="h-10 w-10 shrink-0 rounded-[12px] grid place-items-center bg-[var(--color-bg-2)]" style={{ color: M.hue }}><M.Icon size={18} aria-hidden /></span>
                <div className="min-w-0"><div className="text-[15px] font-bold">{M.title}</div><ul className="mt-1 space-y-1">{M.points.slice(0, 2).map((p) => <li key={p} className="text-[12.5px] text-[var(--color-label-2)] leading-snug">{p}</li>)}</ul></div>
              </div>
              <p className="text-[13.5px] text-[var(--color-label-2)] leading-relaxed"><MonitorSmartphone size={15} className="inline -mt-0.5 mr-1" aria-hidden />Stays on <b className="text-[var(--color-label)]">{ask.label}</b> · locked by {me}</p>
            </div>); })()}
          {err && <p className="text-[13.5px] font-semibold text-[var(--color-red)]" role="alert" data-lock-error>{err}</p>}
          <div className="flex gap-2" data-sheet-foot>
            <Button type="button" variant="gray" className="flex-1" onClick={close}>Cancel</Button>
            <Button type="button" className="flex-1" disabled={pending} onClick={confirm} data-lock-confirm>
              {ask.kind === "disable" ? <><Ban size={16} /> Turn off</> : ask.kind === "lock" ? <><Lock size={16} /> Lock now</> : ask.kind === "change" ? <><Check size={16} /> Save</> : <><Check size={16} /> Yes, enable</>}
            </Button>
          </div>
        </div>}
      </Sheet>
    </div>
  );
}
