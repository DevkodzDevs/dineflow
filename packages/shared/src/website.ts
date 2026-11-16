import type { PropertyType } from "./constants";

/**
 * A website for every property (0185, 2026-11-14 — the owner: "a Create website button in Settings; a checklist opens for
 * that client's restaurant, hotel or resort; from what is ticked, the website is made").
 *
 * The website has no content of its own beyond a headline and an About text. Every section is drawn from what the property
 * already keeps — the menu, the room types, the facilities, the offers, the photos — so the checklist is two questions per
 * section: *can this kind of property have it* (WEBSITE_SECTIONS, the same lists as `_website_sections()` in the migration —
 * apps/web/lib/website.test.ts reads the SQL and checks) and *is there anything to show yet* (websiteChecklist, below).
 */
export type WebsiteSectionKey =
  | "about" | "menu" | "order" | "reserve" | "queue" | "rooms" | "book" | "facilities" | "offers" | "gallery" | "reviews" | "contact";

/** The sections a kind of property can have, in the order the page shows them. */
export const WEBSITE_SECTIONS: Record<PropertyType, WebsiteSectionKey[]> = {
  restaurant: ["about", "menu", "order", "reserve", "queue", "offers", "gallery", "reviews", "contact"],
  hotel: ["about", "rooms", "book", "menu", "order", "reserve", "offers", "gallery", "reviews", "contact"],
  resort: ["about", "rooms", "book", "facilities", "menu", "order", "reserve", "offers", "gallery", "reviews", "contact"],
};

/** `page`: a block of the page. `button`: a button on the page that opens the screen which already takes the order or booking. */
export const WEBSITE_SECTION: Record<WebsiteSectionKey, { label: string; hint: string; kind: "page" | "button" }> = {
  about: { label: "About us", hint: "Your story in a few lines", kind: "page" },
  menu: { label: "Menu", hint: "Dishes and today's prices", kind: "page" },
  order: { label: "Order online", hint: "Delivery and takeaway, no commission", kind: "button" },
  reserve: { label: "Book a table", hint: "Guests pick a time", kind: "button" },
  queue: { label: "Waiting list", hint: "Join the queue from a phone", kind: "button" },
  rooms: { label: "Rooms & rates", hint: "Room types and prices", kind: "page" },
  book: { label: "Book a room", hint: "Direct bookings, no commission", kind: "button" },
  facilities: { label: "Facilities", hint: "Pool, spa, activities", kind: "page" },
  offers: { label: "Offers", hint: "What is running now", kind: "page" },
  gallery: { label: "Photo gallery", hint: "Your photos", kind: "page" },
  reviews: { label: "Guest reviews", hint: "From guests who paid", kind: "page" },
  contact: { label: "Contact & directions", hint: "Address, phone, map, hours", kind: "page" },
};

export const websiteSectionsFor = (type: PropertyType): WebsiteSectionKey[] => WEBSITE_SECTIONS[type] ?? WEBSITE_SECTIONS.restaurant;
/** What a visitor calls this kind of place. */
export const WEBSITE_KIND: Record<PropertyType, string> = { restaurant: "Restaurant", hotel: "Hotel", resort: "Resort" };

/** What `website_setup()` answers: the property's switches and counts, and its saved website (null before it is created). */
export type WebsiteSetup = {
  type: PropertyType; slug: string | null; name: string; feature: boolean; allowed: string[];
  listed: boolean; dining: boolean; delivery: boolean; takeaway: boolean; booking_engine: boolean;
  has_tagline: boolean; has_address: boolean; has_phone: boolean; has_logo: boolean;
  /** what search and sharing lean on (websiteReach, below) */
  district: string | null; cuisines: string[]; has_pincode: boolean; has_pin: boolean; has_hours: boolean; has_stay_times: boolean; has_fssai: boolean;
  /** the gallery's addresses and each room type with its photos, so the dialog can show and change them (ninth pass) */
  photo_list?: string[]; room_list?: { id: string; name: string; photos: string[] }[];
  photos: number; dishes: number; room_types: number; facilities: number; offers: number; reviews: number;
  site: { sections: string[]; headline: string | null; about: string | null; email: string | null; links: WebsiteLinks; options?: WebsiteOptions; domain?: string | null; published: boolean; created_at: string; updated_at: string } | null;
};

