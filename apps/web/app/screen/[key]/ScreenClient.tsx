"use client";
/* eslint-disable @next/next/no-img-element -- logos and dish photos are the property's own uploads on any host; a plain img keeps these pages free of next/image remote patterns */
import { useEffect, useMemo, useRef, useState } from "react";
import { ChefHat, BellRing, UtensilsCrossed } from "lucide-react";
import { clsx } from "clsx";
import { formatINR } from "@/lib/format";
import { menuPages, freshTokens } from "@/lib/screen";

export type Show = "menu" | "tokens" | "both";
type Dish = { name: string; is_veg: boolean | null; image: string | null; description: string | null; price: number; from: boolean };
export type Feed = { name: string; logo: string | null; menu: { name: string; items: Dish[] }[]; tokens: { preparing: number[]; ready: number[] }; at: string };

const POLL = 8000;     // tokens move every few seconds at a busy counter
const TURN = 12000;    // one page of the menu, then the next

function Clock() {
  const [now, setNow] = useState<string>("");
  useEffect(() => {
    const f = () => setNow(new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" }).format(new Date()));
    f(); const t = setInterval(f, 15000); return () => clearInterval(t);
  }, []);
  return <div className="text-[clamp(20px,2.2vw,40px)] font-bold tabular-nums text-[var(--color-label-2)]" suppressHydrationWarning>{now}</div>;
}

function Veg({ v }: { v: boolean | null }) {
  if (v == null) return null;
  return <span aria-label={v ? "Veg" : "Non-veg"} className="inline-grid place-items-center shrink-0 h-[1.1em] w-[1.1em] rounded-[3px] border-2"
    style={{ borderColor: v ? "var(--color-green)" : "var(--color-red)" }}><span className="h-[.45em] w-[.45em] rounded-full" style={{ background: v ? "var(--color-green)" : "var(--color-red)" }} /></span>;
}

/**
 * The TV. It asks for fresh numbers every 8 seconds and turns the menu every 12. A token that has just become
 * ready glows for half a minute, so the eye finds it from across the room. If the link stops working (the key was
 * rotated, or the membership ended) the screen says so instead of freezing on old numbers.
 */
export function ScreenClient({ k, initial, show }: { k: string; initial: Feed; show: Show }) {
  const [feed, setFeed] = useState<Feed>(initial); const [lost, setLost] = useState(false);
  const [fresh, setFresh] = useState<Set<number>>(new Set()); const seen = useRef(new Set(initial.tokens.ready));
  useEffect(() => {
    // a plain GET (app/api/screen): a server action's id changes with each build and a TV left on for days would
    // freeze after a deploy. Twelve hours on it reloads itself — only when the server answers — for the new build.
    const born = Date.now();
    const t = setInterval(() => {
      void fetch(`/api/screen/${encodeURIComponent(k)}`, { cache: "no-store" }).then(async (res) => {
        if (res.ok && Date.now() - born > 12 * 3600e3) { location.reload(); return; }
        if (!res.ok) { setLost(true); return; }
        const f = (await res.json()) as Feed | null;
        if (!f) { setLost(true); return; }
        setLost(false);
        const now = freshTokens(seen.current, f.tokens.ready);
        if (now.length) {
          setFresh((s) => new Set([...s, ...now]));
          setTimeout(() => setFresh((s) => { const n = new Set(s); now.forEach((x) => n.delete(x)); return n; }), 30000);
        }
        seen.current = new Set(f.tokens.ready);
        setFeed(f);
      }).catch(() => setLost(true));
    }, POLL);
    return () => clearInterval(t);
  }, [k]);

  // a page is always the same number of rows, so a dish is the same size on every page
  const cols = show === "menu" ? 5 : 4, rows = 2;
  const pages = useMemo(() => menuPages(feed.menu, cols, rows), [feed.menu, cols]);
  const [page, setPage] = useState(0);
  useEffect(() => { if (pages.length < 2) return; const t = setInterval(() => setPage((p) => (p + 1) % pages.length), TURN); return () => clearInterval(t); }, [pages.length]);
  const cur = pages[page % Math.max(1, pages.length)];

  const tokens = (
    <div className={clsx("min-w-0 grid gap-[1.2vw]", show === "tokens" ? "grid-cols-2 h-full" : "grid-rows-[minmax(0,1.25fr)_minmax(0,1fr)] h-full")} data-screen-tokens>
      <section className="min-h-0 rounded-[1.6vw] p-[1.4vw] flex flex-col" style={{ background: "color-mix(in srgb, var(--color-green) 14%, transparent)" }}>
        <div className="flex items-center gap-[.6vw] text-[clamp(18px,1.9vw,38px)] font-extrabold" style={{ color: "var(--color-green)" }}><BellRing className="h-[1.1em] w-[1.1em]" aria-hidden />Ready — please collect</div>
        <div className="mt-[1vw] flex flex-wrap content-start gap-[.8vw] min-h-0 overflow-hidden" data-ready>
          {feed.tokens.ready.map((n) => (
            <span key={n} className={clsx("rounded-[1vw] px-[1.1vw] py-[.3vw] font-black tabular-nums leading-none", show === "tokens" ? "text-[clamp(48px,7vw,150px)]" : "text-[clamp(36px,4.4vw,96px)]", fresh.has(n) && "screen-fresh")}
              style={{ background: "var(--color-green)", color: "var(--color-bg)" }}>{n}</span>))}
          {feed.tokens.ready.length === 0 && <span className="text-[clamp(16px,1.4vw,28px)] text-[var(--color-label-2)]">Nothing waiting</span>}
        </div>
      </section>
      <section className="min-h-0 rounded-[1.6vw] p-[1.4vw] flex flex-col bg-[var(--color-bg-2)]">
        <div className="flex items-center gap-[.6vw] text-[clamp(18px,1.6vw,32px)] font-extrabold" style={{ color: "var(--color-orange)" }}><ChefHat className="h-[1.1em] w-[1.1em]" aria-hidden />Preparing</div>
        <div className="mt-[1vw] flex flex-wrap content-start gap-[.7vw] min-h-0 overflow-hidden" data-preparing>
          {feed.tokens.preparing.map((n) => <span key={n} className={clsx("rounded-[.8vw] px-[.9vw] py-[.25vw] font-extrabold tabular-nums leading-none bg-[var(--color-fill)]", show === "tokens" ? "text-[clamp(36px,4.6vw,100px)]" : "text-[clamp(24px,2.6vw,56px)]")}>{n}</span>)}
          {feed.tokens.preparing.length === 0 && <span className="text-[clamp(16px,1.4vw,28px)] text-[var(--color-label-2)]">—</span>}
        </div>
      </section>
    </div>
  );

  const menu = (
    <div className="min-w-0 h-full flex flex-col" data-screen-menu>
      {cur ? <>
        <div className="flex justify-end gap-[.4vw] h-[.45vw] min-h-1.5 mb-[.6vw]" aria-hidden>{pages.length > 1 && pages.map((_, i) => <span key={i} className={clsx("h-full rounded-full transition-all", i === page % pages.length ? "w-[2vw] bg-[var(--color-label)]" : "w-[.45vw] min-w-1.5 bg-[var(--color-fill-2)]")} />)}</div>
        {/* each category: its name, then its rows of dishes; rows left over on the page stay empty at the bottom */}
        <div className="flex-1 min-h-0 grid gap-x-[1vw] gap-y-[.8vw]" data-screen-page
          style={{ gridTemplateRows: [...cur.flatMap((sec) => ["auto", `repeat(${Math.ceil(sec.items.length / cols)}, minmax(0,1fr))`]), ...Array(Math.max(0, rows - cur.reduce((a, sec) => a + Math.ceil(sec.items.length / cols), 0))).fill("minmax(0,1fr)")].join(" ") }}>
          {cur.map((sec) => [
            <div key={sec.cat + sec.part + "h"} className="flex items-baseline gap-[.8vw] min-w-0 pt-[.3vw]" data-screen-cat>
              <span className="text-[clamp(22px,2.2vw,46px)] font-black tracking-tight truncate">{sec.cat}</span>
              {sec.parts > 1 && <span className="text-[clamp(14px,1.1vw,22px)] font-bold text-[var(--color-label-2)] tabular-nums">{sec.part}/{sec.parts}</span>}
            </div>,
            <div key={sec.cat + sec.part} className="min-h-0 grid gap-[1vw]" style={{ gridRow: `span ${Math.ceil(sec.items.length / cols)}`, gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gridTemplateRows: `repeat(${Math.ceil(sec.items.length / cols)}, minmax(0,1fr))` }}>
              {sec.items.map((d) => (
                <div key={d.name} className="min-w-0 min-h-0 rounded-[1.2vw] bg-[var(--color-bg-2)] overflow-hidden flex flex-col" data-screen-dish>
                  <div className="relative flex-1 min-h-0 bg-[var(--color-fill)] grid place-items-center overflow-hidden">
                    {d.image ? <img src={d.image} alt="" className="absolute inset-0 h-full w-full object-cover" /> : <UtensilsCrossed className="h-[30%] w-[30%] text-[var(--color-label-3)]" aria-hidden />}
                  </div>
                  <div className="p-[.9vw] flex items-start gap-[.6vw]">
                    <span className="text-[clamp(14px,1.2vw,26px)] pt-[.2em]"><Veg v={d.is_veg} /></span>
                    <div className="min-w-0 flex-1 text-[clamp(14px,1.2vw,26px)] font-bold leading-tight line-clamp-2">{d.name}</div>
                    <div className="shrink-0 text-[clamp(14px,1.3vw,28px)] font-black tabular-nums">{d.from && <span className="text-[.6em] font-semibold text-[var(--color-label-2)] mr-1">from</span>}{formatINR(d.price, { whole: true })}</div>
                  </div>
                </div>))}
            </div>,
          ])}
        </div>
      </> : <div className="h-full grid place-items-center text-[clamp(18px,2vw,40px)] text-[var(--color-label-2)]">The menu will show here once dishes are on sale.</div>}
    </div>
  );

  return (
    <div className="h-full flex flex-col p-[1.6vw] gap-[1.2vw]" data-screen={show}>
      <header className="flex items-center gap-[1vw] shrink-0">
        {feed.logo && <img src={feed.logo} alt="" className="h-[clamp(36px,3.4vw,72px)] w-[clamp(36px,3.4vw,72px)] rounded-[.8vw] object-cover" />}
        <div className="min-w-0 flex-1 text-[clamp(22px,2.4vw,52px)] font-black tracking-tight truncate">{feed.name}</div>
        {lost && <div className="text-[clamp(14px,1.2vw,24px)] font-bold" style={{ color: "var(--color-red)" }} data-screen-lost>Reconnecting… (stuck? open the new screen link from Settings)</div>}
        <Clock />
      </header>
      <main className={clsx("flex-1 min-h-0 grid grid-rows-[minmax(0,1fr)] gap-[1.4vw]", show === "both" ? "grid-cols-[minmax(0,2.1fr)_minmax(0,1fr)]" : "grid-cols-1")}>
        {show !== "tokens" && menu}
        {show !== "menu" && tokens}
      </main>
    </div>
  );
}
