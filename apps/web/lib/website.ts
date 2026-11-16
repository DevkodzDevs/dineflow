/**
 * A property's public website, /site/<slug> (0185). What `website_public` answers, and the small pure pieces the page is
 * drawn with — kept here so they can be tested without a browser (lib/website.test.ts).
 */
import { type WebsiteSectionKey, type WebsiteLinks, type WebsiteOptions, isReviewUrl, isSiteFile, instaEmbed } from "@dineflow/shared";

export type SiteDish = { name: string; price: number; is_veg: boolean; description: string | null; image_url: string | null; image_credit: string | null; from: number | null };
export type SiteData = {
  slug: string; name: string; type: "restaurant" | "hotel" | "resort"; demo: boolean;
  tagline: string | null; headline: string | null; about: string | null; logo_url: string | null;
  cuisines: string[] | null; price_for_two: number | null; rating: number | null; rating_count: number | null;
  address: string | null; district: string | null; phone: string | null; photos: string[] | null;
  opens_at: string | null; closes_at: string | null; check_in_time: string | null; check_out_time: string | null;
  /** for search and the map (0185): the pincode, the pin, the food licence, a public email, the social links */
  pincode: string | null; lat: number | null; lng: number | null; fssai_no: string | null; email: string | null; links: WebsiteLinks | null;
  /** the extras this client switched on (eighth pass); absent or {} = none */
  options?: WebsiteOptions | null;
  sections: string[]; updated_at: string;
  can: { order: boolean; reserve: boolean; queue: boolean; book: boolean };
  menu: { name: string; items: SiteDish[] }[];
  rooms: { name: string; base_rate: number; capacity: number; amenities: string[] | null; photos?: string[] | null }[];
  /** the client's own web address, when it has one (ninth pass) */
  domain?: string | null;
  facilities: { name: string; kind: string; rate: number; minutes: number }[];
  offers: { title: string; kind: string; value: number; min_order: number; code: string | null }[];
  reviews: { guest: string | null; rating: number; body: string | null; reply: string | null; at: string }[];
};

const mins = (t: string) => { const [h, m] = t.split(":").map(Number); return (h || 0) * 60 + (m || 0); };
/** Minutes past midnight in India, whatever clock the server keeps. */
export const istMinutes = (at: Date = new Date()) => { const d = new Date(at.getTime() + 5.5 * 3600e3); return d.getUTCHours() * 60 + d.getUTCMinutes(); };

/** Is the place open at `at`? Hours that run past midnight (18:00–02:00) are open on both sides of it. */
export function openNow(opens: string | null | undefined, closes: string | null | undefined, at: Date = new Date()): boolean | null {
  if (!opens || !closes) return null;
  const o = mins(opens), c = mins(closes), n = istMinutes(at);
  if (o === c) return true;                       // the same time twice: open all day
  return o < c ? n >= o && n < c : n >= o || n < c;
}

/** "11:00:00" → "11 am", "23:30" → "11:30 pm" — the way a door sign says it. */
export function clock(t: string | null | undefined): string {
  if (!t) return "";
  const m = mins(t), h = Math.floor(m / 60) % 24, mm = m % 60, h12 = h % 12 || 12;
  return `${h12}${mm ? `:${String(mm).padStart(2, "0")}` : ""} ${h < 12 ? "am" : "pm"}`;
}

export const mapsUrl = (name: string, address: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name}, ${address}`)}`;
/** A tel: link keeps digits and a leading +; anything else in a typed number is dropped. */
export const telHref = (phone: string) => `tel:${phone.replace(/(?!^\+)[^\d]/g, "")}`;

