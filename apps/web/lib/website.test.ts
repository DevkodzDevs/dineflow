import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { WEBSITE_SECTIONS, WEBSITE_SECTION, websiteChecklist, websiteSectionsFor, websitePath, websiteLinks, websiteReach, websitePosts, websiteOptions, websiteExtrasOn, isReviewUrl, WEBSITE_EXTRAS, WEBSITE_HIT_KINDS, PROPERTY_TYPES, type WebsiteSetup } from "@dineflow/shared";
import { openNow, clock, telHref, mapsUrl, sitePhotos, siteBlocks, siteActions, siteSignature, siteShowWord, siteDescription, websiteLd, siteTitle, siteKeywords, siteFaq, siteGraph, siteAddress, sitePin, pinLabel, mapEmbedUrl, directionsUrl, placeUrl, waHref, siteBanner, reviewUrl, istDay, type SiteData } from "./website";

/** A website for every property (0185): the checklist behind Settings → Create website, and what the page is drawn from. */
const setup = (over: Partial<WebsiteSetup> = {}): WebsiteSetup => ({
  type: "restaurant", slug: "anjappar", name: "Anjappar", feature: true, allowed: [...WEBSITE_SECTIONS.restaurant],
  listed: true, dining: true, delivery: true, takeaway: false, booking_engine: true,
  has_tagline: true, has_address: true, has_phone: true, has_logo: false,
  district: "Madurai", cuisines: ["Chettinad"], has_pincode: false, has_pin: false, has_hours: true, has_stay_times: false, has_fssai: false,
  photos: 4, dishes: 16, room_types: 0, facilities: 0, offers: 1, reviews: 3, site: null, ...over,
});
const site = (over: Partial<SiteData> = {}): SiteData => ({
  slug: "anjappar", name: "Anjappar", type: "restaurant", demo: false, tagline: "Chettinad, since 1964", headline: null, about: null, logo_url: null,
  cuisines: ["Chettinad"], price_for_two: 600, rating: 4.4, rating_count: 20, address: "12 Main Rd", district: "Madurai", phone: "+91 98765 43210",
  photos: ["https://x.test/a.jpg"], opens_at: "11:00:00", closes_at: "23:00:00", check_in_time: "14:00:00", check_out_time: "11:00:00",
  pincode: null, lat: null, lng: null, fssai_no: null, email: null, links: null,
  sections: ["about", "menu", "order", "reserve", "offers", "gallery", "reviews", "contact"], updated_at: "2026-11-14T00:00:00Z",
  can: { order: true, reserve: true, queue: false, book: false },
  menu: [{ name: "Mains", items: [{ name: "Biryani", price: 280, is_veg: false, description: null, image_url: null, image_credit: null, from: null }] }],
  rooms: [], facilities: [], offers: [{ title: "10% off", kind: "percent", value: 10, min_order: 0, code: null }],
  reviews: [{ guest: "Ravi", rating: 5, body: "Good", reply: null, at: "2026-11-01T00:00:00Z" }], ...over,
});

describe("website sections (0185)", () => {
  it("the database's _website_sections() lists exactly what website.ts lists, kind by kind, in order", () => {
    const sql = readFileSync(resolve(__dirname, "../../../supabase/migrations/0185_websites.sql"), "utf8");
    const body = /function public\._website_sections\(p_type text\)[\s\S]*?end::text\[\]/.exec(sql);
    expect(body, "_website_sections() found in 0185").toBeTruthy();
    const lists = [...body![0].matchAll(/array\[([^\]]*)\]/g)].map((m) => [...m[1].matchAll(/'([a-z]+)'/g)].map((x) => x[1]));
    expect(lists).toEqual([WEBSITE_SECTIONS.restaurant, WEBSITE_SECTIONS.hotel, WEBSITE_SECTIONS.resort]);
  });

  it("every kind of property has a list, every listed section has a label, and only places with rooms get rooms", () => {
    for (const t of PROPERTY_TYPES) {
      const list = websiteSectionsFor(t);
      expect(new Set(list).size).toBe(list.length);
      for (const k of list) expect(WEBSITE_SECTION[k], k).toBeTruthy();
      expect(list[0]).toBe("about"); expect(list.at(-1)).toBe("contact");
    }
    expect(WEBSITE_SECTIONS.restaurant).not.toContain("rooms");
    expect(WEBSITE_SECTIONS.restaurant).not.toContain("book");
    expect(WEBSITE_SECTIONS.hotel).not.toContain("facilities");
    expect(WEBSITE_SECTIONS.resort).toContain("facilities");
    expect(websitePath("anjappar")).toBe("/site/anjappar");
  });
});

