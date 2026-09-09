"use client";
import { clsx } from "clsx";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { usePathname } from "next/navigation";
import { X, Check, ChevronDown, Search } from "lucide-react";
import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";

export const cn = clsx;
export { snap, glide, settle, flipT, fast, listV, itemV, pageV, sheetV, flipV, press, pressCard } from "@/lib/motion";
import { snap, glide, settle, sheetV } from "@/lib/motion";
export { Flip, FlipClock, Loader, PageLoader, Countdown, Waiting, reducedMotion } from "./flip";
import { Loader } from "./flip";
/** A hairline at the very top that fills while the next page is on its way, then vanishes. */
export function NavProgress() {
  const path = usePathname(); const [on, setOn] = useState(false);
  useEffect(() => { setOn(false); }, [path]);
  useEffect(() => {
    const click = (e: MouseEvent) => { const a = (e.target as HTMLElement).closest("a[href]") as HTMLAnchorElement | null; if (!a || a.target === "_blank" || e.metaKey || e.ctrlKey) return; const u = new URL(a.href, location.href); if (u.origin === location.origin && u.pathname !== location.pathname) setOn(true); };
    document.addEventListener("click", click, true); return () => document.removeEventListener("click", click, true);
  }, []);
  return <div className={cn("nav-progress", on && "on")} aria-hidden />;
}

/** kept as the old names so existing screens keep working; both now point at the shared springs */
export const spring = snap;
export const springSoft = glide;

/* ── haptic-ish press feedback (Vibration API on Android; no-op elsewhere) ─────────── */
export const tap = (ms = 8) => { try { if (typeof navigator !== "undefined" && "vibrate" in navigator && matchMedia("(pointer: coarse)").matches) navigator.vibrate(ms); } catch { /* ignore */ } };

/* ── Button: HIG styles. Old variant names map onto the new ones so nothing breaks. ─── */
type Variant = "primary" | "filled" | "ink" | "tinted" | "gray" | "ghost" | "plain" | "outline" | "danger";
export function Button({ variant = "primary", size = "md", className, loading, children, onClick, ...p }:
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg"; loading?: boolean }) {
  const v = variant === "primary" ? "filled" : variant === "ghost" ? "plain" : variant === "outline" ? "gray" : variant;
  return (
    <motion.button whileTap={{ scale: .96 }} transition={spring}
      className={cn("btn", `btn-${v}`, size === "sm" && "!h-9 !px-3.5 !text-[13px] !rounded-[11px]", size === "lg" && "!h-[52px] !px-7 !text-[16px] !rounded-[16px]", className)}
      onClick={(e) => { tap(); onClick?.(e); }} disabled={loading || p.disabled} {...(p as Record<string, unknown>)}>
      {loading ? <><Loader size="xs" tone="plain" className="!-my-1" /><span className="opacity-70">{children}</span></> : children}
    </motion.button>
  );
}

/* ── Flip: one number in a split-flap tile. When the value changes the face turns over. ────
   <Flip value={covers} label="covers" /> · size "md" | "sm" | "xs" · tone "live" | "alert"   */
/* ── Flip: a split-flap tile. Each character is its own flap; when a character changes, the top half
   of the old one folds down and the bottom half of the new one falls in — digit by digit, so 19 → 20
   turns two flaps and 11 → 12 turns one. ─────────────────────────────────────────────────────── */
/** The chevron-down handle at the top of a pushed page — one tap goes back. */
export function DeckHandle({ href, onClick }: { href?: string; onClick?: () => void }) {
  const inner = <span className="deck-handle" aria-label="Back"><ChevronDown size={22} /></span>;
  return href ? <a href={href} onClick={() => tap()}>{inner}</a> : <button onClick={() => { tap(); onClick?.(); }}>{inner}</button>;
}

export function Card({ className, children, lift, glow }: { className?: string; children: ReactNode; lift?: boolean; glow?: boolean }) {
  const onMove = (e: React.MouseEvent<HTMLDivElement>) => { if (!glow) return; const r = e.currentTarget.getBoundingClientRect(); e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`); e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`); };
  return <div onMouseMove={onMove} className={cn("card p-5", lift && "feather-lift", glow && "spotlight", className)}>{children}</div>;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <div className="space-y-1.5"><label>{label}</label>{children}{hint && <p className="footnote">{hint}</p>}</div>;
}

export function Pill({ tone, children }: { tone: "pending" | "preparing" | "ready" | "served" | "alert" | "gold" | "sky"; children: ReactNode }) {
  return <span className={cn("pill", `pill-${tone}`)}>{children}</span>;
}