/** Photos the page will show: https only (a typed address can be anything), each once, at most `max`. */
export const sitePhotos = (photos: string[] | null | undefined, max = 12): string[] =>
  [...new Set((photos ?? []).map((p) => p.trim()).filter((p) => /^https:\/\/[^\s"'<>]+$/i.test(p)))].slice(0, max);

/**
 * The blocks the page actually draws, in order: a ticked section with nothing in it is left out rather than shown empty
 * (a menu whose dishes were all removed after the website was made). Order, table booking, the queue and room booking are
 * buttons, not blocks — `can` says which of them answer today.
 */
export function siteBlocks(d: SiteData): { key: WebsiteSectionKey; id: string; label: string }[] {
  const has: Partial<Record<WebsiteSectionKey, boolean>> = {
    about: !!(d.about || d.tagline), menu: d.menu.length > 0, rooms: d.rooms.length > 0, facilities: d.facilities.length > 0,
    offers: d.offers.length > 0, gallery: sitePhotos(d.photos).length > 0, reviews: d.reviews.length > 0, contact: !!(d.address || d.phone),
  };
  const label: Partial<Record<WebsiteSectionKey, string>> = { about: "About", menu: "Menu", rooms: "Rooms", facilities: "Facilities", offers: "Offers", gallery: "Gallery", reviews: "Reviews", contact: "Contact" };
  return (d.sections as WebsiteSectionKey[]).filter((k) => has[k]).map((k) => ({ key: k, id: k, label: label[k]! }));
}

/**
 * The dishes the website leads with: ones that have a photo (https only), taken a category at a time so the first few are
 * not all starters. A library photo keeps its credit — the page shows it.
 */
export function siteSignature(d: SiteData, max = 8): (SiteDish & { category: string })[] {
  const lanes = d.menu.map((c) => c.items.filter((m) => !!m.image_url && /^https:\/\/[^\s"'<>]+$/i.test(m.image_url)).map((m) => ({ ...m, category: c.name })));
  const out: (SiteDish & { category: string })[] = [];
  for (let i = 0; out.length < max && lanes.some((l) => l.length > i); i++) for (const l of lanes) if (l[i] && out.length < max) out.push(l[i]);
  return out;
}

/** The buttons a visitor can act on, the most useful first for this kind of place. */
export function siteActions(d: SiteData): { key: "order" | "reserve" | "queue" | "book"; label: string; href: string }[] {
  const all = {
    book: { key: "book" as const, label: "Book a room", href: `/book/${d.slug}` },
    order: { key: "order" as const, label: "Order online", href: `/dine/${d.slug}?tab=order` },
    reserve: { key: "reserve" as const, label: "Book a table", href: `/dine/${d.slug}?tab=book` },
    queue: { key: "queue" as const, label: "Join the queue", href: `/queue/${d.slug}` },
  };
  const order = d.type === "restaurant" ? (["order", "reserve", "queue", "book"] as const) : (["book", "reserve", "order", "queue"] as const);
  return order.filter((k) => d.can[k]).map((k) => all[k]);
}

/**
 * The grey lines under a search result, and the words on a share card: the owner's own words first (the About, else
 * the headline or tagline); a short line is followed by the facts a searcher wants — what it is, where, when, what you
 * can do. Cut at a word, 160 at most.
 */
export function siteDescription(d: SiteData): string {
  const own = (d.about || d.headline || d.tagline || "").replace(/\s+/g, " ").trim(), facts = siteFacts(d);
  return cutAt(!own ? facts : own.length >= 110 ? own : `${own.replace(/[.!\s]+$/, "")}. ${facts}`, 160);
}

/** schema.org data for the website: only what the page shows; what the property has not filled is left out. */
export function websiteLd(d: SiteData, url: string): Record<string, unknown> {
  const ld: Record<string, unknown> = { "@context": "https://schema.org", "@type": d.type === "restaurant" ? "Restaurant" : d.type === "resort" ? "Resort" : "Hotel", "@id": `${url}#place`, name: d.name, url };
  ld.description = siteDescription(d);
  if (d.address) ld.address = { "@type": "PostalAddress", streetAddress: d.address, ...(d.district ? { addressLocality: d.district } : {}), ...(d.pincode ? { postalCode: d.pincode } : {}), addressCountry: "IN" };
  const pin = sitePin(d); if (pin) ld.geo = { "@type": "GeoCoordinates", latitude: pin.lat, longitude: pin.lng };
  const onMap = placeUrl(d); if (onMap) ld.hasMap = onMap;
  if (d.phone) ld.telephone = d.phone;
  if (d.email) ld.email = d.email;
  const same = [d.links?.instagram, d.links?.facebook, d.links?.youtube, d.links?.google].filter((u): u is string => !!u); if (same.length) ld.sameAs = same;
  ld.currenciesAccepted = "INR";
  const acts: Record<string, unknown>[] = [];
  if (d.can.order) acts.push({ "@type": "OrderAction", target: url.replace(/\/site\/[^/]+$/, `/dine/${d.slug}?tab=order`) });
  if (d.can.reserve) acts.push({ "@type": "ReserveAction", name: "Book a table", target: url.replace(/\/site\/[^/]+$/, `/dine/${d.slug}?tab=book`) });
  if (d.can.book) acts.push({ "@type": "ReserveAction", name: "Book a room", target: url.replace(/\/site\/[^/]+$/, `/book/${d.slug}`) });
  if (acts.length) ld.potentialAction = acts;
  const photos = sitePhotos(d.photos, 5); if (photos.length) ld.image = photos;
  if (d.logo_url) ld.logo = d.logo_url;
  if (d.rating && d.rating_count) ld.aggregateRating = { "@type": "AggregateRating", ratingValue: Number(d.rating), reviewCount: d.rating_count };
  if (d.type === "restaurant") {
    if (d.cuisines?.length) ld.servesCuisine = d.cuisines;
    if (d.price_for_two) ld.priceRange = `₹${Math.round(d.price_for_two)} for two`;
    if (d.opens_at && d.closes_at) {
      ld.openingHours = `Mo-Su ${d.opens_at.slice(0, 5)}-${d.closes_at.slice(0, 5)}`;
      ld.openingHoursSpecification = { "@type": "OpeningHoursSpecification", dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"], opens: d.opens_at.slice(0, 5), closes: d.closes_at.slice(0, 5) };
    }
    /* the menu itself, a few sections of it: the dish, what it is, its price — what a search for a dish in a town looks for */
    if (d.menu.length) ld.hasMenu = { "@type": "Menu", url: `${url}#menu`, hasMenuSection: d.menu.slice(0, 8).map((c) => ({ "@type": "MenuSection", name: c.name,
      hasMenuItem: c.items.slice(0, 12).map((m) => ({ "@type": "MenuItem", name: m.name, ...(m.description ? { description: m.description } : {}), ...(m.is_veg ? { suitableForDiet: "https://schema.org/VegetarianDiet" } : {}),
        offers: { "@type": "Offer", price: Number(m.from != null && Number(m.from) > 0 ? Math.min(Number(m.from), Number(m.price)) : m.price), priceCurrency: "INR" } })) })) };
    ld.acceptsReservations = d.can.reserve;
  } else {
    if (d.check_in_time) ld.checkinTime = d.check_in_time.slice(0, 5);
    if (d.check_out_time) ld.checkoutTime = d.check_out_time.slice(0, 5);
    const low = d.rooms.map((r) => Number(r.base_rate)).filter((n) => n > 0).sort((a, b) => a - b)[0];
    if (low) ld.priceRange = `From ₹${Math.round(low)} a night`;
    if (d.rooms.length) ld.containsPlace = d.rooms.slice(0, 12).map((r) => ({ "@type": "HotelRoom", name: r.name, occupancy: { "@type": "QuantitativeValue", maxValue: r.capacity },
      ...(r.amenities?.length ? { amenityFeature: r.amenities.slice(0, 8).map((a) => ({ "@type": "LocationFeatureSpecification", name: a, value: true })) } : {}) }));
    if (d.rooms.length) ld.makesOffer = d.rooms.filter((r) => Number(r.base_rate) > 0).slice(0, 12).map((r) => ({ "@type": "Offer", name: r.name, price: Number(r.base_rate), priceCurrency: "INR" }));
    if (d.facilities.length) ld.amenityFeature = d.facilities.slice(0, 12).map((f) => ({ "@type": "LocationFeatureSpecification", name: f.name, value: true }));
    if (d.menu.length) ld.hasMenu = `${url}#menu`;
  }
  return ld;
}

/** The one word of a dish's name that the showcase sets very large behind the plate: the last word when it is a real
 *  word (the dish itself — "Biryani", "Dosa"), else the longest ("Chicken 65" → "Chicken"). Twelve letters at most. */
export function siteShowWord(name: string): string {
  const words = name.replace(/[()[\],]/g, " ").trim().split(/\s+/).filter((w) => /\p{L}/u.test(w));
  if (!words.length) return name.trim().slice(0, 12);
  const last = words[words.length - 1];
  return (last.length >= 4 ? last : words.reduce((a, b) => (b.length > a.length ? b : a))).slice(0, 12);
}

/* ───────────────────────── found and shared (2026-11-16) ─────────────────────────
 * The owner: "what this kind of client needs for SEO, social media and digital marketing should fill itself in when the
 * website is made; the map from the address". Everything below is written from what the property already keeps — a
 * restaurant is described by its cuisine, hours and menu, a hotel by its rooms and check-in, a resort by those and what
 * there is to do. Nothing claims what the property has not said ("best", an award, a distance).
 */
const rupees = (n: number) => `₹${new Intl.NumberFormat("en-IN").format(Math.round(n))}`;
const lowestRate = (d: SiteData) => d.rooms.map((r) => Number(r.base_rate)).filter((n) => n > 0).sort((a, b) => a - b)[0] ?? null;
const cutAt = (text: string, max: number) => { if (text.length <= max) return text; const cut = text.slice(0, max - 3); return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), Math.floor(max * 0.6)))}…`; };

/** The property's pin, when it has a believable one (0,0 is an empty form, not a place). */
export function sitePin(d: Pick<SiteData, "lat" | "lng">): { lat: number; lng: number } | null {
  if (d.lat == null || d.lng == null) return null;
  const lat = Number(d.lat), lng = Number(d.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0) ? { lat, lng } : null;
}
/** "9.9195° N · 78.1193° E" — the pin, the way a map's corner says it. */
export const pinLabel = (p: { lat: number; lng: number }) => `${Math.abs(p.lat).toFixed(4)}° ${p.lat >= 0 ? "N" : "S"} · ${Math.abs(p.lng).toFixed(4)}° ${p.lng >= 0 ? "E" : "W"}`;

/** The address as the page sets it: the door line large, the rest under it; the pincode added when the address lacks it. */
export function siteAddress(d: Pick<SiteData, "address" | "pincode">): { head: string; rest: string; full: string } | null {
  const typed = (d.address ?? "").replace(/\s+/g, " ").trim(); if (!typed) return null;
  const pin = (d.pincode ?? "").trim(), full = pin && !typed.replace(/\s/g, "").includes(pin.replace(/\s/g, "")) ? `${typed.replace(/[,.\s]+$/, "")} – ${pin}` : typed;
  const parts = full.split(/\s*,\s*/).filter(Boolean);
  const take = parts.length > 2 && parts[0].length < 8 ? 2 : 1;      // "12" alone is not a line: "12, West Masi Street"
  return { head: parts.slice(0, take).join(", "), rest: parts.slice(take).join(", "), full };
}

/** Where a map should point: the pin when there is one, else the name and address as a search. */
const mapPoint = (d: SiteData) => { const p = sitePin(d), a = siteAddress(d); return p ? `${p.lat},${p.lng}` : a ? `${d.name}, ${a.full}` : null; };
/** The live map, in a frame (Google's keyless embed). Null when there is neither a pin nor an address. */
export const mapEmbedUrl = (d: SiteData) => { const q = mapPoint(d); return q ? `https://www.google.com/maps?q=${encodeURIComponent(q)}&z=${sitePin(d) ? 16 : 15}&output=embed` : null; };
/** Turn-by-turn from wherever the guest is. */
export const directionsUrl = (d: SiteData) => { const q = mapPoint(d); return q ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}` : null; };
/** The place on Google Maps: the owner's own link when they gave one, else a search for the name and address. */
export const placeUrl = (d: SiteData) => { const a = siteAddress(d); return d.links?.google || (a ? mapsUrl(d.name, a.full) : null); };
/** A WhatsApp chat with a first line already written. */
export const waHref = (digits: string, text: string) => `https://wa.me/${digits.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;

const what = (d: SiteData) => d.type === "restaurant" ? `${d.cuisines?.[0] ? `${d.cuisines[0]} ` : ""}restaurant` : d.type;

/**
 * The tab title and the blue line in a search result: the name, then what guests type next — the cuisine and the town
 * for a restaurant, the town for a hotel or resort. When the name already says the kind ("Hotel Temple View"), it is
 * not said twice.
 */
export function siteTitle(d: SiteData): string {
  const town = d.district?.trim() || null, says = new RegExp(`\\b${d.type}\\b`, "i").test(d.name);
  const tail = d.type === "restaurant"
    ? says && !d.cuisines?.[0] ? `Menu & prices${town ? ` · ${town}` : ""}` : `${what(d).replace(/^./, (c) => c.toUpperCase())}${town ? ` in ${town}` : ""}`
    : says ? `Rooms & rates${town ? ` in ${town}` : ""}` : `${d.type === "hotel" ? "Hotel" : "Resort"}${town ? ` in ${town}` : ""}`;
  const full = `${d.name} — ${tail}`;
  return full.length <= 70 ? full : town && `${d.name} · ${town}`.length <= 70 ? `${d.name} · ${town}` : d.name;
}

/** What the page can say about the place in one breath, from its own records. */
function siteFacts(d: SiteData): string {
  const town = d.district?.trim() ? ` in ${d.district!.trim()}` : "";
  if (d.type === "restaurant") {
    const cook = d.cuisines?.length ? `${d.cuisines.slice(0, 2).join(" and ")} restaurant` : "restaurant";
    const does = [d.menu.length ? "See the menu with prices" : null, d.can.order ? "order online" : null, d.can.reserve ? "book a table" : null].filter(Boolean).join(", ");
    return `${d.name} is a ${cook}${town}.${d.opens_at && d.closes_at ? ` Open ${clock(d.opens_at)}–${clock(d.closes_at)}.` : ""}${does ? ` ${does.charAt(0).toUpperCase()}${does.slice(1)}.` : ""}`;
  }
  const low = lowestRate(d);
  return `${d.name} is a ${d.type}${town}.${low ? ` Rooms from ${rupees(low)} a night.` : ""}${d.check_in_time ? ` Check-in ${clock(d.check_in_time)}.` : ""}${d.can.book ? " Book direct." : ""}`;
}

/** Search words for this kind of place in its town — the property's own words only (its cuisines, rooms, facilities). */
export function siteKeywords(d: SiteData): string[] {
  const town = d.district?.trim(), n = d.name;
  const list = d.type === "restaurant"
    ? [n, town && `${n} ${town}`, `${n} menu`, ...(d.cuisines ?? []).slice(0, 3).map((c) => town ? `${c} restaurant in ${town}` : `${c} restaurant`), town && `restaurants in ${town}`,
      d.can.order && (town ? `order food online ${town}` : "order food online"), d.can.reserve && (town ? `table booking ${town}` : "table booking"), ...d.menu.slice(0, 3).map((c) => town ? `${c.name} in ${town}` : c.name)]
    : [n, town && `${n} ${town}`, `${n} booking`, town && `${d.type}s in ${town}`, town && `rooms in ${town}`, d.can.book && `book ${d.type} ${town ?? "online"}`,
      ...d.rooms.slice(0, 3).map((r) => r.name), ...(d.type === "resort" ? [town && `weekend getaway near ${town}`, ...d.facilities.slice(0, 3).map((f) => f.name)] : [town && `stay in ${town}`])];
  return [...new Set(list.filter((k): k is string => !!k).map((k) => k.replace(/\s+/g, " ").trim().toLowerCase()))].slice(0, 12);
}

/**
 * The questions guests type into a search box about this kind of place, answered from the property's own records. Drawn
 * on the page (and marked up as FAQPage) only when there are three or more.
 */
export function siteFaq(d: SiteData): { q: string; a: string }[] {
  const n = d.name, out: { q: string; a: string }[] = [], a = siteAddress(d), low = lowestRate(d);
  const dishes = d.menu.flatMap((c) => c.items), veg = dishes.filter((m) => m.is_veg).length;
  const where = () => { if (a) out.push({ q: `Where is ${n}?`, a: `${n} is at ${a.full}. Tap Directions on this page for the way from where you are.` }); };
  if (d.type === "restaurant") {
    if (d.opens_at && d.closes_at) out.push({ q: `What are the opening hours of ${n}?`, a: d.opens_at === d.closes_at ? `${n} is open all day, every day.` : `${n} is open every day from ${clock(d.opens_at)} to ${clock(d.closes_at)}.` });
    where();
    if (d.cuisines?.length) out.push({ q: `What food does ${n} serve?`, a: `${d.cuisines.join(", ")}.${dishes.length > 1 ? ` There are ${dishes.length} dishes on the menu, with today's prices on this page.` : ""}` });
    if (veg > 0) out.push({ q: `Does ${n} have vegetarian food?`, a: veg === dishes.length ? "Yes — the whole menu is vegetarian." : `Yes — ${veg} of the ${dishes.length} dishes on the menu are vegetarian, each marked with a green dot.` });
    if (d.price_for_two) out.push({ q: `How much is a meal for two at ${n}?`, a: `About ${rupees(Number(d.price_for_two))} for two.` });
    if (d.can.order) out.push({ q: `Can I order online from ${n}?`, a: "Yes — order straight from this website. There is no app to install." });
    if (d.can.reserve) out.push({ q: `Can I book a table at ${n}?`, a: "Yes — pick a day and a time on this website." });
  } else {
    if (d.check_in_time && d.check_out_time) out.push({ q: `What are the check-in and check-out times at ${n}?`, a: `Check-in is from ${clock(d.check_in_time)} and check-out is by ${clock(d.check_out_time)}.` });
    if (low) out.push({ q: `How much is a room at ${n}?`, a: `Rooms start at ${rupees(low)} a night, before taxes.${d.rooms.length > 1 ? ` There are ${d.rooms.length} room types: ${d.rooms.slice(0, 5).map((r) => r.name).join(", ")}.` : ""}` });
    if (d.can.book) out.push({ q: `How do I book a room at ${n}?`, a: `Pick your dates on this website and book with the ${d.type} directly.` });
    where();
    if (d.facilities.length) out.push({ q: `What is there to do at ${n}?`, a: `${d.facilities.slice(0, 8).map((f) => f.name).join(", ")}.` });
    if (dishes.length) out.push({ q: `Is there food at ${n}?`, a: `Yes — the menu is on this page${d.can.reserve ? ", and you can book a table" : ""}.` });
  }
  if (d.phone) out.push({ q: `How do I contact ${n}?`, a: `Call ${d.phone}${d.links?.whatsapp ? ", or message on WhatsApp from this page" : ""}${d.email ? `, or write to ${d.email}` : ""}.` });
  return out.slice(0, 8);
}

/** Everything a search engine is told about the page, as one graph: the place, the website, the page, the questions. */
export function siteGraph(d: SiteData, url: string): Record<string, unknown> {
  const { "@context": _c, ...place } = websiteLd(d, url); void _c;
  const faq = siteFaq(d), shot = sitePhotos(d.photos, 1)[0];
  return { "@context": "https://schema.org", "@graph": [
    place,
    { "@type": "WebSite", "@id": `${url}#website`, url, name: d.name, inLanguage: "en-IN" },
    { "@type": "WebPage", "@id": url, url, name: siteTitle(d), description: siteDescription(d), isPartOf: { "@id": `${url}#website` }, about: { "@id": `${url}#place` }, inLanguage: "en-IN",
      dateModified: d.updated_at, ...(shot ? { primaryImageOfPage: shot } : {}) },
    ...(faq.length >= 3 ? [{ "@type": "FAQPage", "@id": `${url}#faq`, mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) }] : []),
  ] };
}

/* ───────────────────────── extras the client chose (eighth pass) ───────────────────────── */
/** India's date, as the database writes one: 2026-11-16. */
export const istDay = (at: Date = new Date()) => new Date(at.getTime() + 5.5 * 3600e3).toISOString().slice(0, 10);
/** The announcement line, while it is still its day: text with markup characters dropped; null after the last day. */
export function siteBanner(d: Pick<SiteData, "options">, at: Date = new Date()): string | null {
  const o = d.options ?? {}, text = typeof o.banner_text === "string" ? o.banner_text.replace(/[<>]/g, "").trim().slice(0, 90) : "";
  if (!text) return null;
  const until = typeof o.banner_until === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.banner_until) ? o.banner_until : null;
  return until && istDay(at) > until ? null : text;
}
/** The Google review address the page may link to, or null (a typed value is checked again here, where it is used). */
export const reviewUrl = (d: Pick<SiteData, "options">): string | null => { const u = d.options?.review_url; return typeof u === "string" && isReviewUrl(u) ? u : null; };

/* ───────────────────────── more extras (ninth pass): the look, a film, Instagram, a dish in 3D ───────────────────────── */
/** The page's look; anything but the two others is "night". */
export const siteLook = (d: Pick<SiteData, "options">): "night" | "calm" | "day" => { const l = d.options?.look; return l === "calm" || l === "day" ? l : "night"; };
/** The first screen's film: a file in the bucket, checked again here. */
export const siteVideo = (d: Pick<SiteData, "options">): string | null => { const u = d.options?.video_url; return typeof u === "string" && isSiteFile(u, "mp4|webm") ? u : null; };
/** The Instagram posts the page may frame: the post's own address, and the address its frame loads. */
export const siteInsta = (d: Pick<SiteData, "options">): { href: string; embed: string }[] =>
  [d.options?.insta_1, d.options?.insta_2, d.options?.insta_3].map((u) => (typeof u === "string" ? { href: u, embed: instaEmbed(u) } : null)).filter((x): x is { href: string; embed: string } => !!x && !!x.embed);
/** The dish in 3D: its file and its name. */
export const siteModel = (d: Pick<SiteData, "options">): { url: string; name: string } | null => { const u = d.options?.model_url; return typeof u === "string" && isSiteFile(u, "glb") ? { url: u, name: typeof d.options?.model_name === "string" && d.options.model_name.trim() ? d.options.model_name.trim().slice(0, 60) : "Our dish" } : null; };
/** A room's own photos (https only), else none. */
export const roomPhotos = (r: { photos?: string[] | null }): string[] => sitePhotos(r.photos ?? [], 6);
