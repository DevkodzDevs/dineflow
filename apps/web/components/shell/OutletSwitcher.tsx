"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { Store, ChevronDown, Check, Loader2, LayoutGrid } from "lucide-react";
import Link from "next/link";
import { cn } from "../ui";
import type { Outlet } from "@/lib/auth";
import { switchOutlet } from "@/app/(app)/chain/actions";
import { reach } from "@/lib/reach";

/**
 * The outlet this sign-in is working in, and the others it may open (0106). Choosing one stands this device in it —
 * a phone and a laptop of the same owner can be in different outlets — and the app reloads on the control room, so
 * no screen keeps the last outlet's rows or live channels. Shown only when there is more than one outlet.
 */
export function OutletSwitcher({ outlets, className }: { outlets: Outlet[]; className?: string }) {
  const [open, setOpen] = useState(false); const [pending, start] = useTransition(); const [err, setErr] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    addEventListener("mousedown", off); addEventListener("keydown", esc);
    return () => { removeEventListener("mousedown", off); removeEventListener("keydown", esc); };
  }, [open]);
  if (outlets.length < 2) return null;
  const cur = outlets.find((o) => o.current) ?? outlets[0];
  const go = (o: Outlet) => start(async () => {
    setErr(null); if (o.current) { setOpen(false); return; }
    const r = await reach(() => switchOutlet(o.home ? null : o.id));
    if ("error" in r) { setErr(r.error!); return; }
    location.assign("/dashboard");
  });
  return (
    <div ref={box} className={cn("relative min-w-0 max-w-[16rem]", className)} data-outlet-switcher>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="listbox" title="Switch outlet"
        className="!min-h-10 max-w-full rounded-xl pl-2.5 pr-2 inline-flex items-center gap-1.5 bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)] text-[13.5px] font-bold" data-outlet-current>
        {pending ? <Loader2 size={16} className="animate-spin shrink-0" /> : <Store size={16} className="shrink-0" aria-hidden />}
        <span className="truncate min-w-0">{cur.name}</span><ChevronDown size={15} className={cn("shrink-0 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div role="listbox" aria-label="Outlets" className="absolute z-40 mt-2 right-0 sm:left-0 sm:right-auto w-[min(20rem,calc(100vw-2rem))] rounded-2xl material-thick shadow-[var(--shadow-pop)] p-1.5" data-outlet-list>
          <div className="px-3 pt-2 pb-1.5 text-[11.5px] font-bold uppercase tracking-wide text-steel">Your outlets</div>
          {outlets.map((o) => (
            <button key={o.id} type="button" role="option" aria-selected={o.current} disabled={pending} onClick={() => go(o)} data-outlet-option={o.name}
              className={cn("w-full !min-h-12 rounded-xl px-3 py-2 flex items-center gap-2.5 text-left hover:bg-[var(--color-fill)]", o.current && "bg-[var(--color-fill)]")}>
              <span className="h-8 w-8 shrink-0 rounded-lg grid place-items-center bg-[var(--color-fill-2)]"><Store size={15} aria-hidden /></span>
              <span className="min-w-0 flex-1"><span className="block text-[14px] font-bold truncate">{o.name}</span>
                <span className="block text-[12px] text-steel truncate">{[o.home ? "Your own" : null, o.city, o.membership !== "active" ? o.membership : null].filter(Boolean).join(" · ") || "Outlet"}</span></span>
              {o.current && <Check size={17} className="shrink-0 text-mint" aria-label="Current" />}
            </button>))}
          {err && <p className="px-3 py-2 text-[13px] font-semibold text-chili">{err}</p>}
          <Link href="/chain" onClick={() => setOpen(false)} className="mt-1 !min-h-11 rounded-xl px-3 flex items-center gap-2 text-[13.5px] font-bold text-steel hover:text-[var(--color-label)] hover:bg-[var(--color-fill)] border-t border-[var(--color-separator)]"><LayoutGrid size={16} aria-hidden /> All outlets, live</Link>
        </div>)}
    </div>
  );
}