describe("the Create website checklist", () => {
  const by = (rows: ReturnType<typeof websiteChecklist>) => Object.fromEntries(rows.map((r) => [r.key, r]));

  it("a new website starts with everything that is ready ticked, and nothing that is not", () => {
    const rows = websiteChecklist(setup());
    expect(rows.map((r) => r.key)).toEqual(WEBSITE_SECTIONS.restaurant);
    for (const r of rows) expect(r.ticked, r.key).toBe(r.state === "ready");
    const c = by(rows);
    expect(c.menu.detail).toBe("16 dishes · live prices");
    expect(c.order).toMatchObject({ state: "ready", detail: "Delivery" });
    expect(c.offers.detail).toBe("1 offer running");
    expect(c.gallery.detail).toBe("4 photos");
  });

  it("an empty section says what is missing and where to add it", () => {
    const c = by(websiteChecklist(setup({ dishes: 0, photos: 0, offers: 0, reviews: 0, has_address: false, has_phone: false })));
    expect(c.menu).toMatchObject({ state: "empty", ticked: false, fix: { href: "/menu" } });
    expect(c.order).toMatchObject({ state: "empty", detail: "Needs a menu first" });
    expect(c.gallery.fix?.href).toBe("/settings/storefront");
    expect(c.reviews).toMatchObject({ state: "empty", ticked: false }); expect(c.reviews.fix).toBeUndefined();
    expect(c.contact).toMatchObject({ state: "empty", fix: { href: "/settings" } });
    expect(c.about.state).toBe("ready");   // the owner writes it in the dialog
  });

  it("a button whose switch is off says which switch", () => {
    let c = by(websiteChecklist(setup({ delivery: false, takeaway: false })));
    expect(c.order).toMatchObject({ state: "off", detail: "Delivery and takeaway are off" });
    c = by(websiteChecklist(setup({ listed: false })));
    expect(c.order.detail).toBe("Listed publicly is off"); expect(c.reserve.state).toBe("off"); expect(c.queue.state).toBe("off");
    c = by(websiteChecklist(setup({ dining: false })));
    expect(c.reserve).toMatchObject({ state: "off", detail: "Table booking is off" });
  });

  it("a hotel and a resort get rooms and booking; only the resort gets facilities", () => {
    const hotel = by(websiteChecklist(setup({ type: "hotel", allowed: [...WEBSITE_SECTIONS.hotel], room_types: 3 })));
    expect(hotel.rooms).toMatchObject({ state: "ready", detail: "3 room types · your rates" });
    expect(hotel.book.state).toBe("ready"); expect(hotel.facilities).toBeUndefined(); expect(hotel.queue).toBeUndefined();
    const resort = by(websiteChecklist(setup({ type: "resort", allowed: [...WEBSITE_SECTIONS.resort], room_types: 1, facilities: 5, booking_engine: false })));
    expect(resort.facilities.detail).toBe("5 facilities"); expect(resort.rooms.detail).toBe("1 room type · your rates");
    expect(resort.book).toMatchObject({ state: "off", fix: { href: "/settings/booking-page" } });
    const none = by(websiteChecklist(setup({ type: "hotel", allowed: [...WEBSITE_SECTIONS.hotel], room_types: 0 })));
    expect(none.rooms.state).toBe("empty"); expect(none.book).toMatchObject({ state: "empty", detail: "Needs room types first" });
  });

  it("editing ticks what was saved — never a section that has since gone empty — and follows what the database allows", () => {
    const saved = { sections: ["about", "menu", "gallery"], headline: null, about: null, email: null, links: {}, published: true, created_at: "", updated_at: "" };
    const c = by(websiteChecklist(setup({ site: saved, photos: 0 })));
    expect(c.about.ticked).toBe(true); expect(c.menu.ticked).toBe(true);
    expect(c.gallery.ticked).toBe(false);   // saved, but no photos now
    expect(c.offers.ticked).toBe(false);    // ready, but not saved
    expect(websiteChecklist(setup({ allowed: ["about", "contact"] })).map((r) => r.key)).toEqual(["about", "contact"]);
  });
});

