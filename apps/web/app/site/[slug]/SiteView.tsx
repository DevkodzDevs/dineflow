import Link from "next/link";
import { MapPin, Phone, Clock, Star, Users, ArrowRight, ArrowUpRight, BedDouble, UtensilsCrossed, Building2, TreePalm, Ticket, Navigation, Sparkles, KeyRound, Quote, LocateFixed, Mail, MessageCircle, Instagram, Facebook, Youtube, Megaphone } from "lucide-react";
import { formatINR } from "@/lib/format";
import { ldJson } from "@/lib/schemaorg";
import { StoreCover, coverKind } from "@/app/dine/[slug]/StoreCover";
import { DishImage } from "@/components/menu/DishImage";
import { type SiteData, type SiteDish, openNow, clock, telHref, sitePhotos, siteBlocks, siteActions, siteSignature, siteShowWord, siteGraph, siteFaq, siteAddress, sitePin, pinLabel, mapEmbedUrl, directionsUrl, placeUrl, waHref, siteBanner, reviewUrl, siteLook, siteVideo, siteInsta, siteModel, roomPhotos } from "@/lib/website";
import { SiteFx } from "./SiteFx";
import { SiteShow } from "./SiteShow";
import { SiteDishBox } from "./SiteDishBox";
import { SiteMap, SiteCopy, SiteShare } from "./SiteMap";
import { SiteAsk, SiteOffer } from "./SiteExtras";
import { SiteRoomBox, SiteInsta, SiteModel } from "./SiteMore";
import { SiteWords } from "./SiteWords";
import { type SiteLang, SITE_LANG_NAME, siteT, sitePair, clientWords, siteLangs, sagaIn, faqIn } from "@/lib/siteWords";

/**
 * The website itself (0185; redrawn 2026-11-16 — "night service", site.css). `d` is what `website_public` answered; `url`
 * is the page's own address, for the search data. page.tsx fetches and decides; this draws. It is a server component:
 * the page is whole without JavaScript — SiteFx only adds the reveals, the menu's marker and the pointer light.
 */
