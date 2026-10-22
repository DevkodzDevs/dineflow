/**
 * The storefront's cover (2026-10-23, the owner: "a modern designed cover, based on the property — restaurant, resort or
 * hotel"). With a photo, the photo drifts slowly. Without one, a drawn scene for the kind of place: a restaurant's
 * table under warm pendant lamps, a hotel tower lit against a city at dusk, a resort's palms on a setting sun.
 *
 * Two layers so it fills any width without stretching: the sky (CSS gradient, the moon or the lamps, stars) and the
 * ground, an SVG 2400 wide anchored to the bottom (`xMidYMax slice`) — a phone sees its middle, a 1920 screen nearly
 * all of it, so what matters sits between x 900 and 1500. Colours are the art's own (`.store-cover[data-kind]` in
 * globals.css). Everything is deterministic (seeded), so the server and the browser draw the same picture.
 */
export type CoverKind = "restaurant" | "hotel" | "resort";
export const coverKind = (type: string | null | undefined, rooms?: boolean): CoverKind =>
  type === "resort" ? "resort" : type === "hotel" ? "hotel" : type === "restaurant" ? "restaurant" : rooms ? "hotel" : "restaurant";

/** a small seeded generator — the same stars and windows on every render */
const seeded = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const fill = (v: string) => ({ fill: `var(--cv-${v})` });

export function StoreCover({ kind, photo }: { kind: CoverKind; photo?: string | null }) {
  if (photo) return (
    <div className="absolute inset-0 overflow-hidden store-cover" data-kind={kind} data-cover="photo">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photo} alt="" className="h-full w-full object-cover cover-drift" />
    </div>
  );
  return (
    <div className="absolute inset-0 overflow-hidden store-cover" data-kind={kind} data-cover={kind} aria-hidden>
      {kind === "restaurant" ? <Restaurant /> : kind === "hotel" ? <Hotel /> : <Resort />}
    </div>
  );
}