export function Empty({ title, hint, action }: { title: string; hint: string; action?: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={springSoft} className="card p-10 text-center">
      <div className="mx-auto h-12 w-12 rounded-2xl bg-[var(--color-fill)] grid place-items-center text-[var(--color-label-3)]">◌</div>
      <h3 className="text-xl mt-4">{title}</h3><p className="text-sm text-[var(--color-label-2)] mt-1 max-w-sm mx-auto">{hint}</p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </motion.div>
  );
}

export function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return <motion.div initial={{ opacity: 0, y: 12, filter: "blur(6px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={{ ...springSoft, delay }} className={className}>{children}</motion.div>;
}

/* ── Sheet: bottom sheet with grabber on phones, centred card on desktop ─────────────── */
export function Sheet({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => { if (!open) return; const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); document.body.style.overflow = "hidden"; return () => { window.removeEventListener("keydown", k); document.body.style.overflow = ""; }; }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 scrim" onClick={onClose} />
          <motion.div role="dialog" aria-modal variants={sheetV} initial="hidden" animate="show" exit="exit" drag="y" dragDirectionLock dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: .55 }} onDragEnd={(_, i) => { if (i.offset.y > 110 || i.velocity.y > 700) onClose(); }}
            className={cn("relative material-thick w-full max-h-[92dvh] flex flex-col rounded-t-[28px] sm:rounded-[28px] shadow-[var(--shadow-pop)]", wide ? "sm:max-w-3xl" : "sm:max-w-lg")}>
            <div className="sm:hidden grabber" />
            <div className="flex items-center justify-between px-5 pt-3 pb-3 sm:pt-5">
              <h2 className="text-[22px] font-display">{title}</h2>
              <button onClick={onClose} aria-label="Close" className="h-8 w-8 rounded-full bg-[var(--color-fill)] grid place-items-center text-[var(--color-label-2)] hover:bg-[var(--color-fill-2)] active:scale-95 transition"><X size={16} strokeWidth={2.5} /></button>
            </div>
            <div className="px-5 pb-[max(20px,env(safe-area-inset-bottom))] overflow-y-auto">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function StatTile({ label, value, sub, tone, delay = 0 }: { label: string; value: string; sub?: string; tone?: "alert" | "good"; delay?: number }) {
  return (
    <Reveal delay={delay}>
      <div onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`); e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`); }}
        className={cn("card spotlight feather-lift p-5 h-full relative", tone === "alert" && "!border-[var(--color-red)]/40", tone === "good" && "!border-[var(--color-green)]/50")}>
        <div className="flex items-center gap-1.5"><span className={cn("h-1.5 w-1.5 rounded-full", tone === "alert" ? "bg-[var(--color-red)] pulse-dot text-[var(--color-red)]" : tone === "good" ? "bg-[var(--color-green)]" : "bg-[var(--color-fill-2)]")} /><div className="eyebrow">{label}</div></div>
        <div className="mt-2.5 text-[34px] leading-none font-display num count-up" style={{ fontVariationSettings: '"opsz" 72' }}>{value}</div>
        {sub && <div className={cn("mt-1.5 text-xs", tone === "alert" ? "text-[var(--color-red)]" : "text-[var(--color-label-2)]")}>{sub}</div>}
      </div>
    </Reveal>
  );
}

/* ── Segmented control (iOS) ──────────────────────────────────────────────────────────── */
export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string }) {
  const id = useId();
  return (
    <LayoutGroup id={id}>
      <div className={cn("segmented", className)} role="tablist">
        {options.map((o) => (
          <button key={o.value} role="tab" data-on={o.value === value} onClick={() => { tap(); onChange(o.value); }}>
            {o.value === value && <motion.span layoutId={`thumb-${id}`} className="thumb -z-[1] absolute inset-0" style={{ position: "absolute", left: 0, right: 0 }} transition={spring} />}
            <span className="relative">{o.label}</span>
          </button>
        ))}
      </div>
    </LayoutGroup>
  );
}

/* ── Switch (iOS toggle) ──────────────────────────────────────────────────────────────── */
export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label className="inline-flex items-center gap-3 cursor-pointer select-none">
      <button type="button" role="switch" aria-checked={on} data-on={on} className="switch" onClick={() => { tap(12); onChange(!on); }} />
      {label && <span className="text-[15px]">{label}</span>}
    </label>
  );
}

/* ── Select: a real popover listbox with search, keyboard and spring. ──────────────────
   Drop-in for native <select>: <Select value onChange options /> */