const KIND = {
  restaurant: { word: "Restaurant", Icon: UtensilsCrossed, close: ["Come", "hungry."], find: ["Find our", "table"], hello: "I would like to know more." },
  hotel: { word: "Hotel", Icon: Building2, close: ["Your room", "is ready."], find: ["Find your", "way"], hello: "I would like to ask about a room." },
  resort: { word: "Resort", Icon: TreePalm, close: ["Stay a little", "longer."], find: ["The way", "here"], hello: "I would like to ask about a stay." },
} as const;
const https = (u: string | null | undefined): u is string => !!u && /^https:\/\/[^\s"'<>]+$/i.test(u);
const step = (i: number) => ({ ["--i" as string]: i }) as React.CSSProperties;
const hue = (veg: boolean) => ({ ["--hue" as string]: veg ? "var(--color-green)" : "var(--color-red)" }) as React.CSSProperties;
const credit = (c: string) => c.replace(/^Photo: /, "");

const FoodMark = ({ veg }: { veg: boolean }) => <span role="img" aria-label={veg ? "Vegetarian" : "Non-vegetarian"} className="site-mark" data-veg={veg ? "1" : "0"} style={hue(veg)} />;
const Stars = ({ n, size = 15 }: { n: number; size?: number }) => (
  <span role="img" aria-label={`${n} out of 5`} className="inline-flex gap-0.5 text-[var(--site-accent)]">
    {[1, 2, 3, 4, 5].map((i) => <Star key={i} size={size} fill={i <= Math.round(n) ? "currentColor" : "none"} className={i <= Math.round(n) ? "" : "opacity-35"} aria-hidden />)}
  </span>
);
const Price = ({ m }: { m: SiteDish }) => {
  const from = m.from != null && Number(m.from) > 0 && Number(m.from) !== Number(m.price);
  return <span className="site-price">{from && <small>from</small>}{formatINR(from ? Number(m.from) : Number(m.price), { whole: true })}</span>;
};
/** Words set on a circle (the turning badge, the offer's sticker). `textLength` closes the ring whatever the words are. */
const Ring = ({ id, text }: { id: string; text: string }) => (
  <svg viewBox="0 0 120 120" aria-hidden>
    <defs><path id={id} d="M60 60 m-46 0 a46 46 0 1 1 92 0 a46 46 0 1 1 -92 0" /></defs>
    <text><textPath href={`#${id}`} textLength="284" lengthAdjust="spacing">{text}</textPath></text>
  </svg>
);
/** A whole number that SiteFx counts up to when it comes on screen; the server writes the finished figure. */
const Count = ({ n, money }: { n: number; money?: boolean }) => <b data-count={Math.round(n)} data-prefix={money ? "₹" : ""}>{money ? formatINR(n, { whole: true }) : n}</b>;
function Head({ eyebrow, title, accent, children }: { eyebrow: string; title: string; accent?: string; children?: React.ReactNode }) {
  return (
    <div className="site-head">
      <div className="min-w-0" data-rv>
        <p className="site-eyebrow">{eyebrow}</p>
        <h2 className="site-h2">{title}{accent ? <> <em>{accent}</em></> : null}</h2>
      </div>
      {children}
    </div>
  );
}
/** The property's own mark: its logo, else its initial on the accent. */
const Mark = ({ logo, name }: { logo: string | null; name: string }) =>
  // eslint-disable-next-line @next/next/no-img-element
  logo ? <img className="site-mono" src={logo} alt="" loading="lazy" decoding="async" /> : <i className="site-mono" aria-hidden>{name.trim().charAt(0).toUpperCase()}</i>;

/**
 * The map as art (2026-11-16): a town drawn on a grid of streets with the place at its crossing, the way in drawn as a
 * route, and — by the kind of place — a river (a restaurant's town), a park (a hotel's) or the sea (a resort's). It is a
 * drawing, not a survey: the live map is one tap away in SiteMap. The crossing is the middle of the picture, so the pin
 * (an element over it) stands on it at any size and through the landing tilt.
 */
const WAY = "M 112 610 V 492 Q 112 476 128 476 H 288 Q 304 476 304 460 V 316 Q 304 300 320 300 H 400";
function MapArt({ kind }: { kind: "restaurant" | "hotel" | "resort" }) {
  const blocks: React.ReactNode[] = [];
  for (let j = -5; j <= 4; j++) for (let k = -6; k <= 5; k++) {
    const x = 400 + k * 96 + 8, y = 300 + j * 88 + 10, cx = x + 40, cy = y + 34;
    if (Math.hypot(cx - 400, cy - 300) < 70) continue;                                    // the square the pin stands in
    if (kind === "resort" ? cx - 400 + (cy - 300) * 1.1 > 190 : kind === "hotel" ? k >= 1 && k <= 2 && j >= -3 && j <= -2 : j === -3) continue;   // the sea · the park · the river
    blocks.push(<rect key={`${j}.${k}`} className="m-block" x={x} y={y} width={80} height={68} rx={10} opacity={0.5 + ((((j * 5 + k * 11) % 5) + 5) % 5) * 0.1} />);
  }
  /* a resort's roads stop at the beach */
  const east = kind === "resort" ? 590 : 1100, south = kind === "resort" ? 468 : 900;
  return (
    <svg viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice" aria-hidden focusable="false">
      <g transform="rotate(-11 400 300)">
        {kind === "resort" && (<>
          <path className="m-water" d="M 1300 -310 L 1300 900 L -40 900 C 170 730 320 600 430 492 S 640 292 760 190 S 1050 -80 1300 -310 Z" />
          {[0, 1, 2].map((i) => <path key={i} className="m-wave" d={`M ${470 + i * 44} ${560 + i * 26} c 26 -30 50 -32 74 -62 s 40 -52 70 -72 s 44 -50 70 -76`} />)}
        </>)}
        {kind === "hotel" && (<>
          <rect className="m-green" x={496} y={38} width={192} height={170} rx={26} />
          {[[532, 80], [580, 66], [634, 92], [554, 138], [608, 150], [652, 170], [526, 178]].map(([x, y], i) => <circle key={i} className="m-tree" cx={x} cy={y} r={11 + (i % 3) * 3} />)}
        </>)}
        {kind === "restaurant" && (<>
          <path className="m-water" d="M -300 46 C -80 70 60 34 240 56 S 560 78 760 50 S 1000 60 1200 40 L 1200 112 C 1000 124 900 106 760 118 S 420 132 240 114 S -80 132 -300 108 Z" />
          {[0, 1].map((i) => <path key={i} className="m-wave" d={`M ${120 + i * 300} ${74 + i * 10} c 26 -10 40 8 66 0 s 40 -10 66 0 s 40 8 66 0`} />)}
        </>)}
        {blocks}
        <path className="m-road" d={`M -300 300 H ${east}`} /><path className="m-road" d={`M 400 -300 V ${south}`} />
        <path className="m-lane" d={`M -300 300 H ${east}`} /><path className="m-lane" d={`M 400 -300 V ${south}`} />
        <circle className="m-plaza" cx={400} cy={300} r={66} />
        <path className="m-glow" d={WAY} /><path className="m-route" d={WAY} pathLength={1} />
        <circle className="m-from" cx={112} cy={600} r={9} />
        <circle className="m-car" r={7} style={{ offsetPath: `path("${WAY}")` }} />
      </g>
    </svg>
  );
}

/** What SiteDishBox reads when a dish is opened: the words the page already shows, as data on the element itself. */
const dishData = (m: SiteDish, cat: string) => {
  const from = m.from != null && Number(m.from) > 0 && Number(m.from) !== Number(m.price);
  return { "data-dish": "", "data-name": m.name, "data-about": m.description ?? "", "data-cat": cat, "data-veg": m.is_veg ? "1" : "0", "data-from": from ? "1" : "0",
    "data-price": formatINR(from ? Number(m.from) : Number(m.price), { whole: true }), "data-photo": https(m.image_url) ? m.image_url : "", "data-credit": m.image_credit ? credit(m.image_credit) : "", "aria-haspopup": "dialog" as const };
};
const Dish = ({ m, cat }: { m: SiteDish; cat: string }) => (
  <li>
    <button type="button" className="site-dish" {...dishData(m, cat)}>
      {https(m.image_url)
        ? <span className="site-thumb"><DishImage src={m.image_url} w={250} alt="" title={m.image_credit ?? undefined} width={58} height={58} /></span>
        : <span className="site-thumb" data-none style={hue(m.is_veg)} aria-hidden><UtensilsCrossed size={19} strokeWidth={1.6} /></span>}
      <span>
        <span className="site-dish-name"><FoodMark veg={m.is_veg} /><span className="min-w-0">{m.name}</span></span>
        {m.description && <span className="site-dish-about">{m.description}</span>}
      </span>
      <Price m={m} />
    </button>
  </li>
);

export function SiteView({ d, url, lang = "en" }: { d: SiteData; url: string; lang?: SiteLang }) {
  /* the page's own words in the visitor's language (lib/siteWords.ts); what the owner typed is never translated */
  const t = siteT(lang), pair = sitePair(lang), langs = siteLangs(d.options);
  const H = (p: { eyebrow: string; title: string; accent?: string; children?: React.ReactNode }) => { const [a, b] = pair(p.title, p.accent); return <Head eyebrow={t(p.eyebrow)} title={a} accent={b}>{p.children}</Head>; };
  const kind = coverKind(d.type, d.rooms.length > 0), { word: wordEn, Icon, close: closeEn, find, hello } = KIND[kind], word = t(wordEn), close = pair(closeEn[0], closeEn[1]) as [string, string];
  const photos = sitePhotos(d.photos), blocks = siteBlocks(d), actions = siteActions(d).map((a) => ({ ...a, label: t(a.label) })), main = actions[0] ?? null;
  const has = (k: string) => blocks.some((b) => b.key === k);
  const open = d.type === "restaurant" ? openNow(d.opens_at, d.closes_at) : null;
  const hours = d.opens_at && d.closes_at ? `${clock(d.opens_at)} – ${clock(d.closes_at)}` : null;
  const lowest = d.rooms.map((r) => Number(r.base_rate)).filter((n) => n > 0).sort((a, b) => a - b)[0] ?? null;
  const signature = has("menu") ? siteSignature(d, 8) : [];
  /* plates hang in the first screen where there is food to show and they will not sit on top of the place's own photo */
  const plates = d.type === "restaurant" || !photos[0] ? signature.slice(0, 3) : [];
  const dishes = d.menu.reduce((n, c) => n + c.items.length, 0);
  const credits = d.menu.flatMap((c) => c.items).filter((m) => https(m.image_url) && m.image_credit);
  const words = d.name.trim().split(/\s+/);
  const fs = d.name.length <= 12 ? "clamp(64px, 12.5vw, 196px)" : d.name.length <= 22 ? "clamp(52px, 9.4vw, 150px)" : "clamp(40px, 6.8vw, 104px)";
  /* the running band: what the place is known for, said large */
  const band = [...new Set([...(d.type === "restaurant" ? d.cuisines ?? [] : []), ...d.rooms.map((r) => r.name), ...d.facilities.map((f) => f.name), ...d.menu.map((c) => c.name), ...(d.type !== "restaurant" ? d.cuisines ?? [] : [])].map((s) => s.trim()).filter(Boolean))].slice(0, 12);
  const run = band.length ? Array.from({ length: Math.max(8, band.length) }, (_, i) => band[i % band.length]) : [];
  /* the crossed ribbons before the closing band: what to do, what is on, where */
  const shout = [...new Set([main?.label, ...d.offers.map((o) => o.title), open ? t("Open now") : null, d.name, d.type === "restaurant" ? hours : null, lowest ? `From ${formatINR(lowest, { whole: true })} a night` : null, d.district].filter((s): s is string => !!s))];
  const ribbon = shout.length ? Array.from({ length: Math.max(8, shout.length) }, (_, i) => shout[i % shout.length]) : [];
  /* the showcase: one signature dish at a time on a full screen (SiteShow). From three plates. Plain data only crosses
     to the client — the price is already written. */
  const stage = signature.length >= 3 && (
    <SiteShow action={d.can.order ? { href: `/dine/${d.slug}?tab=order`, label: t("Order online") } : null} dishes={signature.map((m) => {
      const from = m.from != null && Number(m.from) > 0 && Number(m.from) !== Number(m.price);
      return { name: m.name, word: siteShowWord(m.name), category: m.category, about: m.description, veg: m.is_veg, from, price: formatINR(from ? Number(m.from) : Number(m.price), { whole: true }), photo: m.image_url!, credit: m.image_credit ? credit(m.image_credit) : null };
    })} />
  );
  /* the story said large: a few two-colour lines the page can vouch for, over the place (or a dish, or nothing) */
  const saga = ((d.type === "restaurant"
    ? [d.cuisines?.[0] ? [`${d.cuisines[0]}.`, "Made fresh."] : null, hours ? [`From ${clock(d.opens_at!)}.`, `Till ${clock(d.closes_at!)}.`] : null, dishes > 1 ? [`${dishes} dishes.`, "One kitchen."] : null, [d.district ? `${d.district}.` : "Near you.", "Come hungry."]]
    : [d.rooms.length ? [`${d.rooms.length} room type${d.rooms.length === 1 ? "" : "s"}.`, lowest ? `From ${formatINR(lowest, { whole: true })}.` : "Yours tonight."] : null, d.check_in_time ? [`Check in ${clock(d.check_in_time)}.`, "Sleep in."] : null, d.facilities.length > 1 ? [`${d.facilities.length} things to do.`, "Or nothing at all."] : null, [d.district ? `${d.district}.` : "Right here.", d.type === "resort" ? "Stay longer." : "Stay a while."]]
  ).filter((l): l is string[] => !!l)).slice(0, 4);
  const sagaLines = lang === "en" ? saga : sagaIn(d, lang);
  const sagaShot = photos[1] ?? photos[0] ?? null;
  /* the closing band's photo: the place's last one, so it is not the cover again; else a dish */
  const closeShot = photos.length > 1 ? photos[photos.length - 1] : photos[0] ?? null;
  const bar = !!(main || d.phone);
  const logo = https(d.logo_url) ? d.logo_url : null;
  /* where it is, and where else it lives: the address set as lines, the pin, the map's three addresses, the links */
  const addr = siteAddress(d), pin = sitePin(d), embed = mapEmbedUrl(d), way = directionsUrl(d), onMap = placeUrl(d);
  const links = d.links ?? {}, chat = links.whatsapp ? waHref(links.whatsapp, `Hi ${d.name}! I found you on your website. ${hello}`) : null;
  const social = ([["instagram", "Instagram", Instagram], ["facebook", "Facebook", Facebook], ["youtube", "YouTube", Youtube]] as const).filter(([k]) => https(links[k]));
  const faq = lang === "en" ? siteFaq(d) : faqIn(d, lang);
  /* the extras this client switched on (websites.options): each is drawn only when it is on and has what it needs */
  const opt = d.options ?? {}, banner = siteBanner(d), rate = reviewUrl(d), counted = opt.stats === true;
  const ask = opt.enquiry === true && links.whatsapp ? { slug: d.slug, place: d.name, whatsapp: links.whatsapp, stay: d.type !== "restaurant", count: counted } : null;
  const pop = opt.offer_popup === true && d.offers[0] ? d.offers[0] : null;
  /* the look (night as built · calm · day), a film behind the first screen, Instagram posts, a dish in 3D */
  const look = siteLook(d), film = siteVideo(d), insta = siteInsta(d), model = siteModel(d);
  const sheet = look === "day" ? " site-day" : "";
  const review = rate ? <a href={rate} target="_blank" rel="noopener noreferrer" data-site-rate className="site-btn site-btn-ghost"><Star size={17} aria-hidden /> {t("Review us on Google")}<ArrowUpRight size={17} aria-hidden /></a> : null;
  const socials = (social.length > 0 || chat) ? (
    <div className="site-social" data-site-social>
      {social.map(([k, label, I]) => <a key={k} href={links[k]} target="_blank" rel="me noopener noreferrer" aria-label={`${d.name} on ${label}`} data-site-social-link={k}><I size={20} aria-hidden /></a>)}
      {chat && <a href={chat} target="_blank" rel="noopener noreferrer" aria-label={`Message ${d.name} on WhatsApp`} data-site-social-link="whatsapp"><MessageCircle size={20} aria-hidden /></a>}
    </div>
  ) : null;

  return (
    <SiteWords words={clientWords(lang)}>
    <div data-site={d.type} data-look={look} data-lang={lang} lang={lang === "en" ? "en-IN" : lang} className="site" {...(counted ? { "data-site-stats": d.slug } : {})}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(siteGraph(d, url)) }} />
      <noscript><style>{".site .site-js{display:none!important}"}</style></noscript>
      <SiteFx />
      {has("menu") && <SiteDishBox action={d.can.order ? { href: `/dine/${d.slug}?tab=order`, label: t("Order online") } : null} />}
      {/* the one or two things a guest does next are fetched as the pointer settles on them (where the browser can) — our
          own pages only: the Directions button wears the same class and must never be fetched from Google ahead of a tap */}
      {actions.length > 0 && <script type="speculationrules" dangerouslySetInnerHTML={{ __html: JSON.stringify({ prefetch: [{ where: { and: [{ selector_matches: ".site a.site-btn-main" }, { href_matches: "/*" }] }, eagerness: "moderate" }] }) }} />}
      <div className="site-progress" aria-hidden />
      <div className="site-curtain" aria-hidden data-site-curtain><span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {logo && <img src={logo} alt="" width={76} height={76} />}<b>{d.name}</b></span></div>

      {/* ── the floating menu: the place's mark, the sections, the one thing to do ── */}
      <nav aria-label={t("Sections")} className="site-nav" data-site-nav>
        <a href="#top" className="site-brand" data-site-brand aria-label={d.name}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logo ? <img src={logo} alt="" width={32} height={32} /> : <i aria-hidden>{d.name.trim().charAt(0).toUpperCase()}</i>}
          <span>{d.name}</span>
        </a>
        <div className="site-nav-rail">{blocks.length > 1 && <div className="site-nav-links">{blocks.map((b) => <a key={b.key} href={`#${b.id}`}>{t(b.label)}</a>)}</div>}</div>
        {langs.length > 1 && (
          <div className="site-langs" role="group" aria-label="Language" data-site-langs translate="no">
            {langs.map((l) => <a key={l} href={l === "en" ? "?" : `?lang=${l}`} hrefLang={l} lang={l} aria-current={l === lang ? "true" : undefined} title={SITE_LANG_NAME[l]}>{l === "en" ? "EN" : l === "ta" ? "த" : "हि"}</a>)}
          </div>
        )}
        {main ? <a href={main.href} className="site-btn site-btn-main site-btn-sm site-nav-cta">{main.label}<ArrowRight size={16} aria-hidden /></a>
          : d.phone ? <a href={telHref(d.phone)} className="site-btn site-btn-main site-btn-sm site-nav-cta"><Phone size={15} aria-hidden /> {t("Call")}</a> : null}
      </nav>

      {/* ── the first screen ── */}
      <header id="top" className="site-hero" data-site-hero={kind}>
        <div className="site-hero-bg"><StoreCover kind={kind} photo={photos[0]} />
          {film && <video className="site-hero-video" data-site-video data-src={film} muted loop playsInline preload="none" aria-hidden tabIndex={-1} />}
        </div>
        <div className="site-hero-shade" />
        {banner && <p className="site-banner" role="note" data-site-banner><i aria-hidden><Megaphone size={15} /></i><span>{banner}</span></p>}
        {plates.length > 0 && (
          <div className="site-float" data-site-plates aria-hidden>
            <span className="site-orbit" /><span className="site-orbit" />
            {plates.map((m, i) => (
              <figure key={`${m.name}-${i}`} className="site-plate">
                <DishImage src={m.image_url!} w={i === 0 ? 500 : 330} alt="" loading={i === 0 ? "eager" : "lazy"} />
                {i === 0 && <span className="site-steam">{[-34, 0, 30].map((x, k) => <i key={k} style={{ ["--x" as string]: x, ["--i" as string]: k } as React.CSSProperties} />)}</span>}
                <figcaption><span>{m.name}</span><b>{formatINR(m.from != null && Number(m.from) > 0 ? Math.min(Number(m.from), Number(m.price)) : Number(m.price), { whole: true })}</b></figcaption>
              </figure>
            ))}
          </div>
        )}
        <div className="site-wrap site-hero-copy">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logo && <span className="site-crest site-in" style={step(0)} data-site-crest><img src={logo} alt={`${d.name} logo`} width={76} height={76} /></span>}
          <p className="site-kicker site-in" style={step(0)} data-site-kind><Icon size={15} aria-hidden /> {word}{d.district ? ` · ${d.district}` : ""}</p>
          <h1 className="site-title" style={{ ["--fs" as string]: fs } as React.CSSProperties}>
            {words.map((w, i) => <span key={i}><span className="site-word"><span style={step(i)}>{w}</span></span>{i < words.length - 1 ? " " : ""}</span>)}
          </h1>
          {(d.headline || d.tagline) && <p className="site-lede site-in line-clamp-3" style={step(1)} data-site-headline>{d.headline || d.tagline}</p>}
          <div className="mt-5 flex flex-wrap gap-2 site-in" style={step(2)} data-site-facts>
            {d.rating && d.rating_count ? <span className="site-chip"><Star size={13} fill="currentColor" className="text-[var(--site-accent)]" aria-hidden /><span className="num">{d.rating}</span><i className="num">({d.rating_count})</i></span> : null}
            {open !== null && hours ? <span className="site-chip"><span className="site-live" data-open={open ? "1" : "0"} aria-hidden />{open ? t("Open now") : t("Closed now")}<i className="num">· {hours}</i></span> : null}
            {d.type === "restaurant" && d.cuisines?.length ? <span className="site-chip"><span className="truncate">{d.cuisines.join(" · ")}</span></span> : null}
            {d.type === "restaurant" && d.price_for_two ? <span className="site-chip"><span className="num">{formatINR(d.price_for_two, { whole: true })}</span>&nbsp;{t("for two")}</span> : null}
            {d.type !== "restaurant" && lowest ? <span className="site-chip">{t("From")}&nbsp;<span className="num">{formatINR(lowest, { whole: true })}</span>&nbsp;{t("a night")}</span> : null}
          </div>
          {(actions.length > 0 || d.phone) && (
            <div className="mt-7 hidden md:flex flex-wrap gap-3 site-in" style={step(3)} data-site-actions>
              {actions.slice(0, 3).map((a, i) => <a key={a.key} href={a.href} data-site-action={a.key} className={`site-btn ${i === 0 ? "site-btn-main" : "site-btn-ghost"}`}>{a.label}{i === 0 && <ArrowRight size={18} aria-hidden />}</a>)}
              {d.phone && <a href={telHref(d.phone)} data-site-call className="site-btn site-btn-ghost"><Phone size={17} aria-hidden /> {t("Call")}</a>}
            </div>
          )}
        </div>
        {main && (
          <a href={main.href} className="site-badge" aria-label={main.label} data-site-badge>
            <Ring id="site-ring-a" text={`${main.label} · ${open ? t("Open now") : word} · ${main.label} · ${d.district ?? t("Welcome")} · `} />
            <i><ArrowUpRight size={24} aria-hidden /></i>
          </a>
        )}
        {blocks[0] && <a href={`#${blocks[0].id}`} className="site-scroll site-in" style={step(5)} aria-label={`Go to ${blocks[0].label}`}>{t("Scroll")}</a>}
      </header>

      {run.length > 0 && (
        <div className="site-marquee" aria-hidden data-site-marquee>
          <div className="site-marquee-track" style={{ ["--dur" as string]: `${Math.max(36, run.length * 5)}s` } as React.CSSProperties}>
            {[0, 1].map((k) => <ul key={k}>{run.map((w, i) => <li key={i}>{w}<Sparkles size={22} /></li>)}</ul>)}
          </div>
        </div>
      )}

      {d.type === "restaurant" && stage}

      <main>
        {has("about") && (
          <section id="about" data-site-block="about" className="site-section site-day">
            <div className="site-wrap">
              <H eyebrow={`${word}${d.district ? ` · ${d.district}` : ""}`} title="Our" accent="story" />
              <div className="site-about">
                <p className="site-story" data-site-about><span>{d.about || d.tagline}</span></p>
                <div className="site-bento" data-site-glance>
                  {d.rating && d.rating_count ? <div className="site-tile site-stat" data-glow data-rv style={step(0)}><Stars n={Number(d.rating)} /><b>{d.rating}</b><small><span className="num">{d.rating_count}</span> {lang === "en" ? `guest review${d.rating_count === 1 ? "" : "s"}` : t("guest reviews")}</small></div> : null}
                  {d.type === "restaurant" && d.price_for_two ? <div className="site-tile site-stat" data-glow data-rv style={step(1)}><span className="site-icon"><Users size={20} aria-hidden /></span><Count n={Number(d.price_for_two)} money /><small>{t("for two, about")}</small></div> : null}
                  {d.type === "restaurant" && dishes > 0 ? <div className="site-tile site-stat" data-glow data-rv style={step(2)}><span className="site-icon"><UtensilsCrossed size={20} aria-hidden /></span><Count n={dishes} /><small>{lang === "en" ? `dish${dishes === 1 ? "" : "es"} on the menu` : t("dishes on the menu")}</small></div> : null}
                  {d.type !== "restaurant" && lowest ? <div className="site-tile site-stat" data-glow data-rv style={step(1)}><span className="site-icon"><BedDouble size={20} aria-hidden /></span><Count n={lowest} money /><small>{t("a night, from")}</small></div> : null}
                  {d.type !== "restaurant" && d.rooms.length ? <div className="site-tile site-stat" data-glow data-rv style={step(2)}><span className="site-icon"><KeyRound size={20} aria-hidden /></span><Count n={d.rooms.length} /><small>{lang === "en" ? `room type${d.rooms.length === 1 ? "" : "s"}` : t("room types")}</small></div> : null}
                  {d.type === "restaurant" && hours ? <div className="site-tile site-stat" data-wide data-glow data-rv style={step(3)}><span className="site-icon"><Clock size={20} aria-hidden /></span><span className="min-w-0 flex-1 text-[15.5px]">{t("Open daily ·")} <span className="num font-semibold">{hours}</span></span>{open !== null && <span className="site-chip shrink-0"><span className="site-live" data-open={open ? "1" : "0"} aria-hidden />{open ? t("Open now") : t("Closed now")}</span>}</div> : null}
                  {d.type !== "restaurant" && d.check_in_time && d.check_out_time ? <div className="site-tile site-stat" data-wide data-glow data-rv style={step(3)}><span className="site-icon"><Clock size={20} aria-hidden /></span><span className="min-w-0 flex-1 text-[15.5px]">{t("Check-in")} <span className="num font-semibold">{clock(d.check_in_time)}</span> {t("· Check-out")} <span className="num font-semibold">{clock(d.check_out_time)}</span></span></div> : null}
                  {d.type === "restaurant" && d.cuisines?.length ? <div className="site-tile site-stat" data-wide data-glow data-rv style={step(4)}><span className="site-icon"><Sparkles size={20} aria-hidden /></span><span className="min-w-0 flex-1 text-[15.5px]">{d.cuisines.join(", ")}</span></div> : null}
                  {d.address ? <div className="site-tile site-stat" data-wide data-glow data-rv style={step(5)}><span className="site-icon"><MapPin size={20} aria-hidden /></span><span className="min-w-0 flex-1 text-[15.5px] [overflow-wrap:anywhere]">{d.address}</span></div> : null}
                </div>
              </div>
            </div>
          </section>
        )}

        {sagaLines.length >= 2 && (
          <div className="site-saga" data-site-saga style={{ ["--n" as string]: sagaLines.length } as React.CSSProperties}>
            <div className="site-saga-pin">
              <div className="site-saga-bg" aria-hidden>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {sagaShot ? <img src={sagaShot} alt="" loading="lazy" decoding="async" /> : signature[1] ? <DishImage src={signature[1].image_url!} w={1280} alt="" /> : null}
              </div>
              <div className="site-wrap site-saga-lines">
                {sagaLines.map((l, i) => <p key={i} style={step(i)}><small aria-hidden>{String(i + 1).padStart(2, "0")} / {String(sagaLines.length).padStart(2, "0")}</small>{l[0]} <em>{l[1]}</em></p>)}
              </div>
              <span className="site-saga-count" aria-hidden />
            </div>
          </div>
        )}

        {has("rooms") && (
          <section id="rooms" data-site-block="rooms" className={`site-section${sheet}`}>
            <div className="site-wrap">
              <H eyebrow="Stay with us" title="Rooms &" accent="rates">
                {d.can.book && <a href={`/book/${d.slug}`} className="site-btn site-btn-ghost" data-rv>{t("Check dates")}<ArrowUpRight size={18} aria-hidden /></a>}
              </H>
              <div className="site-grid-3">
                {d.rooms.map((r, i) => {
                  /* a room's own photos first (ninth pass); else the place's other photos in turn, as before */
                  const own = roomPhotos(r), shot = own[0] ?? (photos.length > 1 ? photos[1 + (i % (photos.length - 1))] : null);
                  return (
                    <article key={`${r.name}-${i}`} className="site-tile site-room" data-glow data-rv style={step(i % 3)} data-site-room
                      data-room="" data-name={r.name} data-rate={formatINR(Number(r.base_rate), { whole: true })} data-sleeps={String(r.capacity)} data-amenities={(r.amenities ?? []).slice(0, 12).join("|")} data-photos={JSON.stringify(own)}
                      tabIndex={0} role="button" aria-haspopup="dialog">
                      <div className="site-room-art">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {shot ? <img src={shot} alt="" loading="lazy" decoding="async" /> : <><BedDouble size={72} strokeWidth={1} aria-hidden /><b aria-hidden>{String(i + 1).padStart(2, "0")}</b></>}
                        <span className="site-chip"><Users size={13} aria-hidden /> <span className="num">{r.capacity}</span></span>
                      </div>
                      <div className="site-room-body">
                        <h3 className="site-h3 text-[26px]">{r.name}</h3>
                        {r.amenities?.length ? <ul className="site-tags">{r.amenities.slice(0, 6).map((a) => <li key={a}>{a}</li>)}</ul> : null}
                        <div className="mt-auto pt-2 flex items-end justify-between gap-3">
                          <div><span className="site-rate">{formatINR(Number(r.base_rate), { whole: true })}</span><span className="block mt-1.5 site-note">{t("per night, plus taxes")}</span></div>
                          {d.can.book && <a href={`/book/${d.slug}`} className="site-btn site-btn-main site-btn-sm shrink-0">{t("Book")}<ArrowRight size={16} aria-hidden /></a>}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {has("facilities") && (
          <section id="facilities" data-site-block="facilities" className={`site-section${sheet}`}>
            <div className="site-wrap">
              <H eyebrow="Things to do" title="The" accent="experience" />
              <div className="site-fac">
                {d.facilities.map((f, i) => (
                  <article key={`${f.name}-${i}`} className="site-tile" data-glow data-rv style={step(i % 4)} data-site-facility>
                    <span className="site-icon"><Sparkles size={20} aria-hidden /></span>
                    <h3 className="site-h3 text-[22px] mt-auto">{f.name}</h3>
                    <p className="text-[13px] text-[var(--color-label-2)] capitalize">{f.kind}{f.minutes ? <> · <span className="num">{f.minutes}</span> {t("min")}</> : null}</p>
                    <p className="site-price">{Number(f.rate) > 0 ? formatINR(Number(f.rate), { whole: true }) : t("Included")}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>
        )}

        {d.type !== "restaurant" && stage}

        {has("menu") && (
          <section id="menu" data-site-block="menu" className="site-section site-day">
            {signature.length >= 3 && (
              <div data-site-band="signature" className="site-pin mb-[clamp(48px,7vw,104px)]" style={{ ["--n" as string]: signature.length } as React.CSSProperties}>
               <div>
                <div className="site-wrap">
                  <H eyebrow="From the kitchen" title="Signature" accent="plates">
                    <p className="site-note max-w-[30ch]" data-rv>{t("What the kitchen is proud of — keep going.")}</p>
                  </H>
                </div>
                <ul className="site-rail" data-site-rail>
                  {signature.map((m, i) => (
                    <li key={`${m.name}-${i}`} className="site-sig" data-glow="tilt" data-rv="zoom" style={step(i % 5)} data-site-signature {...dishData(m, m.category)} tabIndex={0} role="button">
                      <DishImage src={m.image_url!} w={500} alt={m.name} />
                      {m.image_credit && <span className="site-sig-credit" data-photo-credit>Illustrative · {credit(m.image_credit)}</span>}
                      <span className="site-sig-no" aria-hidden>{String(i + 1).padStart(2, "0")}</span>
                      <div className="site-sig-body">
                        <p className="text-[11.5px] font-bold uppercase tracking-[.2em] text-white/70">{m.category}</p>
                        <h3 className="site-h3">{m.name}</h3>
                        <div className="flex items-center justify-between gap-3"><span className="inline-flex items-center gap-2 text-[12.5px] font-semibold text-white/80"><FoodMark veg={m.is_veg} />{t(m.is_veg ? "Veg" : "Non-veg")}</span><Price m={m} /></div>
                      </div>
                    </li>
                  ))}
                </ul>
               </div>
              </div>
            )}
            <div className="site-wrap">
              <H eyebrow={d.type === "restaurant" ? "What we cook" : "Dining"} title="The" accent="menu">
                <div className="flex flex-wrap gap-2.5" data-rv>
                  {model && <SiteModel url={model.url} name={model.name} />}
                  {d.can.order && <a href={`/dine/${d.slug}?tab=order`} className="site-btn site-btn-main">{t("Order online")}<ArrowRight size={18} aria-hidden /></a>}
                </div>
              </H>
              {d.menu.length > 2 && <div className="site-cats" data-site-cats>{d.menu.map((c, i) => <a key={`${c.name}-${i}`} href={`#menu-${i + 1}`}>{c.name}<i className="num">{c.items.length}</i></a>)}</div>}
              <div className="site-menu">
                {d.menu.map((c, i) => (
                  <article key={`${c.name}-${i}`} id={`menu-${i + 1}`} className="site-tile site-cat" data-glow data-rv data-site-category>
                    <header><h3 className="site-h3">{c.name}</h3><span>{String(c.items.length).padStart(2, "0")}</span></header>
                    <ul>{c.items.slice(0, 6).map((m, j) => <Dish key={`${m.name}-${j}`} m={m} cat={c.name} />)}</ul>
                    {c.items.length > 6 && (
                      <details className="site-more">
                        <summary><span className="site-more-closed">{t("Show")} {c.items.length - 6} {t("more")}</span><span className="site-more-open">{t("Show less")}</span></summary>
                        <ul>{c.items.slice(6).map((m, j) => <Dish key={`${m.name}-${j}`} m={m} cat={c.name} />)}</ul>
                      </details>
                    )}
                  </article>
                ))}
              </div>
              <p className="mt-2 site-note">{t("Prices are today's, before taxes.")}</p>
              {credits.length > 0 && (
                <details className="site-more mt-1" data-site-credits>
                  <summary className="!text-[var(--color-label-3)] !font-semibold !text-[13px]">{t("Some photos are illustrative — photo credits")}</summary>
                  <ul className="site-note grid gap-1 pb-2">{credits.map((m, i) => <li key={`${m.name}-${i}`}>{m.name} — {credit(m.image_credit!)}</li>)}</ul>
                </details>
              )}
            </div>
          </section>
        )}

        {has("offers") && (
          <section id="offers" data-site-block="offers" className={`site-section${sheet}`}>
            <div className="site-wrap">
              <H eyebrow="Running now" title="Today's" accent="offers" />
              {d.offers.slice(0, 1).map((o) => (
                <article key={o.title} className="site-promo" data-rv="zoom" data-site-offer data-site-promo>
                  <div className="site-aurora" aria-hidden />
                  {signature[0] && <span className="site-promo-dish" aria-hidden><DishImage src={signature[0].image_url!} w={500} alt="" /></span>}
                  <span className="site-sticker" aria-hidden><Ring id="site-ring-b" text="Running now · Offer · Running now · Offer · " /><Ticket size={28} strokeWidth={1.6} /></span>
                  <p className="site-eyebrow">{t("Offer of the day")}</p>
                  <h3 className="site-promo-title">{o.title}</h3>
                  <p className="mt-4 text-[15.5px] text-[var(--color-label-2)]">{Number(o.min_order) > 0 ? <>{t("On orders above")} <span className="num">{formatINR(Number(o.min_order), { whole: true })}</span></> : t("On every order")}</p>
                  <div className="mt-6 flex flex-wrap items-center gap-3">
                    {o.code ? <span className="site-code !mt-0 !h-11 !px-4 !text-[17px]" aria-label={`Code ${o.code}`}>{o.code}</span> : null}
                    {main && <a href={main.href} className="site-btn site-btn-main">{main.label}<ArrowRight size={18} aria-hidden /></a>}
                  </div>
                </article>
              ))}
              <div className="site-grid-3">
                {d.offers.slice(1).map((o, i) => (
                  <article key={`${o.title}-${i}`} className="site-ticket" data-rv style={step(i % 3)} data-site-offer>
                    <div className="site-ticket-stub"><Ticket size={30} strokeWidth={1.5} aria-hidden /></div>
                    <div className="site-ticket-body">
                      <h3 className="site-h3 text-[24px]">{o.title}</h3>
                      <p className="mt-2 text-[13.5px] text-[var(--color-label-2)]">{Number(o.min_order) > 0 ? <>{t("On orders above")} <span className="num">{formatINR(Number(o.min_order), { whole: true })}</span></> : t("On every order")}</p>
                      {o.code ? <span className="site-code" aria-label={`Code ${o.code}`}>{o.code}</span> : null}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        )}

        {has("gallery") && (
          <section id="gallery" data-site-block="gallery" className={`site-section${sheet}`}>
            <div className="site-wrap">
              <H eyebrow="A look around" title="The" accent="gallery" />
              <div className="site-mosaic">
                {photos.map((p, i) => (
                  <figure key={p} data-rv="wipe" style={step(i % 4)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p} alt={`${d.name} — photo ${i + 1}`} loading="lazy" decoding="async" data-site-photo />
                  </figure>
                ))}
              </div>
            </div>
          </section>
        )}

        {insta.length > 0 && (
          <section id="instagram" data-site-instagram className={`site-section${sheet}`}>
            <div className="site-wrap">
              <H eyebrow="Follow along" title="On" accent="Instagram">
                {https(links.instagram) && <a href={links.instagram} target="_blank" rel="me noopener noreferrer" className="site-btn site-btn-ghost" data-rv><Instagram size={18} aria-hidden /> {t("Follow us")}<ArrowUpRight size={17} aria-hidden /></a>}
              </H>
              <div className="site-instas">{insta.map((p, i) => <SiteInsta key={p.href} href={p.href} embed={p.embed} place={d.name} n={i + 1} />)}</div>
            </div>
          </section>
        )}

        {has("reviews") && (
          <section id="reviews" data-site-block="reviews" className="site-section site-day">
            <div className="site-wrap">
              <H eyebrow="From our guests" title="Kind" accent="words">
                {d.rating && d.rating_count ? <div className="site-score" data-rv><b>{d.rating}</b><div className="pb-1.5"><Stars n={Number(d.rating)} size={18} /><p className="mt-1.5 site-note"><span className="num">{d.rating_count}</span> review{d.rating_count === 1 ? "" : "s"}</p></div></div> : null}
              </H>
              <div className="site-quotes" {...(d.reviews.length >= 3 && d.reviews.length <= 6 ? { "data-fan": "" } : {})} style={{ ["--n" as string]: d.reviews.length } as React.CSSProperties}>
                {d.reviews.map((v, i) => (
                  <article key={i} className="site-tile site-quote" data-glow data-rv style={{ ...step(i % 3), ["--k" as string]: i } as React.CSSProperties} data-site-review>
                    <div className="flex items-center justify-between gap-3"><Stars n={v.rating} /><Quote size={26} className="text-[var(--site-accent)] opacity-50" aria-hidden /></div>
                    {v.body && <blockquote className="line-clamp-[8]">{v.body}</blockquote>}
                    <footer><i aria-hidden>{(v.guest || "G").trim().charAt(0).toUpperCase()}</i>{v.guest || "A guest"}</footer>
                    {v.reply && <p className="site-reply line-clamp-4"><span className="font-bold text-[var(--color-label)]">{d.name}:</span> {v.reply}</p>}
                  </article>
                ))}
                {d.rating && d.rating_count ? <p className="site-fan-score" aria-hidden>{d.rating}<small>from {d.rating_count} reviews</small></p> : null}
              </div>
              {review && <div className="mt-8 flex justify-center" data-rv>{review}</div>}
            </div>
          </section>
        )}

        {faq.length >= 3 && (
          <section id="faq" data-site-faq className="site-section site-day">
            <div className="site-wrap">
              <H eyebrow="Good to know" title="Questions," accent="answered" />
              <div className="site-faq">
                {faq.map((f, i) => (
                  <details key={f.q} className="site-qa" data-rv style={step(i % 4)} {...(i === 0 ? { open: true } : {})}>
                    <summary><span>{f.q}</span><i aria-hidden /></summary>
                    <p>{f.a}</p>
                  </details>
                ))}
              </div>
            </div>
          </section>
        )}

        {ribbon.length > 0 && (
          <div className="site-ribbons" aria-hidden data-site-ribbons>
            {[0, 1].map((r) => (
              <div key={r} className="site-ribbon">
                <div style={{ ["--dur" as string]: `${Math.max(26, ribbon.length * 4) + r * 6}s` } as React.CSSProperties}>
                  {[0, 1].map((k) => <ul key={k}>{ribbon.map((w, i) => <li key={i}>{w}<Sparkles size={20} /></li>)}</ul>)}
                </div>
              </div>
            ))}
          </div>
        )}

        {has("contact") && (
          <section id="contact" data-site-block="contact" className={`site-section site-loc${sheet}`} data-site-loc={kind}>
            <div className="site-wrap">
              <H eyebrow="Where we are" title={find[0]} accent={find[1]}>
                {pin && <p className="site-loc-geo num" data-rv data-site-geo><LocateFixed size={15} aria-hidden /> {pinLabel(pin)}</p>}
              </H>
              {/* a place with neither an address nor a pin gets no map — a drawing of nowhere says nothing */}
              <div className="site-loc-grid" {...(embed ? {} : { "data-solo": "" })}>
                {embed && <SiteMap embed={embed} place={onMap} directions={way} name={d.name}>
                  <div className="site-map-plane"><MapArt kind={kind} /></div>
                  <div className="site-map-pin" data-site-pin>
                    <span className="site-map-ring" /><span className="site-map-ring" /><span className="site-map-ring" />
                    <span className="site-map-drop"><Mark logo={logo} name={d.name} /></span>
                    <b className="site-map-name"><span>{d.name}</span></b>
                  </div>
                  {(d.district || d.pincode) && <span className="site-chip site-map-tag"><MapPin size={13} aria-hidden /><span className="truncate">{[d.district, d.pincode].filter(Boolean).join(" · ")}</span></span>}
                  <span className="site-map-compass"><span>N</span><i /></span>
                  <span className="site-map-scale">{t("Drawn, not to scale")}</span>
                </SiteMap>}
                <div className="site-loc-card" data-rv style={step(1)}>
                  <div className="site-loc-who"><Mark logo={logo} name={d.name} /><div className="min-w-0"><b>{d.name}</b><small>{word}{d.district ? ` · ${d.district}` : ""}</small></div></div>
                  {addr && <address className="site-loc-addr" data-site-address><b>{addr.head}</b>{addr.rest && <span>{addr.rest}</span>}</address>}
                  <div className="site-loc-rows" data-site-contact>
                    {way && (
                      <a href={way} target="_blank" rel="noreferrer" className="site-row">
                        <span className="site-icon !flex-none"><Navigation size={20} aria-hidden /></span><span>{t("From where you are")}</span><em>{t("Directions")}</em>
                      </a>
                    )}
                    {d.phone && (
                      <a href={telHref(d.phone)} className="site-row">
                        <span className="site-icon !flex-none"><Phone size={20} aria-hidden /></span><span className="num text-[19px] font-semibold whitespace-nowrap">{d.phone}</span><em>{t("Call")}</em>
                      </a>
                    )}
                    {chat && (
                      <a href={chat} target="_blank" rel="noopener noreferrer" className="site-row" data-site-whatsapp>
                        <span className="site-icon !flex-none"><MessageCircle size={20} aria-hidden /></span><span>WhatsApp</span><em>{t("Chat")}</em>
                      </a>
                    )}
                    {d.email && (
                      <a href={`mailto:${d.email}`} className="site-row" data-site-email>
                        <span className="site-icon !flex-none"><Mail size={20} aria-hidden /></span><span>{d.email}</span><em>{t("Write")}</em>
                      </a>
                    )}
                    {d.type === "restaurant" && hours ? (
                      <div className="site-row">
                        <span className="site-icon !flex-none"><Clock size={20} aria-hidden /></span><span>{t("Open daily ·")} <span className="num font-semibold">{hours}</span></span>
                        {open !== null && <em className={open ? "!text-[var(--color-green)]" : "!text-[var(--color-red)]"}>{open ? t("Open now") : t("Closed now")}</em>}
                      </div>
                    ) : null}
                    {d.type !== "restaurant" && d.check_in_time && d.check_out_time ? (
                      <div className="site-row">
                        <span className="site-icon !flex-none"><Clock size={20} aria-hidden /></span><span>{t("Check-in")} <span className="num font-semibold">{clock(d.check_in_time)}</span> {t("· Check-out")} <span className="num font-semibold">{clock(d.check_out_time)}</span></span>
                      </div>
                    ) : null}
                  </div>
                  <div className="site-loc-tools">
                    {addr && <SiteCopy text={`${d.name}, ${addr.full}`} label="Copy address" />}
                    {ask && <SiteAsk {...ask} />}
                    <SiteShare title={d.name} text={d.headline || d.tagline || `${d.name}${d.district ? ` · ${d.district}` : ""}`} url={url} />
                    {socials}
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {has("contact") && (
          <section className="site-section site-close" data-rv="zoom" data-site-closing aria-label={`${close[0]} ${close[1]}`}>
            {(closeShot || signature[2]) && (
              <div className="site-close-bg" aria-hidden data-site-close-bg>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {closeShot ? <img src={closeShot} alt="" loading="lazy" decoding="async" /> : <DishImage src={signature[2].image_url!} w={1280} alt="" />}
              </div>
            )}
            <div className="site-aurora" aria-hidden />
            <div className="site-wrap">
              <p className="site-eyebrow">{t("See you soon")}</p>
              <h2 className="site-h2 !text-[clamp(48px,9vw,148px)]">{close[0]} <em>{close[1]}</em></h2>
              {(actions.length > 0 || d.phone || chat || rate) && (
                <div className="site-close-acts mt-[clamp(28px,4vw,56px)]" data-site-contact-actions>
                  {actions.map((a, i) => <a key={a.key} href={a.href} className={`site-btn site-btn-wide ${i === 0 ? "site-btn-main" : "site-btn-ghost"}`}>{a.label}<ArrowRight size={20} aria-hidden /></a>)}
                  {d.phone && <a href={telHref(d.phone)} className="site-btn site-btn-wide site-btn-ghost">{t("Call us")}<Phone size={20} aria-hidden /></a>}
                  {chat && <a href={chat} target="_blank" rel="noopener noreferrer" className="site-btn site-btn-wide site-btn-ghost">WhatsApp<MessageCircle size={20} aria-hidden /></a>}
                  {ask && <SiteAsk {...ask} wide />}
                  {rate && !has("reviews") && <a href={rate} target="_blank" rel="noopener noreferrer" data-site-rate className="site-btn site-btn-wide site-btn-ghost">{t("Review us on Google")}<Star size={20} aria-hidden /></a>}
                </div>
              )}
            </div>
          </section>
        )}
      </main>

      <footer className="site-foot" data-site-footer>
        <span className="site-wordmark" aria-hidden>{d.name}</span>
        <div className={`relative border-t border-[var(--color-separator)] bg-[var(--color-bg)] ${bar ? "pb-[calc(78px+env(safe-area-inset-bottom))] md:pb-0" : ""}`}>
          <div className="site-wrap site-foot-top" data-site-foot-top>
            <div className="site-foot-brand"><Mark logo={logo} name={d.name} /><div className="min-w-0"><b>{d.name}</b><small>{word}{d.district ? ` · ${d.district}` : ""}</small></div></div>
            {addr ? <address className="site-foot-addr">{addr.full}{way && <><br /><a href={way} target="_blank" rel="noreferrer">{t("Directions")}<ArrowUpRight size={15} aria-hidden /></a></>}</address> : <span />}
            {socials}
          </div>
          <div className="site-wrap py-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[13px] text-[var(--color-label-2)]">
            <p className="min-w-0"><span className="font-semibold text-[var(--color-label)]">{d.name}</span>{d.district ? ` · ${d.district}` : ""}{d.fssai_no && d.menu.length > 0 ? <span className="num" data-site-fssai> · FSSAI Lic. No. {d.fssai_no}</span> : null}{d.demo ? <span className="ml-2 h-6 px-2 rounded-full inline-flex items-center text-[11px] font-bold uppercase tracking-wide bg-[var(--color-orange-2)] text-[var(--color-orange)]" data-site-demo>Demo</span> : null}</p>
            <p className="flex items-center gap-4"><Link href={`/legal/privacy?from=${encodeURIComponent(`/site/${d.slug}`)}`} prefetch={false} className="underline inline-flex items-center justify-center min-h-11 min-w-11">{t("Privacy")}</Link><Link href="/" prefetch={false} className="inline-flex items-center min-h-11">{t("Website by")} <span className="ml-1 font-semibold text-[var(--color-label)]">DineFlow</span></Link></p>
          </div>
        </div>
      </footer>

      {has("rooms") && <SiteRoomBox book={d.can.book ? `/book/${d.slug}` : null} />}
      {pop && <SiteOffer slug={d.slug} title={pop.title} note={Number(pop.min_order) > 0 ? `${t("On orders above")} ${formatINR(Number(pop.min_order), { whole: true })}` : t("On every order")} code={pop.code} action={main ? { href: main.href, label: main.label } : null} />}

      {/* ── a phone keeps the one thing to do under the thumb ── */}
      {bar && (
        <div className="site-bar" data-site-bar>
          {main && <a href={main.href} data-site-action={main.key} className="site-btn site-btn-main flex-1 !min-w-0 !rounded-[20px]">{main.label}<ArrowRight size={18} aria-hidden /></a>}
          {d.phone && <a href={telHref(d.phone)} aria-label={`Call ${d.name}`} className={`site-btn site-btn-ghost !rounded-[20px] ${main ? "!px-5 shrink-0" : "flex-1"}`}><Phone size={18} aria-hidden />{main ? null : " Call"}</a>}
        </div>
      )}
    </div>
    </SiteWords>
  );
}