/* ── restaurant: pendant lamps, warm bokeh, a plate that steams ───────────────────────────────────────────────── */
function Restaurant() {
  const r = seeded(7);
  const bokeh = Array.from({ length: 26 }, () => ({ x: r() * 2400, y: 40 + r() * 260, s: 6 + r() * 26, o: .08 + r() * .22 }));
  const lamps = [{ x: 330, l: 70 }, { x: 760, l: 120 }, { x: 1010, l: 60 }, { x: 1240, l: 110 }, { x: 1470, l: 52 }, { x: 1760, l: 100 }, { x: 2080, l: 66 }];
  return (<>
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 2400 400" preserveAspectRatio="xMidYMin slice">
      <defs>
        <radialGradient id="cv-cone" cx="50%" cy="0%" r="100%"><stop offset="0%" stopColor="var(--cv-lamp)" stopOpacity=".55" /><stop offset="100%" stopColor="var(--cv-lamp)" stopOpacity="0" /></radialGradient>
        <radialGradient id="cv-bulb"><stop offset="0%" stopColor="var(--cv-lamp)" /><stop offset="100%" stopColor="var(--cv-glow)" stopOpacity="0" /></radialGradient>
      </defs>
      {bokeh.map((b, i) => <circle key={i} cx={b.x} cy={b.y} r={b.s} style={{ ...fill("glow"), opacity: b.o, animationDelay: `${(i % 7) * -1}s` }} className="cover-float" />)}
      {lamps.map((l, i) => (
        <g key={i} transform={`translate(${l.x} 0)`}>
          <path d={`M-150 ${l.l + 260} L-34 ${l.l + 28} L34 ${l.l + 28} L150 ${l.l + 260} Z`} fill="url(#cv-cone)" opacity=".55" />
          <line x1="0" y1="0" x2="0" y2={l.l} stroke="var(--cv-ink)" strokeWidth="3" />
          <path d={`M-38 ${l.l + 30} C -38 ${l.l + 6}, -18 ${l.l}, 0 ${l.l} C 18 ${l.l}, 38 ${l.l + 6}, 38 ${l.l + 30} Z`} style={fill("ink")} />
          <ellipse cx="0" cy={l.l + 32} rx="30" ry="12" fill="url(#cv-bulb)" className="cover-twinkle" style={{ animationDuration: `${4 + (i % 3)}s` }} />
          <ellipse cx="0" cy={l.l + 30} rx="14" ry="5" style={fill("lamp")} />
        </g>
      ))}
    </svg>
    <svg className="absolute inset-x-0 bottom-0 h-[64%] w-full" viewBox="0 0 2400 240" preserveAspectRatio="xMidYMax slice">
      <defs>
        <linearGradient id="cv-table" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--cv-sky-3)" /><stop offset="100%" stopColor="var(--cv-ink)" /></linearGradient>
        <radialGradient id="cv-curry" cx="50%" cy="40%" r="60%"><stop offset="0%" stopColor="var(--cv-food-2)" /><stop offset="100%" stopColor="var(--cv-food)" /></radialGradient>
      </defs>
      <rect x="0" y="176" width="2400" height="64" fill="url(#cv-table)" />
      <rect x="0" y="174" width="2400" height="3" style={{ ...fill("glow"), opacity: .35 }} />
      {/* the plate, a bowl, a glass — repeated wider out for big screens */}
      {[{ x: 1240, s: 1 }, { x: 520, s: .8 }, { x: 1960, s: .85 }].map((p, i) => (
        <g key={i} transform={`translate(${p.x} 186) scale(${p.s})`}>
          <ellipse cx="0" cy="8" rx="170" ry="26" style={{ fill: "rgb(0 0 0 / .35)" }} />
          <ellipse cx="0" cy="0" rx="160" ry="30" style={fill("plate-2")} />
          <ellipse cx="0" cy="-4" rx="148" ry="24" style={fill("plate")} />
          <path d="M-96 -6 C -90 -58, 90 -58, 96 -6 Z" fill="url(#cv-curry)" />
          <ellipse cx="-26" cy="-34" rx="16" ry="6" style={{ ...fill("food-2"), opacity: .8 }} />
          <path d="M14 -46 c 10 -10, 26 -8, 30 2 c -12 -2, -22 2, -30 -2 z" style={fill("leaf")} />
          <path d="M30 -40 c 12 -6, 24 -2, 26 8 c -10 -4, -18 -2, -26 -8 z" style={fill("leaf")} />
          {[-40, 0, 40].map((sx, j) => (
            <path key={j} d={`M${sx} -64 c -12 -14, 12 -26, 0 -42 c -10 -14, 10 -24, 2 -38`} fill="none" stroke="var(--cv-plate)" strokeWidth="5" strokeLinecap="round" opacity=".7" className="cover-steam" style={{ animationDelay: `${j * -1.1 - i * .4}s` }} />
          ))}
          <g transform="translate(-300 -6)">
            <ellipse cx="0" cy="10" rx="70" ry="12" style={{ fill: "rgb(0 0 0 / .3)" }} />
            <path d="M-62 -18 C -60 16, 60 16, 62 -18 Z" style={fill("plate-2")} />
            <ellipse cx="0" cy="-18" rx="62" ry="12" style={fill("food")} />
          </g>
          <g transform="translate(270 -10)">
            <path d="M-26 -90 L26 -90 L20 14 L-20 14 Z" style={{ fill: "rgb(255 255 255 / .16)" }} stroke="rgb(255 255 255 / .35)" strokeWidth="2" />
            <rect x="-22" y="-40" width="44" height="52" style={{ fill: "rgb(255 255 255 / .12)" }} />
          </g>
        </g>
      ))}
    </svg>
  </>);
}