describe("the public page's pieces", () => {
  it("open now follows India's clock and hours that run past midnight", () => {
    const at = (ist: string) => new Date(`2026-11-14T${ist}:00+05:30`);
    expect(openNow("11:00:00", "23:00:00", at("10:59"))).toBe(false);
    expect(openNow("11:00:00", "23:00:00", at("11:00"))).toBe(true);
    expect(openNow("11:00:00", "23:00:00", at("23:00"))).toBe(false);
    expect(openNow("18:00", "02:00", at("01:30"))).toBe(true);
    expect(openNow("18:00", "02:00", at("12:00"))).toBe(false);
    expect(openNow("00:00", "00:00", at("04:00"))).toBe(true);
    expect(openNow(null, "23:00", at("12:00"))).toBeNull();
  });

  it("times read like a door sign; phone and map links are safe to click", () => {
    expect(clock("11:00:00")).toBe("11 am"); expect(clock("23:30")).toBe("11:30 pm"); expect(clock("00:00")).toBe("12 am"); expect(clock("12:00")).toBe("12 pm"); expect(clock(null)).toBe("");
    expect(telHref("+91 98765-43210")).toBe("tel:+919876543210");
    expect(telHref("(044) 2345 678")).toBe("tel:0442345678");
    expect(mapsUrl("A & B", "1, Main Rd")).toBe("https://www.google.com/maps/search/?api=1&query=A%20%26%20B%2C%201%2C%20Main%20Rd");
  });

  it("only https photos are shown, each once, twelve at most", () => {
    expect(sitePhotos(["https://a.test/1.jpg", " https://a.test/1.jpg ", "http://a.test/2.jpg", "javascript:alert(1)", "https://a.test/3.jpg\" onerror=\"x"])).toEqual(["https://a.test/1.jpg"]);
    expect(sitePhotos(Array.from({ length: 20 }, (_, i) => `https://a.test/${i}.jpg`))).toHaveLength(12);
    expect(sitePhotos(null)).toEqual([]);
  });

  it("a ticked section with nothing in it is left out; the buttons follow what answers today", () => {
    const d = site();
    expect(siteBlocks(d).map((b) => b.key)).toEqual(["about", "menu", "offers", "gallery", "reviews", "contact"]);
    expect(siteBlocks(site({ menu: [], photos: [], reviews: [] })).map((b) => b.key)).toEqual(["about", "offers", "contact"]);
    expect(siteActions(d).map((a) => a.key)).toEqual(["order", "reserve"]);
    expect(siteActions(d)[0].href).toBe("/dine/anjappar?tab=order");
    const resort = site({ type: "resort", can: { order: true, reserve: false, queue: false, book: true } });
    expect(siteActions(resort).map((a) => a.key)).toEqual(["book", "order"]);
    expect(siteActions(site({ can: { order: false, reserve: false, queue: false, book: false } }))).toEqual([]);
  });

  it("the description is the About cut at a word, and the search data names the right kind of place", () => {
    // a short line of the owner's is followed by the facts a searcher wants
    expect(siteDescription(site())).toBe("Chettinad, since 1964. Anjappar is a Chettinad restaurant in Madurai. Open 11 am–11 pm. See the menu with prices, order online, book a table.");
    expect(siteDescription(site({ tagline: null }))).toMatch(/^Anjappar is a Chettinad restaurant in Madurai\./);
    const long = siteDescription(site({ about: "word ".repeat(80) }));
    expect(long.length).toBeLessThanOrEqual(160); expect(long.endsWith("…")).toBe(true); expect(long).not.toMatch(/wor…$/);
    const r = websiteLd(site(), "https://x.test/site/anjappar");
    expect(r).toMatchObject({ "@type": "Restaurant", servesCuisine: ["Chettinad"], openingHours: "Mo-Su 11:00-23:00", acceptsReservations: true, hasMenu: { "@type": "Menu", url: "https://x.test/site/anjappar#menu" } });
    const h = websiteLd(site({ type: "resort", rooms: [{ name: "Villa", base_rate: 9000, capacity: 2, amenities: null }, { name: "Room", base_rate: 4500, capacity: 2, amenities: null }] }), "https://x.test/site/a");
    expect(h).toMatchObject({ "@type": "Resort", checkinTime: "14:00", checkoutTime: "11:00", priceRange: "From ₹4500 a night" });
    expect(h.servesCuisine).toBeUndefined();
  });
  it("leads with dishes that have a photo, a category at a time", () => {
    const dish = (name: string, image_url: string | null, image_credit: string | null = null) => ({ name, price: 100, is_veg: true, description: null, image_url, image_credit, from: null });
    const d = site({ menu: [
      { name: "Starters", items: [dish("A", "https://x.test/a.jpg"), dish("B", null), dish("C", "https://x.test/c.jpg", "Photo: someone")] },
      { name: "Mains", items: [dish("D", "http://x.test/d.jpg"), dish("E", "https://x.test/e.jpg")] },
      { name: "Sweets", items: [dish("F", "javascript:alert(1)")] },
    ] });
    expect(siteSignature(d).map((m) => m.name)).toEqual(["A", "E", "C"]);            // no photo, http and a script address are left out
    expect(siteSignature(d)[1]).toMatchObject({ category: "Mains" });
    expect(siteSignature(d)[2].image_credit).toBe("Photo: someone");                // a library photo keeps its credit
    expect(siteSignature(d, 2)).toHaveLength(2);
    expect(siteSignature(site({ menu: [] }))).toEqual([]);
  });
  it("picks the word the showcase sets large", () => {
    expect(siteShowWord("Chicken Dum Biryani")).toBe("Biryani");
    expect(siteShowWord("Chicken 65")).toBe("Chicken");                            // a number is not the word
    expect(siteShowWord("Ghee Roast Dosa")).toBe("Dosa");
    expect(siteShowWord("Idli (2 pcs)")).toBe("Idli");                              // a short tail gives way to the longest word
    expect(siteShowWord("Vegetable Manchurian Supreme Special")).toBe("Special");
    expect(siteShowWord("Thiruvananthapuram")).toHaveLength(12);
    expect(siteShowWord("65")).toBe("65");
  });
});

