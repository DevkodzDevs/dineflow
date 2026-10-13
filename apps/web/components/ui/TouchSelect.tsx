"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * A <select> on a tablet opens a list as wide as its field.
 *
 * The iPad's own menu for a <select> is as wide as its longest option and floats over the middle of the
 * field (Rooms → New room → Type: a 370px menu on a 780px field), and a page cannot size it. Where the
 * browser lets the list itself be styled (`appearance: base-select` — Chrome, Edge) globals.css makes it
 * the field's width. Where it does not — every iPad browser is WebKit — a tap on a select on a touch
 * screen 640px or wider opens this list instead: under the field (over it when there is no room below),
 * exactly the field's width, with the desktop list's look — a 16px card, 44px rows, a tick on the
 * chosen one, group labels. A pick sets the select's value and fires `input` and `change`, so React's
 * onChange and a form's FormData see it as they would a native pick. A tap outside, a scroll, a resize
 * or Escape closes it. Phones keep the native wheel, a mouse keeps the native menu, and a select with
 * `data-native` keeps it too. Mounted once in each layout.
 */
type Item = { kind: "group"; label: string } | { kind: "option"; value: string; label: string; disabled: boolean; selected: boolean };
type Place = { left: number; width: number; top?: number; bottom?: number; maxH: number };

const read = (s: HTMLSelectElement): Item[] => {
  const out: Item[] = [];
  const add = (o: HTMLOptionElement, off = false) => { if (!o.hidden) out.push({ kind: "option", value: o.value, label: o.label || o.text, disabled: off || o.disabled, selected: o.selected }); };
  for (const c of Array.from(s.children)) {
    if (c instanceof HTMLOptGroupElement) { out.push({ kind: "group", label: c.label }); for (const o of Array.from(c.children)) if (o instanceof HTMLOptionElement) add(o, c.disabled); }
    else if (c instanceof HTMLOptionElement) add(c);
  }
  return out;
};
const place = (s: HTMLSelectElement): Place => {
  const r = s.getBoundingClientRect(), vv = window.visualViewport;
  const bottomEdge = (vv ? vv.offsetTop + vv.height : innerHeight) - 12, topEdge = (vv ? vv.offsetTop : 0) + 12;
  const below = bottomEdge - r.bottom - 6, above = r.top - topEdge - 6;
  return below >= 220 || below >= above
    ? { left: r.left, width: r.width, top: r.bottom + 6, maxH: Math.min(340, below) }
    : { left: r.left, width: r.width, bottom: innerHeight - r.top + 6, maxH: Math.min(340, above) };
};

export function TouchSelect() {
  const [sel, setSel] = useState<HTMLSelectElement | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [at, setAt] = useState<Place | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const cur = useRef<HTMLSelectElement | null>(null);

  const close = () => { cur.current?.removeAttribute("data-open"); cur.current = null; setSel(null); setAt(null); };
  const open = (s: HTMLSelectElement) => { cur.current?.removeAttribute("data-open"); cur.current = s; s.setAttribute("data-open", ""); setItems(read(s)); setAt(place(s)); setSel(s); };
  const pick = (v: string) => {
    const s = cur.current; if (!s) return;
    if (s.value !== v) {
      // the native setter, so a controlled React select takes the change as its own
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(s, v);
      s.dispatchEvent(new Event("input", { bubbles: true })); s.dispatchEvent(new Event("change", { bubbles: true }));
    }
    close();
  };
  const openRef = useRef(open); openRef.current = open;
  const closeRef = useRef(close); closeRef.current = close;

  // a tap (not a drag) on a select, on a touch screen from tablet size, where the list cannot be styled
  useEffect(() => {
    if (typeof CSS !== "undefined" && CSS.supports("appearance: base-select")) return;
    const coarse = matchMedia("(pointer: coarse)");
    const ok = (s: HTMLSelectElement | null): s is HTMLSelectElement => !!s && coarse.matches && innerWidth >= 640 && !s.disabled && !s.multiple && s.size <= 1 && !s.hasAttribute("data-native");
    const selectOf = (e: TouchEvent) => ((e.target as Element | null)?.closest?.("select") ?? null) as HTMLSelectElement | null;
    let start: { x: number; y: number; s: HTMLSelectElement } | null = null;
    const down = (e: TouchEvent) => { const s = selectOf(e); start = ok(s) && e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY, s } : null; };
    const up = (e: TouchEvent) => {
      const s = selectOf(e); const t = e.changedTouches[0];
      if (!start || s !== start.s || !t || Math.hypot(t.clientX - start.x, t.clientY - start.y) > 10) { start = null; return; }
      e.preventDefault();   // no click, no focus: the native menu never opens and no keyboard rises
      openRef.current(start.s); start = null;
    };
    document.addEventListener("touchstart", down, { capture: true, passive: true });
    document.addEventListener("touchend", up, { capture: true, passive: false });
    return () => { document.removeEventListener("touchstart", down, true); document.removeEventListener("touchend", up, true); };
  }, []);

  // while open: the chosen option in view; a scroll elsewhere, a resize or Escape closes it
  useEffect(() => {
    if (!sel) return;
    const l = list.current, o = l?.querySelector<HTMLElement>("[aria-selected='true']");
    if (l && o) l.scrollTop = o.offsetTop - l.clientHeight / 2 + o.offsetHeight / 2;
    const shut = () => closeRef.current();
    const scroll = (e: Event) => { if (!(e.target instanceof Node && list.current?.contains(e.target))) shut(); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); shut(); } };   // before a dialog's own Escape
    window.addEventListener("scroll", scroll, true); window.addEventListener("resize", shut); window.addEventListener("keydown", key, true);
    return () => { window.removeEventListener("scroll", scroll, true); window.removeEventListener("resize", shut); window.removeEventListener("keydown", key, true); };
  }, [sel]);

  if (!sel || !at) return null;
  return createPortal(
    <>
      <div className="fixed inset-0 z-[70]" onClick={close} aria-hidden />
      <div ref={list} role="listbox" aria-label={sel.getAttribute("aria-label") ?? sel.name ?? "Choose"} className="touch-select fixed z-[71]"
        style={{ left: at.left, width: at.width, top: at.top, bottom: at.bottom, maxHeight: at.maxH, transformOrigin: at.top != null ? "top center" : "bottom center" }} data-touch-select>
        {items.map((it, i) => it.kind === "group"
          ? <div key={i} className="ts-group">{it.label}</div>
          : <button key={i} type="button" role="option" aria-selected={it.selected} disabled={it.disabled} onClick={() => pick(it.value)} className="ts-option">
              <span className="min-w-0 flex-1 truncate">{it.label}</span>{it.selected && <span aria-hidden className="ts-tick">✓</span>}
            </button>)}
      </div>
    </>,
    document.body,
  );
}