/* ── hotel: a lit tower against the city at dusk, the moon, stars ─────────────────────────────────────────────── */
function Hotel() {
  const r = seeded(11);
  const stars = Array.from({ length: 70 }, () => ({ x: r() * 2400, y: r() * 230, s: .8 + r() * 2.2, d: r() * 4 }));
  const back = Array.from({ length: 30 }, (_, i) => ({ x: i * 82 - 20 + r() * 20, w: 60 + r() * 50, h: 50 + r() * 90 }));
  const front = Array.from({ length: 22 }, (_, i) => ({ x: i * 112 - 30 + r() * 30, w: 70 + r() * 60, h: 40 + r() * 70 })).filter((b) => b.x + b.w < 1250 || b.x > 1590);
  /* the tower's windows: lit or dark, a few twinkle */
  const win = Array.from({ length: 13 }, (_, row) => Array.from({ length: 6 }, (_, col) => ({ row, col, on: r() > .3, tw: r() > .85 }))).flat();
  return (<>
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 2400 400" preserveAspectRatio="xMidYMin slice">
      {stars.map((s, i) => <circle key={i} cx={s.x} cy={s.y} r={s.s} className="cover-twinkle" opacity=".7" style={{ ...fill("glow"), animationDelay: `${-s.d}s` }} />)}
    </svg>
    {/* the moon, kept round at every width */}
    <div className="absolute left-[46%] md:left-[72%] top-[9%] h-14 w-14 md:h-20 md:w-20 rounded-full" style={{ background: "var(--cv-glow)", boxShadow: "0 0 60px 18px color-mix(in srgb, var(--cv-glow) 35%, transparent)" }} />
    <svg className="absolute inset-x-0 bottom-0 h-[78%] w-full" viewBox="0 0 2400 300" preserveAspectRatio="xMidYMax slice">
      <defs><linearGradient id="cv-haze" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--cv-sky-3)" stopOpacity="0" /><stop offset="100%" stopColor="var(--cv-sky-3)" stopOpacity=".55" /></linearGradient></defs>
      <rect x="0" y="120" width="2400" height="180" fill="url(#cv-haze)" />
      {back.map((b, i) => <rect key={i} x={b.x} y={300 - b.h - 40} width={b.w} height={b.h + 40} style={fill("ink-2")} />)}
      {front.map((b, i) => (
        <g key={i}>
          <rect x={b.x} y={300 - b.h} width={b.w} height={b.h} style={fill("ink")} />
          {Array.from({ length: Math.floor(b.h / 22) }, (_, k) => <rect key={k} x={b.x + 10 + (k % 2) * 22} y={300 - b.h + 12 + k * 22} width="8" height="9" style={{ ...fill("lamp"), opacity: (i + k) % 3 ? .55 : .15 }} />)}
        </g>
      ))}
      {/* the tower */}
      <g transform="translate(1330 0)">
        <rect x="70" y="2" width="4" height="26" style={fill("plate")} />
        <circle cx="72" cy="2" r="4" style={fill("lamp")} className="cover-twinkle" />
        <path d="M18 44 L72 22 L126 44 Z" style={fill("ink")} />
        <rect x="10" y="44" width="124" height="256" style={fill("ink")} />
        <rect x="10" y="44" width="124" height="4" style={{ ...fill("plate"), opacity: .8 }} />
        {win.map((w, i) => <rect key={i} x={22 + w.col * 18} y={60 + w.row * 18} width="10" height="11" rx="1" style={{ ...fill("lamp"), opacity: w.on ? .9 : .12 }} className={w.tw ? "cover-twinkle" : undefined} />)}
        <rect x="-60" y="232" width="70" height="68" style={fill("ink")} />
        <rect x="134" y="210" width="80" height="90" style={fill("ink")} />
        <rect x="52" y="292" width="40" height="8" style={{ ...fill("lamp"), opacity: .8 }} />
      </g>
    </svg>
  </>);
}

