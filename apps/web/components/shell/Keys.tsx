"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CornerDownLeft, Keyboard, Search } from "lucide-react";
import { Sheet, cn } from "../ui";
import { ITEMS, freshFor } from "./sections";
import { GO, screenFor } from "./keymap";
import type { Role } from "@dineflow/shared";

/**
 * The keyboard for the whole signed-in app (owner, 2026-10-15: "every Dining section by keyboard"). One
 * listener; what each screen offers is in keymap.ts. Nothing here fires while a person is typing in a
 * field, while a dialog is open (except Esc, which the dialog handles itself), or with Alt held.
 */
const typingIn = (t: EventTarget | null) => {
  const e = t as HTMLElement | null;
  return !!e && (/^(INPUT|TEXTAREA|SELECT)$/.test(e.tagName) || e.isContentEditable);
};
const visible = (e: Element) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };

export function Keys({ modules, role }: { modules: string[]; role: Role }) {
  const path = usePathname(); const router = useRouter();
  const [palette, setPalette] = useState(false);
  const [help, setHelp] = useState(false);
  const pendingG = useRef<number>(0);
  const allowed = (m?: string) => !m || modules.includes(m);
  const go = useMemo(() => GO.filter((g) => allowed(g.module)), [modules]); // eslint-disable-line react-hooks/exhaustive-deps
  const screen = screenFor(path);

  // a new screen starts with nothing highlighted
  useEffect(() => { document.querySelectorAll("[data-kbd-on]").forEach((e) => e.removeAttribute("data-kbd-on")); }, [path]);
  // the top bar's "Search…" opens Go to
  useEffect(() => { const o = () => setPalette(true); addEventListener("df-palette", o); return () => removeEventListener("df-palette", o); }, []);

  useEffect(() => {
    const items = () => (screen?.items ? [...document.querySelectorAll<HTMLElement>(screen.items)].filter(visible) : []);
    const current = (list: HTMLElement[]) => list.findIndex((e) => e.hasAttribute("data-kbd-on"));
    const light = (el: HTMLElement | undefined) => {
      document.querySelectorAll("[data-kbd-on]").forEach((e) => e.removeAttribute("data-kbd-on"));
      if (!el) return;
      el.setAttribute("data-kbd-on", "");
      el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" as ScrollBehavior });
    };
    /* the next item that way, by where things are on the screen — so a grid of dishes or tables moves the
       way it looks, and a single column simply goes up and down */
    const step = (dir: "up" | "down" | "left" | "right" | "next" | "prev") => {
      const list = items(); if (!list.length) return false;
      const i = current(list);
      if (i < 0) { light(dir === "up" || dir === "left" || dir === "prev" ? list[list.length - 1] : list[0]); return true; }
      if (dir === "next" || dir === "prev") { light(list[Math.min(list.length - 1, Math.max(0, i + (dir === "next" ? 1 : -1)))]); return true; }
      const a = list[i].getBoundingClientRect(); const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
      let best: HTMLElement | undefined, score = Infinity;
      for (const e of list) {
        if (e === list[i]) continue;
        const b = e.getBoundingClientRect(); const bx = b.left + b.width / 2, by = b.top + b.height / 2;
        const ok = dir === "down" ? b.top >= a.bottom - 4 : dir === "up" ? b.bottom <= a.top + 4 : dir === "right" ? bx > ax + 4 && Math.abs(by - ay) < a.height : bx < ax - 4 && Math.abs(by - ay) < a.height;
        if (!ok) continue;
        const s = dir === "down" || dir === "up" ? Math.abs(by - ay) * 4 + Math.abs(bx - ax) : Math.abs(bx - ax);
        if (s < score) { score = s; best = e; }
      }
      if (best) light(best);
      else if (dir === "left" || dir === "right") light(list[Math.min(list.length - 1, Math.max(0, i + (dir === "right" ? 1 : -1)))]);
      return true;
    };
    const press = (el: HTMLElement, inside?: string) => {
      const t = (inside && el.querySelector<HTMLElement>(inside))
        || (el.matches("a[href], button") ? el : el.onclick || el.getAttribute("role") === "button" || el.tagName === "TR" ? el : el.querySelector<HTMLElement>("a[href], button:not([disabled])"));
      t?.click();
    };

    const onKey = (e: KeyboardEvent) => {
      const k = e.key;
      // Ctrl/⌘ K: Go to — from anywhere, even a field
      if ((e.ctrlKey || e.metaKey) && !e.altKey && k.toLowerCase() === "k") { e.preventDefault(); setHelp(false); setPalette((v) => !v); return; }
      if (e.defaultPrevented || e.altKey) return;
      const dialog = !!document.querySelector("[role=dialog]");
      // Ctrl/⌘ Enter: the screen's main button, where it marks one (the till handles its own)
      if ((e.ctrlKey || e.metaKey) && k === "Enter") {
        const b = [...document.querySelectorAll<HTMLButtonElement>("[data-kbd-primary]")].find((x) => visible(x) && !x.disabled);
        if (b && !dialog) { e.preventDefault(); b.click(); }
        return;
      }
      if (e.ctrlKey || e.metaKey || typingIn(e.target) || dialog) return;

      // G, then a letter within a second and a half
      if (pendingG.current && Date.now() - pendingG.current < 1500) {
        pendingG.current = 0;
        const g = go.find((x) => x.key === k.toLowerCase());
        if (g) { e.preventDefault(); router.push(g.href); }
        return;
      }
      if (k === "g" || k === "G") { pendingG.current = Date.now(); return; }
      if (k === "?") { e.preventDefault(); setHelp(true); return; }
      if ((k === "n" || k === "N") && allowed("orders") && path !== "/orders/new") { e.preventDefault(); router.push("/orders/new"); return; }
      if (k === "/" && screen?.search) { const s = document.querySelector<HTMLInputElement>(screen.search); if (s) { e.preventDefault(); s.focus(); s.select(); } return; }
      if ((k === "[" || k === "]") && path === "/reservations") {
        const a = document.querySelector<HTMLElement>(`main [aria-label="${k === "[" ? "Previous day" : "Next day"}"]`);
        if (a) { e.preventDefault(); (a.closest("a") ?? a).click(); }
        return;
      }
      if (!screen?.items) return;
      const dir = k === "ArrowDown" ? "down" : k === "ArrowUp" ? "up" : k === "ArrowLeft" ? "left" : k === "ArrowRight" ? "right" : k === "j" ? "next" : k === "k" ? "prev" : null;
      if (dir) { if (step(dir)) e.preventDefault(); return; }
      const on = items().find((x) => x.hasAttribute("data-kbd-on"));
      if (!on) return;
      if (k === "Enter") { e.preventDefault(); press(on, screen.open); }
      else if ((k === "Backspace" || k === "Delete") && on.querySelector(".less")) { e.preventDefault(); on.querySelector<HTMLElement>(".less")!.click(); }
      else if (k === "Escape") light(undefined);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [screen, go, path, router]); // eslint-disable-line react-hooks/exhaustive-deps

  return <>
    <GoTo open={palette} onClose={() => setPalette(false)} modules={modules} role={role} onHelp={() => { setPalette(false); setHelp(true); }} />
    <Sheet open={help} onClose={() => setHelp(false)} title="Keyboard shortcuts">
      <div className="space-y-5" data-keys-help>
        {screen?.hints && <KeyList title={`On ${screen.title}`} rows={screen.hints} />}
        <KeyList title="Everywhere" rows={[["Ctrl K", "go to any section"], ["N", "new order"], ["?", "this list"], ["Esc", "close a window, let go of a highlight"]]} />
        <KeyList title="Go to — press G, then" rows={go.map((g) => [g.key.toUpperCase(), g.label])} cols />
      </div>
    </Sheet>
  </>;
}

function KeyList({ title, rows, cols }: { title: string; rows: [string, string][]; cols?: boolean }) {
  return (
    <section>
      <div className="text-[11px] font-semibold uppercase tracking-[.12em] text-[var(--color-label-3)] mb-2">{title}</div>
      <div className={cn("grid gap-x-6 gap-y-1.5", cols && "sm:grid-cols-2")}>
        {rows.map(([k, what]) => (
          <div key={k + what} className="flex items-center gap-3 min-h-8 text-[13.5px]">
            <span className="flex gap-1 shrink-0 min-w-[5.5rem]">{k.split(" ").map((p, i) => <kbd key={i} className="kbd">{p}</kbd>)}</span>
            <span className="min-w-0 text-[var(--color-label-2)]">{what}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Ctrl/⌘ K — type a few letters of any section this person can open, ↑ ↓, Enter. */
function GoTo({ open, onClose, modules, role, onHelp }: { open: boolean; onClose: () => void; modules: string[]; role: Role; onHelp: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState(""); const [i, setI] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const all = useMemo(() => [
    ...(modules.includes("orders") ? [{ href: "/orders/new", label: "New order", hint: "N" }] : []),
    ...ITEMS.filter((s) => modules.includes(s.key)).map((s) => ({ href: s.href, label: s.label, hint: GO.find((g) => g.href === s.href) ? `G ${GO.find((g) => g.href === s.href)!.key.toUpperCase()}` : "" })),
    ...freshFor(role).map((s) => ({ href: s.href, label: s.label, hint: "" })),
    { href: "/help", label: "Help & support", hint: "G H" },
    { href: "#keys", label: "Keyboard shortcuts", hint: "?" },
  ], [modules, role]);
  const list = all.filter((x) => { const t = q.trim().toLowerCase(); return !t || x.label.toLowerCase().includes(t) || x.label.toLowerCase().split(/\s+/).map((w) => w[0]).join("").startsWith(t); });
  useEffect(() => { if (open) { setQ(""); setI(0); setTimeout(() => input.current?.focus(), 30); } }, [open]);
  useEffect(() => { setI(0); }, [q]);
  const pick = (x: { href: string }) => { onClose(); if (x.href === "#keys") onHelp(); else router.push(x.href); };
  return (
    <Sheet open={open} onClose={onClose} title="Go to">
      <div data-goto>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-label-2)]" />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a section — orders, kitchen, bill…" className="!pl-9" aria-label="Go to a section"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setI((n) => Math.min(list.length - 1, n + 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setI((n) => Math.max(0, n - 1)); }
              else if (e.key === "Enter" && list[i]) { e.preventDefault(); pick(list[i]); }
            }} />
        </div>
        <ul className="mt-3 space-y-0.5 max-h-[50dvh] overflow-y-auto" role="listbox" aria-label="Sections">
          {list.map((x, n) => (
            <li key={x.href} role="option" aria-selected={n === i}>
              <button type="button" onClick={() => pick(x)} onMouseEnter={() => setI(n)}
                className={cn("w-full min-h-11 px-3 rounded-xl flex items-center gap-3 text-left text-[14px]", n === i ? "bg-[var(--color-fill-2)] font-semibold" : "hover:bg-[var(--color-fill)]")}>
                <span className="flex-1 min-w-0 truncate">{x.label}</span>
                {x.hint && <span className="flex gap-1 shrink-0">{x.hint.split(" ").map((p, k) => <kbd key={k} className="kbd">{p}</kbd>)}</span>}
                {n === i && <CornerDownLeft size={14} className="shrink-0 text-[var(--color-label-2)]" />}
              </button>
            </li>
          ))}
          {list.length === 0 && <li className="px-3 py-6 text-center text-sm text-[var(--color-label-2)]">Nothing called that.</li>}
        </ul>
        <p className="mt-3 flex items-center gap-1.5 text-xs text-[var(--color-label-2)]"><Keyboard size={13} /> Press <kbd className="kbd">?</kbd> for every shortcut.</p>
      </div>
    </Sheet>
  );
}