describe("found and shared (2026-11-16)", () => {
  it("the title says what guests type next, and never says the kind twice", () => {
    expect(siteTitle(site())).toBe("Anjappar — Chettinad restaurant in Madurai");
    expect(siteTitle(site({ cuisines: null, district: null }))).toBe("Anjappar — Restaurant");
    expect(siteTitle(site({ type: "hotel", name: "Hotel Temple View" }))).toBe("Hotel Temple View — Rooms & rates in Madurai");
    expect(siteTitle(site({ type: "resort", name: "Tan" }))).toBe("Tan — Resort in Madurai");
    expect(siteTitle(site({ name: "A".repeat(66) })).length).toBeLessThanOrEqual(76);
  });

  it("search words come from the property's own cuisines, rooms and town — by kind", () => {
    const r = siteKeywords(site());
    expect(r).toContain("chettinad restaurant in madurai"); expect(r).toContain("restaurants in madurai"); expect(r).toContain("anjappar menu");
    expect(r.length).toBeLessThanOrEqual(12); expect(new Set(r).size).toBe(r.length);
    const h = siteKeywords(site({ type: "resort", rooms: [{ name: "Beach villa", base_rate: 9000, capacity: 2, amenities: null }], facilities: [{ name: "Kayaking", kind: "activity", rate: 0, minutes: 0 }], can: { order: false, reserve: false, queue: false, book: true } }));
    expect(h).toContain("resorts in madurai"); expect(h).toContain("beach villa"); expect(h).toContain("kayaking"); expect(h).not.toContain("restaurants in madurai");
  });

  it("the questions are answered from the property's own records, kind by kind", () => {
    const q = siteFaq(site()).map((f) => f.q);
    expect(q).toContain("What are the opening hours of Anjappar?"); expect(q).toContain("Can I order online from Anjappar?"); expect(q).toContain("Can I book a table at Anjappar?");
    expect(siteFaq(site()).find((f) => /opening hours/.test(f.q))!.a).toBe("Anjappar is open every day from 11 am to 11 pm.");
    expect(q.some((x) => /vegetarian/.test(x))).toBe(false);                       // the one dish is not vegetarian: nothing is claimed
    const hotel = siteFaq(site({ type: "hotel", rooms: [{ name: "Deluxe", base_rate: 3500, capacity: 2, amenities: null }], can: { order: false, reserve: false, queue: false, book: true } }));
    expect(hotel.find((f) => /How much is a room/.test(f.q))!.a).toBe("Rooms start at ₹3,500 a night, before taxes.");
    expect(hotel.find((f) => /check-in/.test(f.q))!.a).toBe("Check-in is from 2 pm and check-out is by 11 am.");
    expect(hotel.some((f) => /order online/.test(f.q))).toBe(false);
    expect(siteFaq(site({ address: null, phone: null, opens_at: null, cuisines: null, price_for_two: null, can: { order: false, reserve: false, queue: false, book: false } }))).toEqual([]);
  });

  it("the address is set as lines, takes the pincode once, and the map follows the pin when there is one", () => {
    expect(siteAddress(site({ address: "12, West Masi Street, near the tank, Madurai", pincode: "625001" }))).toEqual({ head: "12, West Masi Street", rest: "near the tank, Madurai – 625001", full: "12, West Masi Street, near the tank, Madurai – 625001" });
    expect(siteAddress(site({ address: "Beach Road, Kovalam 603112", pincode: "603 112" }))!.full).toBe("Beach Road, Kovalam 603112");
    expect(siteAddress(site({ address: "  " }))).toBeNull();
    expect(sitePin(site({ lat: 9.9195, lng: 78.1193 }))).toEqual({ lat: 9.9195, lng: 78.1193 });
    expect(sitePin(site({ lat: 0, lng: 0 }))).toBeNull(); expect(sitePin(site({ lat: 91, lng: 10 }))).toBeNull(); expect(sitePin(site())).toBeNull();
    expect(pinLabel({ lat: 9.9195, lng: 78.1193 })).toBe("9.9195° N · 78.1193° E");
    expect(mapEmbedUrl(site())).toBe("https://www.google.com/maps?q=Anjappar%2C%2012%20Main%20Rd&z=15&output=embed");
    expect(mapEmbedUrl(site({ lat: 9.9195, lng: 78.1193 }))).toBe("https://www.google.com/maps?q=9.9195%2C78.1193&z=16&output=embed");
    expect(directionsUrl(site({ lat: 9.9195, lng: 78.1193 }))).toBe("https://www.google.com/maps/dir/?api=1&destination=9.9195%2C78.1193");
    expect(mapEmbedUrl(site({ address: null }))).toBeNull(); expect(directionsUrl(site({ address: null }))).toBeNull();
    expect(placeUrl(site({ links: { google: "https://maps.app.goo.gl/abc" } }))).toBe("https://maps.app.goo.gl/abc");
    expect(waHref("91 98765-43210", "Hi & hello")).toBe("https://wa.me/919876543210?text=Hi%20%26%20hello");
  });

  it("the search data is one graph: the place with its pin, links and menu; the page; the questions", () => {
    const d = site({ lat: 9.9195, lng: 78.1193, pincode: "625001", email: "hi@anjappar.test", links: { instagram: "https://www.instagram.com/anjappar", google: "https://maps.app.goo.gl/abc" } });
    const g = siteGraph(d, "https://x.test/site/anjappar")["@graph"] as Record<string, unknown>[];
    expect(g.map((n) => n["@type"])).toEqual(["Restaurant", "WebSite", "WebPage", "FAQPage"]);
    expect(g[0]).toMatchObject({ "@id": "https://x.test/site/anjappar#place", geo: { latitude: 9.9195, longitude: 78.1193 }, hasMap: "https://maps.app.goo.gl/abc", email: "hi@anjappar.test",
      sameAs: ["https://www.instagram.com/anjappar", "https://maps.app.goo.gl/abc"], address: { postalCode: "625001", addressLocality: "Madurai" } });
    expect(g[0]["@context"]).toBeUndefined();
    expect((g[0].potentialAction as { target: string }[]).map((a) => a.target)).toEqual(["https://x.test/dine/anjappar?tab=order", "https://x.test/dine/anjappar?tab=book"]);
    const menu = g[0].hasMenu as { hasMenuSection: { name: string; hasMenuItem: { name: string; offers: { price: number; priceCurrency: string } }[] }[] };
    expect(menu.hasMenuSection[0]).toMatchObject({ name: "Mains", hasMenuItem: [{ name: "Biryani", offers: { price: 280, priceCurrency: "INR" } }] });
    expect(g[2]).toMatchObject({ name: "Anjappar — Chettinad restaurant in Madurai", about: { "@id": "https://x.test/site/anjappar#place" } });
    // too few questions: no FAQPage is claimed
    const bare = siteGraph(site({ address: null, phone: null, opens_at: null, cuisines: null, price_for_two: null, can: { order: false, reserve: false, queue: false, book: false } }), "https://x.test/site/a")["@graph"] as Record<string, unknown>[];
    expect(bare.map((n) => n["@type"])).toEqual(["Restaurant", "WebSite", "WebPage"]);
  });

  it("links: a name becomes its address, a number its digits; another site's address is refused with a reason", () => {
    expect(websiteLinks({ instagram: "@anjappar.mdu", facebook: "anjappar", youtube: "@anjappar", whatsapp: "098765 43210", google: "https://maps.app.goo.gl/AbC123" })).toEqual({ errors: {}, links: {
      instagram: "https://www.instagram.com/anjappar.mdu", facebook: "https://www.facebook.com/anjappar", youtube: "https://www.youtube.com/@anjappar", whatsapp: "919876543210", google: "https://maps.app.goo.gl/AbC123" } });
    expect(websiteLinks({ instagram: "http://instagram.com/anjappar/?igshid=abc" }).links.instagram).toBe("https://instagram.com/anjappar");
    expect(websiteLinks({ instagram: "  ", facebook: null }).links).toEqual({});
    const bad = websiteLinks({ instagram: "https://evil.test/instagram.com/x", facebook: "javascript:alert(1)", whatsapp: "12345", google: "https://bit.ly/x", youtube: "https://www.youtube.com/@a b" });
    expect(bad.links).toEqual({}); expect(Object.keys(bad.errors).sort()).toEqual(["facebook", "google", "instagram", "whatsapp", "youtube"]);
    // the database's wall names the same hosts (0185 _website_links)
    const sql = readFileSync(resolve(__dirname, "../../../supabase/migrations/0185_websites.sql"), "utf8");
    for (const host of ["instagram[.]com", "facebook[.]com", "youtube[.]com", "youtu[.]be", "maps[.]app[.]goo[.]gl", "g[.]page"]) expect(sql, host).toContain(host);
  });

  it("reach is judged by the kind of place, and what the website does itself is always done", () => {
    const by = (rows: ReturnType<typeof websiteReach>) => Object.fromEntries(rows.map((r) => [r.key, r]));
    const r = by(websiteReach(setup()));
    for (const k of ["title", "schema", "faq", "sitemap", "card"]) expect(r[k], k).toMatchObject({ auto: true, done: true });
    expect(r.title.detail).toBe("“Anjappar — Chettinad restaurant in Madurai”");
    expect(r.cuisines.done).toBe(true); expect(r.hours.done).toBe(true); expect(r.logo).toMatchObject({ done: false, fix: { href: "/settings" } });
    expect(r.pin).toMatchObject({ done: false, detail: "The map uses your address" }); expect(r.fssai.done).toBe(false); expect(r.order.done).toBe(true);
    expect(r.instagram).toMatchObject({ done: false }); expect(r.instagram.fix).toBeUndefined();                    // typed in the website's own dialog
    expect(r.rooms).toBeUndefined(); expect(r.book).toBeUndefined();
    const linked = by(websiteReach(setup({ site: { sections: ["about"], headline: null, about: null, email: null, links: { instagram: "https://www.instagram.com/a", whatsapp: "919876543210" }, published: true, created_at: "", updated_at: "" } })));
    expect(linked.instagram.done).toBe(true); expect(linked.whatsapp.done).toBe(true); expect(linked.facebook.done).toBe(false);
    const resort = by(websiteReach(setup({ type: "resort", cuisines: [], room_types: 3, facilities: 4, dishes: 0, has_stay_times: true })));
    expect(resort.rooms.done).toBe(true); expect(resort.stay.done).toBe(true); expect(resort.facilities.done).toBe(true); expect(resort.book.done).toBe(true);
    expect(resort.cuisines).toBeUndefined(); expect(resort.hours).toBeUndefined(); expect(resort.fssai).toBeUndefined(); expect(resort.schema.detail).toMatch(/^Resort/);
    expect(by(websiteReach(setup({ type: "hotel", room_types: 2 }))).facilities).toBeUndefined();
  });

  it("ready posts carry the link and the town's hashtags, and claim nothing the property has not said", () => {
    const k = websitePosts(setup(), "https://x.test/site/anjappar");
    expect(k.posts).toHaveLength(3); for (const p of k.posts) { expect(p.text).toContain("https://x.test/site/anjappar"); expect(p.text).not.toMatch(/best|award|no\.? ?1/i); }
    expect(k.posts[1].title).toBe("Order direct");
    expect(k.tags).toEqual(["#Anjappar", "#Madurai", "#MaduraiFood", "#MaduraiFoodie", "#Chettinad", "#MaduraiRestaurants", "#FoodLovers"]);
    const h = websitePosts(setup({ type: "resort", name: "Tan Resort & Spa", district: "Kanyakumari", cuisines: [], room_types: 3 }), "https://x.test/site/tan");
    expect(h.posts[1].title).toBe("Book direct"); expect(h.tags).toContain("#TanResortAndSpa"); expect(h.tags).toContain("#KanyakumariResort");
    expect(websitePosts(setup({ district: null }), "u").tags.every((t) => t.length > 2)).toBe(true);
  });
});