/* ── resort: palms on a setting sun over the sea ─────────────────────────────────────────────────────────────── */
function Resort() {
  const palms = [{ x: 1395, h: .95, f: -1 }, { x: 1010, h: .78, f: 1 }, { x: 1520, h: .6, f: -1 }, { x: 330, h: .9, f: 1 }, { x: 2060, h: .95, f: -1 }, { x: 640, h: .6, f: -1 }];
  return (<>
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 2400 400" preserveAspectRatio="xMidYMin slice">
      {[[1080, 70], [1120, 90], [1340, 60], [1380, 52], [700, 80], [1800, 64]].map(([x, y], i) => (
        <path key={i} d={`M${x} ${y} q 12 -10 24 0 q 12 -10 24 0`} fill="none" stroke="var(--cv-ink)" strokeWidth="3.5" strokeLinecap="round" className="cover-float" style={{ animationDelay: `${-i}s` }} />
      ))}
    </svg>
    <svg className="absolute inset-x-0 bottom-0 h-[74%] w-full" viewBox="0 0 2400 280" preserveAspectRatio="xMidYMax slice">
      <defs>
        <linearGradient id="cv-sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--cv-sea-2)" /><stop offset="100%" stopColor="var(--cv-sea)" /></linearGradient>
        <radialGradient id="cv-sun"><stop offset="0%" stopColor="var(--cv-lamp)" /><stop offset="60%" stopColor="var(--cv-glow)" /><stop offset="100%" stopColor="var(--cv-glow)" stopOpacity="0" /></radialGradient>
        <path id="cv-leaf" d="M0 0 C 40 -50, 116 -50, 170 22 C 150 4, 128 -4, 112 -6 C 76 -10, 40 -2, 0 14 Z" />
        <clipPath id="cv-above"><rect x="0" y="0" width="2400" height="140" /></clipPath>
      </defs>
      <circle cx="1180" cy="140" r="150" fill="url(#cv-sun)" opacity=".55" />
      <circle cx="1180" cy="140" r="78" style={fill("glow")} clipPath="url(#cv-above)" />
      <rect x="0" y="140" width="2400" height="140" fill="url(#cv-sea)" />
      {/* the sun's road on the water */}
      {[0, 1, 2, 3, 4, 5, 6].map((k) => <rect key={k} x={1180 - (70 - k * 8)} y={150 + k * 14} width={(70 - k * 8) * 2} height="4" rx="2" style={{ ...fill("glow"), opacity: .7 - k * .08 }} />)}
      <g className="cover-wave" opacity=".35">
        {[176, 206, 236].map((y, i) => <path key={i} d={Array.from({ length: 22 }, (_, k) => `${k ? "" : `M${-120 + i * 40} ${y}`} q 30 -8 60 0 t 60 0`).join(" ")} fill="none" stroke="var(--cv-lamp)" strokeWidth="2" />)}
      </g>
      {/* the shore, then the palms */}
      <path d="M0 250 C 400 232, 800 262, 1200 246 C 1600 232, 2000 258, 2400 244 L2400 280 L0 280 Z" style={fill("ink")} />
      {palms.map((p, i) => (
        <g key={i} transform={`translate(${p.x} 256) scale(${p.f * p.h} ${p.h})`}>
          <path d="M0 0 C 6 -70, 22 -140, 46 -200" fill="none" stroke="var(--cv-ink)" strokeWidth="13" strokeLinecap="round" />
          <g transform="translate(46 -200)" className="cover-sway" style={{ animationDelay: `${-i * .9}s` }}>
            {/* fronds arch out to both sides and droop: the right half drawn, the left half its mirror */}
            {[-62, -30, 0, 28].map((a, k) => <use key={`r${k}`} href="#cv-leaf" transform={`rotate(${a}) scale(${k % 2 ? .86 : 1})`} style={fill("ink")} />)}
            {[-56, -24, 6, 30].map((a, k) => <use key={`l${k}`} href="#cv-leaf" transform={`scale(-1 1) rotate(${a}) scale(${k % 2 ? 1 : .88})`} style={fill("ink")} />)}
            <circle cx="0" cy="4" r="9" style={fill("ink")} />
          </g>
        </g>
      ))}
    </svg>
  </>);
}
