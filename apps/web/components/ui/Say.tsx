"use client";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Languages, Check, LayoutGrid, Star, Soup, Drumstick, CookingPot, Wheat, Coffee, CupSoda, IceCreamCone, Salad, Fish, Pizza, Layers, UtensilsCrossed, type LucideIcon } from "lucide-react";
import { cn, tap } from "./index";
import { LANGS, LANG_COOKIE, say, scriptOf, type Lang, type Word } from "@/lib/say";
import { LANG_EVENT } from "@/lib/i18n/scope";

/* The device's language for the Dining screens (lib/say.ts). The server reads the cookie, so the
   first paint already carries the second line; a change here re-renders without a reload. */
const Ctx = createContext<{ lang: Lang; set: (l: Lang) => void }>({ lang: "en", set: () => {} });
export function SayProvider({ initial, children }: { initial: Lang; children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(initial);
  const set = (l: Lang) => { setLang(l); tap(); document.cookie = `${LANG_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`; dispatchEvent(new Event(LANG_EVENT)); };
  return <Ctx.Provider value={{ lang, set }}>{children}</Ctx.Provider>;
}
export const useLang = () => useContext(Ctx);

/** A word in English with the device's second language under it. `start` aligns both lines left. */
export function Say({ w, className, start }: { w: Word; className?: string; start?: boolean }) {
  const { lang } = useLang(); const { en, alt } = say(w, lang);
  if (!alt) return <span className={className}>{en}</span>;
  return <span className={cn("say", start && "start", className)}><span>{en}</span><span className="say-alt" lang={scriptOf(lang)}>{alt}</span></span>;
}
/** The words as plain strings, for an aria-label or a title. */
export function useSay() { const { lang } = useLang(); return (w: Word) => say(w, lang); }

/** The two kinds of choice: English with an optional second line, or the whole app in one language. */
const GROUPS = [{ g: "line", title: "Words on the buttons" }, { g: "all", title: "The whole app · முழு ஆப் · पूरा ऐप" }] as const;

/** The top bar's language button: five choices in a small menu, for every member of staff. Marked
 *  translate="no": each choice is always shown in its own script, so whoever picked the wrong one can
 *  read their way back. */
export function LangButton() {
  const { lang, set } = useLang(); const [open, setOpen] = useState(false); const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", off); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", off); document.removeEventListener("keydown", esc); };
  }, [open]);
  const cur = LANGS.find((l) => l.v === lang) ?? LANGS[0];
  return (
    <div ref={box} className="relative" data-lang-menu>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} aria-label={`Language: ${cur.label}`} title={`Language: ${cur.label}`}
        className="h-11 w-11 grid place-items-center rounded-full hover:bg-[var(--color-fill)] text-[var(--color-label-2)]">
        {lang === "en" ? <Languages size={20} /> : <span className="text-[19px] font-bold leading-none" lang={scriptOf(lang)}>{cur.short}</span>}
      </button>
      {open && (
        <div role="menu" translate="no" className="absolute right-0 top-full mt-2 z-50 w-72 max-w-[calc(100vw-24px)] rounded-2xl bg-[var(--color-bg-2)] border border-[var(--color-separator)] shadow-[var(--shadow-pop)] p-1.5">
          {GROUPS.map(({ g, title }) => (
            <div key={g} role="group" aria-label={title} className={cn(g === "all" && "mt-1 pt-1 border-t border-[var(--color-separator)]")}>
              <div className="px-3 pt-2 pb-1.5 text-[11px] font-semibold uppercase tracking-[.12em] text-[var(--color-label-2)]">{title}</div>
              {LANGS.filter((l) => l.group === g).map((l) => (
                <button key={l.v} type="button" role="menuitemradio" aria-checked={lang === l.v} data-lang-option={l.v} onClick={() => { set(l.v); setOpen(false); }}
                  className={cn("w-full !min-h-12 rounded-xl px-3 flex items-center gap-3 text-left text-[15px] font-semibold hover:bg-[var(--color-fill)]", lang === l.v && "bg-[var(--color-fill)]")}>
                  <span className={cn("h-8 w-8 rounded-lg grid place-items-center text-[16px] shrink-0", g === "all" ? "bg-[var(--color-tint)] text-[var(--color-on-tint)]" : "bg-[var(--color-fill)]")} lang={scriptOf(l.v)}>{l.short}</span>
                  <span className="flex-1 min-w-0" lang={scriptOf(l.v)}>{l.label}</span>{lang === l.v && <Check size={16} className="text-[var(--color-tint)] shrink-0" />}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Settings: the same five choices as cards, in their two groups (translate="no", as the menu). */
export function LangPicker() {
  const { lang, set } = useLang();
  return (
    <div className="space-y-4" data-lang-picker translate="no">
      {GROUPS.map(({ g, title }) => (
        <div key={g}>
          <div className="eyebrow mb-2">{title}</div>
          <div className={cn("grid gap-3", g === "line" ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
            {LANGS.filter((l) => l.group === g).map((l) => (
              <button key={l.v} type="button" onClick={() => set(l.v)} aria-pressed={lang === l.v} data-lang-option={l.v} className={cn("feather text-left p-4 flex gap-3 items-start transition min-w-0", lang === l.v ? "ring-2 ring-[var(--color-tint)]" : "hover:bg-[var(--color-fill)]")}>
                <span className={cn("h-10 w-10 rounded-xl grid place-items-center shrink-0 text-[18px] font-bold", lang === l.v ? "bg-[var(--color-tint)] text-[var(--color-on-tint)]" : "bg-[var(--color-fill)]")} lang={scriptOf(l.v)}>{l.short}</span>
                <span className="min-w-0"><span className="block font-semibold text-[15px]" lang={scriptOf(l.v)}>{l.label}</span><span className="block text-[13px] text-[var(--color-label-2)] mt-0.5">{l.hint}</span></span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** A category's picture by the name `catIcon` gave it — names cross the server boundary, icons do not. */
const ICONS: Record<string, LucideIcon> = { LayoutGrid, Star, Soup, Drumstick, CookingPot, Wheat, Coffee, CupSoda, IceCreamCone, Salad, Fish, Pizza, Layers, UtensilsCrossed };
export function CatIcon({ name, size = 24, className }: { name: string; size?: number; className?: string }) {
  const I = ICONS[name] ?? UtensilsCrossed; return <I size={size} className={className} aria-hidden />;
}