describe("extras the client chose (eighth pass)", () => {
  it("nothing chosen is nothing kept; a switch that is off is left out", () => {
    expect(websiteOptions({})).toEqual({ options: {}, errors: {} });
    expect(websiteOptions({ enquiry: false, stats: false, offer_popup: false, review_url: " ", banner_text: "" }).options).toEqual({});
    expect(websiteOptions({ enquiry: true, stats: true, offer_popup: true }).options).toEqual({ enquiry: true, stats: true, offer_popup: true });
    expect(websiteExtrasOn({})).toBe(0); expect(websiteExtrasOn(null)).toBe(0);
    expect(websiteExtrasOn({ enquiry: true, stats: true, banner_text: "x", review_url: "https://g.page/r/abc/review" })).toBe(4);
    expect(WEBSITE_EXTRAS.map((x) => x.key)).toEqual(["review", "enquiry", "banner", "offer_popup", "stats", "look", "lang", "video", "insta", "model"]);
  });

  it("a review link is Google's own or it is refused; the page checks it again where it is used", () => {
    for (const u of ["https://g.page/r/CabC-123/review", "https://search.google.com/local/writereview?placeid=ChIJabc", "https://maps.app.goo.gl/AbC123"]) { expect(isReviewUrl(u), u).toBe(true); expect(websiteOptions({ review_url: u }).options.review_url).toBe(u); }
    expect(websiteOptions({ review_url: "g.page/r/abc/review" }).options.review_url).toBe("https://g.page/r/abc/review");
    for (const u of ["https://evil.test/g.page/r/x", "javascript:alert(1)", "https://g.page/r/x\" onclick=\"y", "https://g.page.evil.test/r/x", "http://g.page/r/abc/review "]) expect(isReviewUrl(u), u).toBe(false);
    expect(websiteOptions({ review_url: "https://bit.ly/x" })).toMatchObject({ options: {}, errors: { review: expect.stringMatching(/review link/) } });
    expect(reviewUrl(site({ options: { review_url: "https://g.page/r/abc/review" } }))).toBe("https://g.page/r/abc/review");
    expect(reviewUrl(site({ options: { review_url: "https://evil.test/x" } }))).toBeNull(); expect(reviewUrl(site())).toBeNull();
  });

  it("an announcement is one plain line, shown through its last day in India and not after", () => {
    expect(websiteOptions({ banner_text: "  Pongal   <b>special</b> all week  ", banner_until: "2027-01-20" }).options).toEqual({ banner_text: "Pongal bspecial/b all week", banner_until: "2027-01-20" });
    expect(websiteOptions({ banner_text: "x".repeat(200) }).options.banner_text).toHaveLength(90);
    expect(websiteOptions({ banner_text: "Open late", banner_until: "next week" }).errors.banner).toBeTruthy();
    expect(websiteOptions({ banner_until: "2027-01-20" }).options).toEqual({});                       // a date with no line is nothing
    const d = site({ options: { banner_text: "Pongal special", banner_until: "2027-01-15" } });
    expect(siteBanner(d, new Date("2027-01-15T18:25:00Z"))).toBe("Pongal special");                   // 23:55 on the 15th in India
    expect(siteBanner(d, new Date("2027-01-15T18:35:00Z"))).toBeNull();                               // 00:05 on the 16th
    expect(siteBanner(site({ options: { banner_text: "Always on" } }))).toBe("Always on");
    expect(siteBanner(site())).toBeNull(); expect(siteBanner(site({ options: null }))).toBeNull();
    expect(istDay(new Date("2026-11-16T19:00:00Z"))).toBe("2026-11-17");
  });

  it("the kinds the page counts are the kinds the database accepts (0185 website_hits)", () => {
    const sql = readFileSync(resolve(__dirname, "../../../supabase/migrations/0185_websites.sql"), "utf8");
    const lists = [...sql.matchAll(/kind (?:not )?in (([^)]*))/g)].map((m) => [...m[1].matchAll(/'([a-z]+)'/g)].map((x) => x[1]));
    expect(lists.length).toBeGreaterThanOrEqual(2);
    for (const l of lists) expect(l).toEqual([...WEBSITE_HIT_KINDS]);
  });

  it("reach counts the review button once the link is there", () => {
    const row = (o: object) => websiteReach(setup({ site: { sections: ["about"], headline: null, about: null, email: null, links: {}, options: o, published: true, created_at: "", updated_at: "" } })).find((r) => r.key === "review")!;
    expect(row({}).done).toBe(false); expect(row({ review_url: "https://g.page/r/abc/review" }).done).toBe(true); expect(row({ review_url: "https://evil.test/x" }).done).toBe(false);
  });
});