export type Opt = { value: string; label: string; hint?: string; icon?: ReactNode };
export function Select({ value, onChange, options, placeholder = "Choose", searchable, className, disabled }: { value: string; onChange: (v: string) => void; options: Opt[]; placeholder?: string; searchable?: boolean; className?: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false); const [q, setQ] = useState(""); const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const shown = q ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : options;
  const cur = options.find((o) => o.value === value);
  useEffect(() => { const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, []);
  const pick = (v: string) => { tap(); onChange(v); setOpen(false); setQ(""); };
  const key = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(shown.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter" && shown[active]) { e.preventDefault(); pick(shown[active].value); }
    else if (e.key === "Escape") setOpen(false);
  };
  return (
    <div ref={ref} className={cn("relative", className)} onKeyDown={key}>
      <button type="button" disabled={disabled} onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open}
        className="w-full flex items-center gap-2 text-left rounded-xl bg-[var(--color-bg-3)] hover:bg-[var(--color-fill-2)] px-3.5 py-[11px] text-[15px] transition disabled:opacity-40 data-[open=true]:bg-[var(--color-bg-2)] data-[open=true]:ring-4 data-[open=true]:ring-[rgb(227_154_46/.18)]" data-open={open}>
        {cur?.icon}<span className={cn("flex-1 truncate", !cur && "text-[var(--color-label-3)]")}>{cur?.label ?? placeholder}</span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={spring} className="text-[var(--color-label-3)]"><ChevronDown size={16} strokeWidth={2.5} /></motion.span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -6, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: .98 }} transition={spring}
            className="absolute z-40 mt-1.5 w-full min-w-[220px] popover !animate-none max-h-72 overflow-y-auto" role="listbox">
            {searchable && <div className="flex items-center gap-2 px-2 pb-1.5 mb-1 border-b border-[var(--color-separator)]"><Search size={14} className="text-[var(--color-label-3)]" /><input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setActive(0); }} placeholder="Search" className="!bg-transparent !p-1.5 !border-0 !shadow-none !rounded-none text-sm" /></div>}
            {shown.length === 0 && <div className="menu-item text-[var(--color-label-3)]">No matches</div>}
            {shown.map((o, i) => (
              <button key={o.value} type="button" role="option" aria-selected={o.value === value} data-active={i === active} onMouseEnter={() => setActive(i)} onClick={() => pick(o.value)} className="menu-item">
                {o.icon}<span className="flex-1 truncate">{o.label}{o.hint && <span className="block text-xs text-[var(--color-label-3)] font-normal">{o.hint}</span>}</span>
                {o.value === value && <Check size={15} strokeWidth={2.5} />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Inset grouped list (iOS Settings) ────────────────────────────────────────────────── */
export function Group({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  return <div className={className}>{title && <div className="group-title">{title}</div>}<div className="group">{children}</div></div>;
}
export function Row({ icon, label, detail, right, onClick, href, chevron }: { icon?: ReactNode; label: ReactNode; detail?: ReactNode; right?: ReactNode; onClick?: () => void; href?: string; chevron?: boolean }) {
  const inner = <>
    {icon && <span className="h-8 w-8 rounded-[9px] bg-[var(--color-fill)] grid place-items-center text-[var(--color-label)] shrink-0">{icon}</span>}
    <span className="flex-1 min-w-0"><span className="block text-[15px] truncate">{label}</span>{detail && <span className="block text-[13px] text-[var(--color-label-2)] truncate">{detail}</span>}</span>
    {right && <span className="text-[15px] text-[var(--color-label-2)]">{right}</span>}
    {(chevron || href) && <ChevronDown size={16} className="chevron -rotate-90" />}
  </>;
  if (href) return <a href={href} className="row">{inner}</a>;
  return <div className={cn("row", onClick && "cursor-pointer")} onClick={onClick ? () => { tap(); onClick(); } : undefined}>{inner}</div>;
}

/* ── Toasts ───────────────────────────────────────────────────────────────────────────── */
type Toast = { id: number; text: string; tone?: "ok" | "err" | "info" };
const ToastCtx = createContext<(t: string, tone?: Toast["tone"]) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  const push = (text: string, tone: Toast["tone"] = "ok") => { const id = Date.now() + Math.random(); setList((l) => [...l, { id, text, tone }]); setTimeout(() => setList((l) => l.filter((t) => t.id !== id)), 3200); };
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed top-3 inset-x-0 z-[60] flex flex-col items-center gap-2 pointer-events-none px-4">
        <AnimatePresence>{list.map((t) => (
          <motion.div key={t.id} layout initial={{ opacity: 0, y: -14, scale: .96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10, scale: .96 }} transition={spring}
            className={cn("material-thick pointer-events-auto rounded-full px-4 py-2.5 text-sm font-semibold flex items-center gap-2 shadow-[var(--shadow-pop)]", t.tone === "err" && "!text-[var(--color-red)]")}>
            {t.tone === "ok" && <Check size={15} className="text-[var(--color-green)]" strokeWidth={3} />}{t.text}
          </motion.div>))}</AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}

export function Skeleton({ className }: { className?: string }) { return <div className={cn("shimmer h-4", className)} />; }
