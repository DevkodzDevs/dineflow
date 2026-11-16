"use client";
import { useW } from "./SiteWords";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ArrowRight, UtensilsCrossed, X } from "lucide-react";
import { DishImage } from "@/components/menu/DishImage";

type Dish = { name: string; about: string; cat: string; veg: boolean; price: string; from: boolean; photo: string; credit: string };
type Doc = Document & { startViewTransition?: (change: () => void) => { finished: Promise<void> } };

/**
 * A dish, opened (2026-11-16, sixth pass). Any element the server marked `data-dish` — a row of the menu, a signature
 * card — opens this sheet with what the page already says about the dish, larger. One listener on the document; the
 * dish is read from the element's own data attributes, so nothing crosses from the server but text.
 *
 * Where the browser has view transitions, **the small photo itself grows into the large one** and shrinks back on
 * closing: the name `site-dish` is put on the thumbnail for the old picture and belongs to the sheet's photo in the new
 * one (site.css). Elsewhere, and with reduced motion, the sheet fades up (`@starting-style`). It is a native modal
 * `<dialog>`: Escape and the backdrop close it, focus is held inside and handed back to the row.
 */
export function SiteDishBox({ action }: { action: { href: string; label: string } | null }) {
  const w = useW();
  const box = useRef<HTMLDialogElement>(null), thumb = useRef<HTMLElement | null>(null), from = useRef<HTMLElement | null>(null);
  const [dish, setDish] = useState<Dish | null>(null), morph = useRef(false);

  useEffect(() => {
    const can = !!(document as Doc).startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches;
    morph.current = can; box.current?.toggleAttribute("data-vt", can); // no fade of its own where the photo morphs
    const open = (el: HTMLElement) => {
      const d = el.dataset, pic = el.querySelector<HTMLElement>(".site-thumb:not([data-none]), :scope > img");
      const next: Dish = { name: d.name ?? "", about: d.about ?? "", cat: d.cat ?? "", veg: d.veg === "1", price: d.price ?? "", from: d.from === "1", photo: d.photo ?? "", credit: d.credit ?? "" };
      const show = () => { if (pic) pic.style.viewTransitionName = ""; flushSync(() => setDish(next)); box.current?.showModal(); };
      thumb.current = next.photo ? pic : null; from.current = el;
      if (!can) return show();
      if (thumb.current) thumb.current.style.viewTransitionName = "site-dish";
      (document as Doc).startViewTransition!(show);
    };
    const click = (e: MouseEvent) => {
      const at = e.target as Element | null, el = at?.closest?.<HTMLElement>("[data-dish]");
      if (el && !at?.closest("a") && !box.current?.open) open(el);
    };
    const key = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if ((e.key === "Enter" || e.key === " ") && el?.matches?.("li[data-dish]")) { e.preventDefault(); open(el); }
    };
    document.addEventListener("click", click); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("click", click); document.removeEventListener("keydown", key); };
  }, []);

  const close = () => {
    const el = box.current, pic = thumb.current; if (!el?.open) return;
    /* a click does not focus a button in every browser, so the row is handed the focus back by name */
    const back = () => from.current?.focus({ preventScroll: true });
    if (!morph.current) { el.close(); return back(); }
    (document as Doc).startViewTransition!(() => { el.close(); back(); if (pic?.isConnected) pic.style.viewTransitionName = "site-dish"; })
      .finished.finally(() => { if (pic) pic.style.viewTransitionName = ""; });
  };

  return (
    <dialog ref={box} className="site-dishbox" data-site-dishbox aria-label={dish?.name ?? w("Dish")}
      onClick={(e) => { if (e.target === e.currentTarget) close(); }} onCancel={(e) => { e.preventDefault(); close(); }}>
      {dish && (
        <div className="site-day site-dishbox-in">
          <div className="site-dishbox-art" data-none={dish.photo ? undefined : ""}>
            {dish.photo ? <DishImage key={dish.photo} src={dish.photo} w={800} alt={dish.name} loading="eager" /> : <UtensilsCrossed size={56} strokeWidth={1.2} aria-hidden />}
            {dish.credit && <span className="site-sig-credit" data-photo-credit>Illustrative · {dish.credit}</span>}
          </div>
          <div className="site-dishbox-body">
            {dish.cat && <p className="site-eyebrow">{dish.cat}</p>}
            <h3 className="site-dishbox-name">{dish.name}</h3>
            {dish.about && <p className="site-dishbox-about">{dish.about}</p>}
            <p className="site-dishbox-facts">
              <span className="site-chip"><span className="site-mark" data-veg={dish.veg ? "1" : "0"} style={{ ["--hue" as string]: dish.veg ? "var(--color-green)" : "var(--color-red)", marginTop: 0 } as React.CSSProperties} />{w(dish.veg ? "Vegetarian" : "Non-vegetarian")}</span>
              <span className="site-dishbox-price">{dish.from && <small>from</small>}{dish.price}</span>
            </p>
            {action && <a href={action.href} className="site-btn site-btn-main site-btn-wide">{action.label}<ArrowRight size={20} aria-hidden /></a>}
            <p className="site-note">Today&apos;s price, before taxes.</p>
          </div>
          <button type="button" className="site-dishbox-close" aria-label={w("Close")} onClick={close}><X size={20} aria-hidden /></button>
        </div>
      )}
    </dialog>
  );
}