/**
 * One line of the checklist.
 *   ready — there is something to show; it can be ticked
 *   empty — the section has nothing in it yet (no dishes, no photos); `fix` says where to add it
 *   off   — it needs a switch that is off (Listed publicly, Delivery, the booking page); `fix` says where
 */
export type WebsiteCheck = {
  key: WebsiteSectionKey; label: string; hint: string; kind: "page" | "button";
  state: "ready" | "empty" | "off"; detail: string; fix?: { label: string; href: string };
  /** whether it starts ticked: what was saved, or — for a new website — everything that is ready */
  ticked: boolean;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const STORE = "/settings/storefront";

/** The checklist for one property: every section its kind can have, with what is ready and what is missing. */
export function websiteChecklist(s: WebsiteSetup): WebsiteCheck[] {
  const saved = s.site ? new Set(s.site.sections) : null;
  const ordering = s.delivery || s.takeaway;
  const row = (key: WebsiteSectionKey): Pick<WebsiteCheck, "state" | "detail" | "fix"> => {
    switch (key) {
      case "about": return { state: "ready", detail: s.has_tagline ? "Your tagline and the text below" : "The text you write below" };
      case "menu": return s.dishes > 0 ? { state: "ready", detail: `${plural(s.dishes, "dish", "dishes")} · live prices` }
        : { state: "empty", detail: "No dishes yet", fix: { label: "Add dishes", href: "/menu" } };
      case "order":
        if (s.dishes === 0) return { state: "empty", detail: "Needs a menu first", fix: { label: "Add dishes", href: "/menu" } };
        if (!ordering) return { state: "off", detail: "Delivery and takeaway are off", fix: { label: "Switch on", href: STORE } };
        if (!s.listed) return { state: "off", detail: "Listed publicly is off", fix: { label: "Switch on", href: STORE } };
        return { state: "ready", detail: [s.delivery && "Delivery", s.takeaway && "Takeaway"].filter(Boolean).join(" · ") };
      case "reserve":
        if (!s.dining) return { state: "off", detail: "Table booking is off", fix: { label: "Switch on", href: STORE } };
        if (!s.listed) return { state: "off", detail: "Listed publicly is off", fix: { label: "Switch on", href: STORE } };
        return { state: "ready", detail: "Opens your booking page" };
      case "queue": return s.listed ? { state: "ready", detail: "Opens your queue page" }
        : { state: "off", detail: "Listed publicly is off", fix: { label: "Switch on", href: STORE } };
      case "rooms": return s.room_types > 0 ? { state: "ready", detail: `${plural(s.room_types, "room type")} · your rates` }
        : { state: "empty", detail: "No room types yet", fix: { label: "Add rooms", href: "/rooms" } };
      case "book":
        if (s.room_types === 0) return { state: "empty", detail: "Needs room types first", fix: { label: "Add rooms", href: "/rooms" } };
        if (!s.booking_engine) return { state: "off", detail: "The booking page is off", fix: { label: "Switch on", href: "/settings/booking-page" } };
        return { state: "ready", detail: "Opens your booking page" };
      case "facilities": return s.facilities > 0 ? { state: "ready", detail: plural(s.facilities, "facility", "facilities") }
        : { state: "empty", detail: "No facilities yet", fix: { label: "Add facilities", href: "/facilities" } };
      case "offers": return s.offers > 0 ? { state: "ready", detail: `${plural(s.offers, "offer")} running` }
        : { state: "empty", detail: "No offers running", fix: { label: "Add an offer", href: STORE } };
      case "gallery": return s.photos > 0 ? { state: "ready", detail: plural(s.photos, "photo") }
        : { state: "empty", detail: "No photos yet", fix: { label: "Add photos", href: STORE } };
      case "reviews": return s.reviews > 0 ? { state: "ready", detail: plural(s.reviews, "review") }
        : { state: "empty", detail: "No reviews yet" };
      case "contact": return s.has_address || s.has_phone
        ? { state: "ready", detail: [s.has_address && "Address", s.has_phone && "Phone"].filter(Boolean).join(" · ") }
        : { state: "empty", detail: "No address or phone yet", fix: { label: "Add them", href: "/settings" } };
    }
  };
  return websiteSectionsFor(s.type).filter((k) => s.allowed.includes(k)).map((key) => {
    const r = row(key);
    return { key, ...WEBSITE_SECTION[key], ...r, ticked: r.state === "ready" && (saved ? saved.has(key) : true) };
  });
}

/** The public address of a property's website, under the app's own address. */
export const websitePath = (slug: string) => `/site/${slug}`;

/* ───────────────────────── reach: search, social media, marketing (2026-11-16) ─────────────────────────
 * The owner: "whatever a client of this kind needs for SEO, social media and digital marketing should be done by itself
 * when the website is made; take the logo and the contact details from Settings". Most of it needs nothing typed — the
 * page writes its own title, description, search data, share card and sitemap entry from what the property keeps
 * (apps/web/lib/website.ts). What cannot be made up is listed here, kind by kind, with the screen that holds it.
 */
export type WebsiteLinkKey = "whatsapp" | "instagram" | "facebook" | "youtube" | "google";
export type WebsiteLinks = Partial<Record<WebsiteLinkKey, string>>;
export const WEBSITE_LINK: Record<WebsiteLinkKey, { label: string; placeholder: string }> = {
  whatsapp: { label: "WhatsApp number", placeholder: "98765 43210" },
  instagram: { label: "Instagram", placeholder: "@yourplace" },
  facebook: { label: "Facebook page", placeholder: "facebook.com/yourplace" },
  youtube: { label: "YouTube", placeholder: "youtube.com/@yourplace" },
  google: { label: "Google Maps link", placeholder: "https://maps.app.goo.gl/…" },
};
export const WEBSITE_LINK_KEYS = Object.keys(WEBSITE_LINK) as WebsiteLinkKey[];

const LINK_HOST: Record<Exclude<WebsiteLinkKey, "whatsapp">, RegExp> = {
  instagram: /^https:\/\/(www\.)?instagram\.com\/.+/,
  facebook: /^https:\/\/(www\.|m\.)?facebook\.com\/.+/,
  youtube: /^https:\/\/((www\.|m\.)?youtube\.com|youtu\.be)\/.+/,
  google: /^https:\/\/(maps\.app\.goo\.gl|goo\.gl|g\.page|g\.co|share\.google|maps\.google\.com|(www\.)?google\.(com|co\.in))\/.+/,
};
const LINK_CHARS = /^[A-Za-z0-9:/._?=&%@,+!~-]+$/;

/**
 * What the owner typed, made into what the database keeps (`_website_links()` in 0185 is the wall; this is the tidy-up
 * and the reason when something is refused). A name becomes its address ("@anjappar" → instagram.com/anjappar), a phone
 * number becomes digits with India's code. An empty box is simply left out.
 */
export function websiteLinks(raw: Partial<Record<WebsiteLinkKey, string | null | undefined>>): { links: WebsiteLinks; errors: Partial<Record<WebsiteLinkKey, string>> } {
  const links: WebsiteLinks = {}, errors: Partial<Record<WebsiteLinkKey, string>> = {};
  for (const key of WEBSITE_LINK_KEYS) {
    const typed = (raw[key] ?? "").trim(); if (!typed) continue;
    if (key === "whatsapp") {
      let n = typed.replace(/\D/g, "");
      if (n.length === 11 && n.startsWith("0")) n = n.slice(1);
      if (n.length === 10) n = `91${n}`;
      if (n.length >= 11 && n.length <= 15) links.whatsapp = n; else errors.whatsapp = "Type the full number, 10 digits";
      continue;
    }
    let v = typed.replace(/^http:\/\//i, "https://");
    const name = v.replace(/^@/, "");
    if (!/[/]/.test(v) && /^[A-Za-z0-9._-]{2,60}$/.test(name)) {
      if (key === "instagram") v = `https://www.instagram.com/${name}`;
      else if (key === "facebook") v = `https://www.facebook.com/${name}`;
      else if (key === "youtube") v = `https://www.youtube.com/@${name}`;
    } else if (!/^https:\/\//i.test(v)) v = `https://${v}`;
    if (key === "instagram" || key === "facebook") v = v.replace(/[?#].*$/, "").replace(/\/+$/, "");
    if (v.length <= 200 && LINK_CHARS.test(v) && LINK_HOST[key].test(v)) links[key] = v;
    else errors[key] = key === "google" ? "Paste the link Google Maps gives you (Share → Copy link)" : `That is not ${key === "youtube" ? "a YouTube" : key === "instagram" ? "an Instagram" : "a Facebook"} link`;
  }
  return { links, errors };
}

/** One line of Settings → Website → Reach. `auto`: the website does it by itself. Otherwise `done` says whether the property has it. */
export type WebsiteReachItem = {
  key: string; group: "search" | "social" | "trust"; label: string; detail: string; done: boolean; auto?: boolean;
  /** where to add it; none when it is typed in the website's own dialog */
  fix?: { label: string; href: string };
};
export const WEBSITE_REACH_GROUP: Record<WebsiteReachItem["group"], string> = { search: "Search (SEO)", social: "Social media", trust: "Marketing & trust" };

/**
 * What this kind of property needs to be found and shared, and how much of it is there. A restaurant is judged on its
 * cuisines, hours and menu; a hotel on its rooms and check-in times; a resort on those and its facilities.
 */
export function websiteReach(s: WebsiteSetup): WebsiteReachItem[] {
  const kind = WEBSITE_KIND[s.type] ?? "Restaurant", food = s.type === "restaurant", links = s.site?.links ?? {};
  const where = s.district ? ` in ${s.district}` : "";
  const lead = food && s.cuisines[0] ? `${s.cuisines[0]} restaurant` : kind.toLowerCase();
  const out: WebsiteReachItem[] = [
    { key: "title", group: "search", auto: true, done: true, label: "Page title & description", detail: `“${s.name} — ${lead}${where}”` },
    { key: "schema", group: "search", auto: true, done: true, label: "Google business data", detail: food ? "Restaurant · menu, prices, hours" : s.type === "hotel" ? "Hotel · rooms, rates, check-in" : "Resort · rooms, rates, things to do" },
    { key: "faq", group: "search", auto: true, done: true, label: "Questions guests search", detail: food ? "Hours, ordering, vegetarian food" : "Check-in, rates, how to book" },
    { key: "sitemap", group: "search", auto: true, done: true, label: "Sitemap", detail: "Sent to search engines" },
    { key: "town", group: "search", done: !!s.district, label: "Town", detail: s.district ?? `For “${food ? "restaurants" : `${kind.toLowerCase()}s`} in …” searches`, fix: { label: "Add", href: "/neighbours" } },
    { key: "address", group: "search", done: s.has_address, label: "Address", detail: s.has_address ? "On the page and the map" : "Not added yet", fix: { label: "Add", href: "/settings" } },
    { key: "pincode", group: "search", done: s.has_pincode, label: "Pincode", detail: s.has_pincode ? "In the search data" : "Not added yet", fix: { label: "Add", href: "/neighbours" } },
    { key: "pin", group: "search", done: s.has_pin, label: "Map pin", detail: s.has_pin ? "The exact spot" : "The map uses your address", fix: { label: "Set location", href: "/settings#attendance" } },
  ];
  if (food) out.push(
    { key: "cuisines", group: "search", done: s.cuisines.length > 0, label: "Cuisines", detail: s.cuisines.length ? s.cuisines.slice(0, 3).join(", ") : "What you cook", fix: { label: "Add", href: STORE } },
    { key: "hours", group: "search", done: s.has_hours, label: "Opening hours", detail: s.has_hours ? "“Open now” in search" : "Not added yet", fix: { label: "Add", href: STORE } },
    { key: "dishes", group: "search", done: s.dishes > 0, label: "Menu with prices", detail: s.dishes > 0 ? plural(s.dishes, "dish", "dishes") : "No dishes yet", fix: { label: "Add dishes", href: "/menu" } });
  else out.push(
    { key: "rooms", group: "search", done: s.room_types > 0, label: "Rooms with rates", detail: s.room_types > 0 ? plural(s.room_types, "room type") : "No room types yet", fix: { label: "Add rooms", href: "/rooms" } },
    { key: "stay", group: "search", done: s.has_stay_times, label: "Check-in & check-out", detail: s.has_stay_times ? "In the search data" : "Not added yet", fix: { label: "Add", href: "/settings" } });
  if (s.type === "resort") out.push({ key: "facilities", group: "search", done: s.facilities > 0, label: "Things to do", detail: s.facilities > 0 ? plural(s.facilities, "facility", "facilities") : "Pool, spa, activities", fix: { label: "Add", href: "/facilities" } });

  out.push(
    { key: "card", group: "social", auto: true, done: true, label: "Share card", detail: "Your name and photo on WhatsApp, Instagram, Facebook" },
    { key: "logo", group: "social", done: s.has_logo, label: "Your logo", detail: s.has_logo ? "On the page, the tab and the card" : "Your initial is shown for now", fix: { label: "Upload", href: "/settings" } },
    { key: "photos", group: "social", done: s.photos >= 3, label: "Photos", detail: s.photos >= 3 ? plural(s.photos, "photo") : s.photos ? `${plural(s.photos, "photo")} — add ${3 - s.photos} more` : "Add three or more", fix: { label: "Add photos", href: STORE } },
    { key: "instagram", group: "social", done: !!links.instagram, label: "Instagram", detail: links.instagram ? "Linked" : "Add it below" },
    { key: "facebook", group: "social", done: !!links.facebook, label: "Facebook", detail: links.facebook ? "Linked" : "Add it below" },
    { key: "whatsapp", group: "social", done: !!links.whatsapp, label: "WhatsApp chat", detail: links.whatsapp ? "Guests can message you" : "Add your number below" },

    { key: "phone", group: "trust", done: s.has_phone, label: "Phone", detail: s.has_phone ? "Tap to call" : "Not added yet", fix: { label: "Add", href: "/settings" } },
    { key: "google", group: "trust", done: !!links.google, label: "Google Maps link", detail: links.google ? "Guests open your Google page" : "Add it below" },
    { key: "review", group: "trust", done: isReviewUrl(s.site?.options?.review_url), label: "Google review button", detail: isReviewUrl(s.site?.options?.review_url) ? "Guests rate you on Google" : "Add your review link below" },
    { key: "reviews", group: "trust", done: s.reviews > 0, label: "Guest reviews", detail: s.reviews > 0 ? `${plural(s.reviews, "review")} shown` : "Ask guests for feedback", fix: { label: "Feedback QR", href: "/settings/screens" } },
    { key: "offers", group: "trust", done: s.offers > 0, label: "An offer running", detail: s.offers > 0 ? `${plural(s.offers, "offer")} on the page` : "A reason to come today", fix: { label: "Add an offer", href: STORE } });
  if (food) out.push({ key: "order", group: "trust", done: s.dishes > 0 && s.listed && (s.delivery || s.takeaway), label: "Order online button", detail: s.dishes > 0 && s.listed && (s.delivery || s.takeaway) ? "No commission" : "Switch on delivery or takeaway", fix: { label: "Switch on", href: STORE } });
  else out.push({ key: "book", group: "trust", done: s.room_types > 0 && s.booking_engine, label: "Book a room button", detail: s.room_types > 0 && s.booking_engine ? "Direct bookings" : "Switch on the booking page", fix: { label: "Switch on", href: "/settings/booking-page" } });
  if (food || s.dishes > 0) out.push({ key: "fssai", group: "trust", done: s.has_fssai, label: "FSSAI licence number", detail: s.has_fssai ? "Shown at the foot of the page" : "A food business shows it online", fix: { label: "Add", href: "/tax" } });
  return out;
}

const tag = (words: string) => words.replace(/&/g, " and ").split(/[^\p{L}\p{N}]+/u).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("");

/**
 * Ready posts for the owner to copy: an opening post, one for the thing guests do (order, book), a short one for a
 * WhatsApp status — and the hashtags this kind of place is searched by in its town. Nothing here claims what the
 * property has not said about itself (no "best", no awards).
 */
export function websitePosts(s: WebsiteSetup, url: string): { posts: { title: string; text: string }[]; tags: string[] } {
  const food = s.type === "restaurant", town = s.district, where = town ? ` in ${town}` : "", cuisine = food ? s.cuisines[0] : null;
  const order = s.dishes > 0 && s.listed && (s.delivery || s.takeaway), book = s.room_types > 0 && s.booking_engine;
  const posts = food ? [
    { title: "We are online", text: `${s.name} now has its own website. ${s.dishes > 0 ? "The full menu with today's prices" : "Everything about us"}${order ? ", and you can order straight from us" : ""}.\n\n${url}` },
    { title: order ? "Order direct" : "Come by", text: order ? `Hungry${where}? Order from ${s.name} directly — no app needed.\n\n${url}` : `${cuisine ? `${cuisine} food` : "Good food"}${where}. See what is cooking at ${s.name} today.\n\n${url}` },
    { title: "WhatsApp status", text: `${s.name} — menu, prices, directions: ${url}` },
  ] : [
    { title: "We are online", text: `${s.name} now has its own website. Rooms, rates${s.type === "resort" && s.facilities > 0 ? ", things to do" : ""} and photos in one place${book ? " — and you can book with us directly" : ""}.\n\n${url}` },
    { title: book ? "Book direct" : "Plan your stay", text: book ? `Planning a ${s.type === "resort" ? "break" : "stay"}${where}? Book ${s.name} directly for our own rates.\n\n${url}` : `Planning a ${s.type === "resort" ? "break" : "stay"}${where}? See the rooms and rates at ${s.name}.\n\n${url}` },
    { title: "WhatsApp status", text: `${s.name} — rooms, rates, directions: ${url}` },
  ];
  const t = town ? tag(town) : "";
  const tags = [tag(s.name), t,
    ...(food ? [t && `${t}Food`, t && `${t}Foodie`, ...s.cuisines.slice(0, 2).map(tag), t && `${t}Restaurants`, "FoodLovers"]
      : s.type === "hotel" ? [t && `${t}Hotels`, t && `StayIn${t}`, "HotelBooking", "TravelIndia"]
        : [t && `${t}Resort`, t && `${t}Getaway`, "WeekendGetaway", "ResortLife", "TravelIndia"])];
  return { posts, tags: [...new Set(tags.filter((x): x is string => !!x && x.length > 1))].slice(0, 9).map((x) => `#${x}`) };
}

/* ───────────────────────── extras: the client's own choices (2026-11-16, eighth pass) ─────────────────────────
 * The owner: "build these upgrades, but as choices — each client switches on what it wants". An extra is a key in
 * `websites.options` (0185: `_website_options` keeps any short key whose value is a yes/no, a number or a short plain
 * line). Everything is off until the client asks for it, and **an extra that is off is not drawn and makes no
 * request** (shoot10.mjs holds the page to that). The list grows here, not in the database.
 */
export type WebsiteOptions = {
  /** a Google review link: a button on the page, a QR in Settings */
  review_url?: string;
  /** "Send an enquiry": a short form that opens WhatsApp with the message written (needs the WhatsApp number) */
  enquiry?: boolean;
  /** one line across the top of the page, until a day (India's) */
  banner_text?: string; banner_until?: string;
  /** the first running offer, shown once per visit in a corner */
  offer_popup?: boolean;
  /** count opens and button taps — how many, never who */
  stats?: boolean;
  /** the page's look: night (as built), calm (no curtain, bands or cursor ring — the quietest and lightest), day (paper throughout) */
  look?: "night" | "calm" | "day";
  /** a short silent film behind the first screen, on wide screens only (a file in the property's own folder) */
  video_url?: string;
  /** up to three Instagram posts or reels, each loaded only when it is tapped */
  insta_1?: string; insta_2?: string; insta_3?: string;
  /** one dish in 3D: a .glb file in the property's own folder, and the dish's name */
  model_url?: string; model_name?: string;
  /** the page offered in Tamil and / or Hindi as well (a language button) */
  lang_ta?: boolean; lang_hi?: boolean;
};
export type WebsiteExtraKey = "review" | "enquiry" | "banner" | "offer_popup" | "stats" | "look" | "video" | "insta" | "model" | "lang";
export const WEBSITE_EXTRAS: { key: WebsiteExtraKey; label: string; hint: string; kind: "switch" | "text" }[] = [
  { key: "review", label: "Google review button", hint: "Paste your review link", kind: "text" },
  { key: "enquiry", label: "Enquiry form", hint: "Arrives on your WhatsApp", kind: "switch" },
  { key: "banner", label: "Announcement", hint: "One line on top, till a date", kind: "text" },
  { key: "offer_popup", label: "Offer pop-up", hint: "Your first offer, once a visit", kind: "switch" },
  { key: "stats", label: "Visitor count", hint: "Opens and taps — no tracking", kind: "switch" },
  { key: "look", label: "Look", hint: "Night, calm or day", kind: "text" },
  { key: "lang", label: "Tamil / Hindi", hint: "A language button on the page", kind: "text" },
  { key: "video", label: "First-screen video", hint: "Short, silent; wide screens only", kind: "text" },
  { key: "insta", label: "Instagram posts", hint: "Up to three; loaded on a tap", kind: "text" },
  { key: "model", label: "A dish in 3D", hint: "A .glb file; loaded on a tap", kind: "text" },
];
export const WEBSITE_LOOKS: { key: NonNullable<WebsiteOptions["look"]>; label: string; hint: string }[] = [
  { key: "night", label: "Night", hint: "Dark room, full motion" },
  { key: "calm", label: "Calm", hint: "Dark, quiet, lightest" },
  { key: "day", label: "Day", hint: "Warm paper throughout" },
];

/** A file in a property's own folder of the `site` bucket (0185 `_site_file` says the same): our storage path, a plain name, one of these endings. */
export const isSiteFile = (u: string | null | undefined, ext: string): u is string =>
  !!u && u.length <= 300 && new RegExp(`^https://[a-z0-9.-]+/storage/v1/object/public/site/[0-9a-f-]{36}/[a-z0-9][a-z0-9._-]{0,80}[.](${ext})$`).test(u);
/** An Instagram post or reel, made into the address its frame is loaded from; null for anything else. */
export function instaEmbed(u: string | null | undefined): string | null {
  const m = /^https:\/\/(?:www\.)?instagram\.com\/(?:[A-Za-z0-9._]+\/)?(p|reel|tv)\/([A-Za-z0-9_-]{5,40})\/?(?:[?#].*)?$/.exec((u ?? "").trim());
  return m ? `https://www.instagram.com/${m[1]}/${m[2]}/embed` : null;
}

const REVIEW_HOST = /^https:\/\/(g\.page\/r\/|search\.google\.com\/local\/writereview\?|maps\.app\.goo\.gl\/|goo\.gl\/|www\.google\.(com|co\.in)\/maps\/|maps\.google\.com\/)[A-Za-z0-9:/._?=&%@,+!~-]+$/;
/** Is this an address a "Review us on Google" button may open? Google's own review and maps addresses only. */
export const isReviewUrl = (u: string | null | undefined): u is string => !!u && u.length <= 240 && REVIEW_HOST.test(u);

/**
 * What the owner chose, made into what the database keeps — and the reason when something is refused. A switch that is
 * off is left out (so `{}` is "nothing chosen"); an announcement with no end date simply stays until it is cleared.
 */
export function websiteOptions(raw: { review_url?: string | null; enquiry?: boolean; banner_text?: string | null; banner_until?: string | null; offer_popup?: boolean; stats?: boolean;
  look?: string | null; video_url?: string | null; insta?: (string | null | undefined)[]; model_url?: string | null; model_name?: string | null; lang_ta?: boolean; lang_hi?: boolean }): { options: WebsiteOptions; errors: Partial<Record<WebsiteExtraKey, string>> } {
  const options: WebsiteOptions = {}, errors: Partial<Record<WebsiteExtraKey, string>> = {};
  const review = (raw.review_url ?? "").trim().replace(/^http:\/\//i, "https://");
  if (review) { const u = /^https:\/\//i.test(review) ? review : `https://${review}`; if (isReviewUrl(u)) options.review_url = u; else errors.review = "Paste the review link from your Google Business Profile (Ask for reviews)"; }
  if (raw.enquiry) options.enquiry = true;
  if (raw.offer_popup) options.offer_popup = true;
  if (raw.stats) options.stats = true;
  const line = (raw.banner_text ?? "").replace(/[<>"`\\]/g, "").replace(/\s+/g, " ").trim().slice(0, 90);
  if (line) {
    options.banner_text = line;
    const until = (raw.banner_until ?? "").trim();
    if (until) { if (/^\d{4}-\d{2}-\d{2}$/.test(until) && !Number.isNaN(Date.parse(`${until}T00:00:00Z`))) options.banner_until = until; else errors.banner = "Pick the last day from the calendar"; }
  }
  if (raw.look === "calm" || raw.look === "day") options.look = raw.look;
  if (raw.lang_ta) options.lang_ta = true;
  if (raw.lang_hi) options.lang_hi = true;
  const video = (raw.video_url ?? "").trim();
  if (video) { if (isSiteFile(video, "mp4|webm")) options.video_url = video; else errors.video = "Upload the video here — a link from elsewhere cannot be used"; }
  const posts = (raw.insta ?? []).map((x) => (x ?? "").trim()).filter(Boolean).slice(0, 3);
  posts.forEach((p, i) => { const clean = p.replace(/^http:\/\//i, "https://").replace(/[?#].*$/, ""); if (instaEmbed(clean)) options[`insta_${i + 1}` as "insta_1"] = clean; else errors.insta = "Paste the link of a post or a reel (instagram.com/p/… or /reel/…)"; });
  const model = (raw.model_url ?? "").trim();
  if (model) {
    if (!isSiteFile(model, "glb")) errors.model = "Upload the .glb file here — a link from elsewhere cannot be used";
    else { options.model_url = model; const name = (raw.model_name ?? "").replace(/[<>"`\\]/g, "").replace(/\s+/g, " ").trim().slice(0, 60); if (name) options.model_name = name; }
  }
  return { options, errors };
}
/** How many extras are on — for the card's line. */
export const websiteExtrasOn = (o: WebsiteOptions | null | undefined): number => !o ? 0 : [isReviewUrl(o.review_url), !!o.enquiry, !!o.banner_text, !!o.offer_popup, !!o.stats, o.look === "calm" || o.look === "day", !!o.video_url, !!o.insta_1, !!o.model_url, !!(o.lang_ta || o.lang_hi)].filter(Boolean).length;

/** What `website_stats()` answers: the last `days` days, by kind of thing done, and the opens day by day. */
export type WebsiteStats = { days: number; total: Partial<Record<string, number>>; views: { day: string; n: number }[] };
export const WEBSITE_HIT_KINDS = ["view", "order", "reserve", "queue", "book", "call", "whatsapp", "directions", "map", "share", "enquiry", "review", "dish"] as const;
export type WebsiteHitKind = (typeof WEBSITE_HIT_KINDS)[number];
