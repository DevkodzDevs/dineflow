"use client";
import { useW } from "./SiteWords";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { DishImage } from "@/components/menu/DishImage";

export type ShowDish = { name: string; word: string; category: string; about: string | null; veg: boolean; price: string; from: boolean; photo: string; credit: string | null };

const pad = (n: number) => String(n).padStart(2, "0");
/* drawn garnish that swirls round the plate when the dish changes */
const BITS = [
  <svg key="leaf" viewBox="0 0 40 40"><path d="M6 34C4 16 16 5 35 5c1 19-10 31-29 29Z" fill="var(--color-green)" /><path d="M8 32 28 12" stroke="rgb(255 255 255 / .45)" strokeWidth="1.6" fill="none" strokeLinecap="round" /></svg>,
  <svg key="chilli" viewBox="0 0 40 40"><path d="M9 7Q3 33 35 33 17 26 17 8Z" fill="var(--color-red)" /><path d="M13 8c0-3 1-5 4-6" stroke="var(--color-green)" strokeWidth="3" fill="none" strokeLinecap="round" /></svg>,
  <svg key="citrus" viewBox="0 0 40 40"><circle cx="20" cy="20" r="17" fill="var(--color-orange)" /><circle cx="20" cy="20" r="13.5" fill="rgb(255 255 255 / .38)" /><path d="M20 6.5v27M6.5 20h27M10.5 10.5l19 19M29.5 10.5l-19 19" stroke="var(--color-orange)" strokeWidth="1.6" /></svg>,
  <svg key="seeds" viewBox="0 0 40 40"><circle cx="11" cy="13" r="5" fill="rgb(20 14 10 / .85)" /><circle cx="27" cy="10" r="3.6" fill="rgb(20 14 10 / .7)" /><circle cx="24" cy="27" r="5.6" fill="rgb(20 14 10 / .8)" /><circle cx="9" cy="29" r="3" fill="rgb(20 14 10 / .6)" /></svg>,
];

/**
 * The showcase (2026-11-16, after the owner's reference videos): one signature dish at a time on a full screen. The plates
 * ride a turntable — one `rotate` brings the next to the front while each plate counter-turns to stay upright — the
 * dish's word stands very large behind it, and the stage takes a new colour for each dish. It moves on by itself, and by
 * the small plates, the arrows, a swipe or the arrow keys. Everything that moves is transform or opacity, plus one
 * background colour. Drawn whole by the server with the first dish; with reduced motion it does not move on by itself.
 */
export function SiteShow({ dishes, action }: { dishes: ShowDish[]; action: { href: string; label: string } | null }) {
  const w = useW();
  const n = dishes.length;
  const [turn, setTurn] = useState(0); // counts on past n, so the table never spins back the long way
  const [seen, setSeen] = useState(false), [over, setOver] = useState(false);
  const at = ((turn % n) + n) % n, m = dishes[at], held = !seen || over;
  const root = useRef<HTMLElement>(null), down = useRef<number | null>(null);
  const go = useCallback((k: number) => setTurn((t) => { let d = k - (((t % n) + n) % n); if (d > n / 2) d -= n; if (d < -n / 2) d += n; return t + d; }), [n]);

  useEffect(() => {
    const el = root.current; if (!el || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(([s]) => setSeen(s.isIntersecting), { threshold: 0.35 });
    io.observe(el); return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (held || n < 2 || document.hidden || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setTimeout(() => setTurn((t) => t + 1), 5200);
    return () => clearTimeout(id);
  }, [turn, held, n]);

  const words = m.name.trim().split(/\s+/), tail = words.pop() ?? "";
  return (
    <section ref={root} className="site-show" data-site-show data-tone={at % 8} aria-roledescription="carousel" aria-label={w("Signature dishes")}
      style={{ ["--n" as string]: n, ["--turn" as string]: turn } as React.CSSProperties}
      onMouseEnter={() => setOver(true)} onMouseLeave={() => setOver(false)} onFocus={() => setOver(true)} onBlur={() => setOver(false)}
      onKeyDown={(e) => { if (e.key === "ArrowRight") setTurn((t) => t + 1); else if (e.key === "ArrowLeft") setTurn((t) => t - 1); }}>
      <div className="site-show-glow" aria-hidden />
      <div className="site-show-table" aria-hidden
        onPointerDown={(e) => { down.current = e.clientX; }}
        onPointerUp={(e) => { const x = down.current; down.current = null; if (x != null && Math.abs(e.clientX - x) > 44) setTurn((t) => t + (e.clientX < x ? 1 : -1)); }}
        onPointerCancel={() => { down.current = null; }}>
        <div className="site-show-words">
          {dishes.map((d, k) => (
            <span key={k} data-on={k === at ? "" : undefined} style={{ ["--len" as string]: Math.max(4, d.word.length) } as React.CSSProperties}>
              {[...d.word].map((ch, j) => <i key={j} style={{ ["--j" as string]: j } as React.CSSProperties}>{ch}</i>)}
            </span>
          ))}
        </div>
        <div className="site-show-bits">{[0, 1, 2, 3, 4, 5].map((b) => <span key={b} style={{ ["--b" as string]: b } as React.CSSProperties}><i>{BITS[b % BITS.length]}</i></span>)}</div>
        <span key={`lead-${at}`} className="site-show-lead" />
        <div key={`tags-${at}`} className="site-show-tags">
          <span><i /><span className="site-mark" data-veg={m.veg ? "1" : "0"} style={{ ["--hue" as string]: m.veg ? "var(--color-green)" : "var(--color-red)" } as React.CSSProperties} />{w(m.veg ? "Vegetarian" : "Non-vegetarian")}</span>
          <span><i />{m.from && <small>from</small>}<b>{m.price}</b></span>
        </div>
        <div className="site-show-disc">
          <span className="site-show-orbit" /><span className="site-show-orbit" />
          {dishes.map((d, k) => (
            <figure key={k} className="site-show-plate" data-on={k === at ? "" : undefined} style={{ ["--k" as string]: k } as React.CSSProperties} onClick={() => go(k)}>
              <DishImage src={d.photo} w={500} alt="" loading={k === 0 ? "eager" : "lazy"} draggable={false} />
              <span className="site-steam">{[-30, 0, 28].map((x, j) => <i key={j} style={{ ["--x" as string]: x, ["--i" as string]: j } as React.CSSProperties} />)}</span>
            </figure>
          ))}
        </div>
      </div>

      <div className="site-wrap site-show-copy">
        <div key={at} className="site-show-card" data-site-show-card>
          <p>{m.category}</p>
          <h3 className="site-show-name">{words.join(" ")} <em>{tail}</em></h3>
          {m.about && <p className="site-show-about">{m.about}</p>}
          {m.credit && <p className="site-show-credit" data-photo-credit>Illustrative · {m.credit}</p>}
        </div>
        <p className="site-show-no"><b>{pad(at + 1)}</b><span>/ {pad(n)}</span></p>
        <div key={`buy-${at}`} className="site-show-buy">
          <p className="site-show-price"><span role="img" aria-label={w(m.veg ? "Vegetarian" : "Non-vegetarian")} className="site-mark" data-veg={m.veg ? "1" : "0"} style={{ ["--hue" as string]: m.veg ? "var(--color-green)" : "var(--color-red)" } as React.CSSProperties} />{m.from && <small>from</small>}<b>{m.price}</b></p>
          {action && <a href={action.href} className="site-btn site-btn-main">{action.label}<ArrowRight size={18} aria-hidden /></a>}
        </div>
      </div>

      <div className="site-wrap site-show-ctl">
        <button type="button" className="site-show-arrow" aria-label={w("Previous dish")} onClick={() => setTurn((t) => t - 1)}><ArrowLeft size={20} aria-hidden /></button>
        <ul className="site-show-thumbs">
          {dishes.map((d, k) => (
            <li key={k}><button type="button" aria-label={d.name} aria-current={k === at ? "true" : undefined} onClick={() => go(k)}><DishImage src={d.photo} w={250} alt="" /></button></li>
          ))}
        </ul>
        <button type="button" className="site-show-arrow" aria-label={w("Next dish")} onClick={() => setTurn((t) => t + 1)}><ArrowRight size={20} aria-hidden /></button>
        <span className="site-show-timer" aria-hidden>{!held && <i key={turn} />}</span>
      </div>
    </section>
  );
}
