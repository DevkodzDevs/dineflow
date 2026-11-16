import { describe, it, expect } from "vitest";
import { instaEmbed, isSiteFile, websiteOptions, websiteExtrasOn } from "@dineflow/shared";
import { siteT, sitePair, clientWords, siteLang, siteLangs, faqIn, sagaIn } from "./siteWords";
import { siteFaq, siteLook, siteVideo, siteInsta, siteModel, roomPhotos, type SiteData } from "./website";

const site = (over: Partial<SiteData> = {}): SiteData => ({
  slug: "anjappar", name: "Anjappar", type: "restaurant", demo: false, tagline: null, headline: null, about: null, logo_url: null, cuisines: ["Chettinad"], price_for_two: 600, rating: 4.4, rating_count: 20,
  address: "12 Main Rd", district: "Madurai", phone: "+91 98765 43210", photos: null, opens_at: "11:00:00", closes_at: "23:00:00", check_in_time: "14:00:00", check_out_time: "11:00:00",
  pincode: null, lat: null, lng: null, fssai_no: null, email: null, links: null, sections: ["about", "menu", "contact"], updated_at: "2026-11-16T00:00:00Z", can: { order: true, reserve: true, queue: false, book: false },
  menu: [{ name: "Mains", items: [{ name: "Biryani", price: 280, is_veg: false, description: null, image_url: null, image_credit: null, from: null }, { name: "Dosa", price: 90, is_veg: true, description: null, image_url: null, image_credit: null, from: null }] }],
  rooms: [], facilities: [], offers: [], reviews: [], ...over,
});
const FILE = (n: string) => `https://abc.supabase.co/storage/v1/object/public/site/11111111-2222-3333-4444-555555555555/${n}`;

describe("the page in Tamil or Hindi", () => {
  it("English is every line itself; a line with no entry is shown as it is, never blank", () => {
    expect(siteT("en")("Order online")).toBe("Order online");
    expect(siteT("ta")("Order online")).toBe("ஆன்லைனில் ஆர்டர்"); expect(siteT("hi")("Order online")).toBe("ऑनलाइन ऑर्डर");
    expect(siteT("ta")("A line nobody translated")).toBe("A line nobody translated");
    expect(siteT("ta")("Chicken 65")).toBe("Chicken 65");                                   // what the owner typed is not touched
  });

  it("a two-part heading keeps its two parts", () => {
    expect(sitePair("en")("Our", "story")).toEqual(["Our", "story"]);
    expect(sitePair("ta")("Our", "story")).toEqual(["எங்கள்", "கதை"]); expect(sitePair("hi")("Come", "hungry.")).toEqual(["भूख लेकर", "आइए।"]);
    expect(sitePair("ta")("Unknown", "pair")).toEqual(["Unknown", "pair"]);
    for (const l of ["ta", "hi"] as const) for (const [a, b] of [["Our", "story"], ["The", "menu"], ["Kind", "words"], ["Find our", "table"], ["Your room", "is ready."], ["Questions,", "answered"]]) { const p = sitePair(l)(a, b); expect(p[0].length, `${l} ${a}`).toBeGreaterThan(0); expect(p[1]?.length ?? 0, `${l} ${b}`).toBeGreaterThan(0); }
  });

  it("only a language the client switched on is served; English ships no word table to the browser", () => {
    expect(siteLang("ta", { lang_ta: true })).toBe("ta"); expect(siteLang("hi", { lang_ta: true })).toBe("en"); expect(siteLang("ta", {})).toBe("en"); expect(siteLang("xx", { lang_ta: true, lang_hi: true })).toBe("en"); expect(siteLang(undefined, null)).toBe("en");
    expect(siteLangs({})).toEqual([]); expect(siteLangs({ lang_hi: true })).toEqual(["en", "hi"]); expect(siteLangs({ lang_ta: true, lang_hi: true })).toEqual(["en", "ta", "hi"]);
    expect(clientWords("en")).toEqual({});
    const ta = clientWords("ta"); expect(ta.Close).toBe("மூடு"); expect(Object.keys(ta).length).toBeGreaterThan(35); expect(Object.values(ta).every((v) => typeof v === "string")).toBe(true);
    expect(Object.keys(clientWords("hi"))).toEqual(Object.keys(ta));
  });

  it("the questions say the same facts in each language, and as many of them", () => {
    const d = site(), en = siteFaq(d);
    for (const l of ["ta", "hi"] as const) {
      const f = faqIn(d, l);
      expect(f).toHaveLength(en.length);
      expect(f.every((x) => x.q.includes("Anjappar") && x.a.length > 8)).toBe(true);
      expect(f.some((x) => x.a.includes("11 am") && x.a.includes("11 pm"))).toBe(true);        // the hours
      expect(f.some((x) => x.a.includes("₹600"))).toBe(true);                                  // the cost for two
      expect(f.some((x) => /\b1\b/.test(x.a) && /\b2\b/.test(x.a))).toBe(true);                // 1 of the 2 dishes is vegetarian — counted, not assumed
    }
    const hotel = site({ type: "hotel", rooms: [{ name: "Deluxe", base_rate: 3500, capacity: 2, amenities: null }], can: { order: false, reserve: false, queue: false, book: true } });
    expect(faqIn(hotel, "ta").some((x) => x.a.includes("₹3,500"))).toBe(true); expect(faqIn(hotel, "hi").some((x) => x.a.includes("2 pm"))).toBe(true);
    expect(faqIn(site({ address: null, phone: null, opens_at: null, cuisines: null, price_for_two: null, menu: [], can: { order: false, reserve: false, queue: false, book: false } }), "ta")).toEqual([]);
    expect(sagaIn(d, "ta").length).toBeGreaterThanOrEqual(3); expect(sagaIn(d, "hi").every((l) => l.length === 2)).toBe(true);
  });
});

describe("more extras: the look, a film, Instagram, a dish in 3D, room photos", () => {
  it("a file must be in a property's own folder of the site bucket", () => {
    expect(isSiteFile(FILE("video-abc.mp4"), "mp4|webm")).toBe(true); expect(isSiteFile(FILE("model-1.glb"), "glb")).toBe(true);
    for (const bad of ["https://evil.test/x.mp4", FILE("x.mp4").replace("/site/", "/brand/"), FILE("../x.mp4"), FILE("x.mp4?y=1"), FILE("x.exe"), "javascript:alert(1)", FILE("X Y.mp4"), null]) expect(isSiteFile(bad as string, "mp4|webm"), String(bad)).toBe(false);
    expect(siteVideo(site({ options: { video_url: FILE("v.mp4") } }))).toBe(FILE("v.mp4")); expect(siteVideo(site({ options: { video_url: "https://evil.test/v.mp4" } }))).toBeNull();
    expect(siteModel(site({ options: { model_url: FILE("m.glb"), model_name: " Biryani " } }))).toEqual({ url: FILE("m.glb"), name: "Biryani" });
    expect(siteModel(site({ options: { model_url: FILE("m.glb") } }))!.name).toBe("Our dish"); expect(siteModel(site({ options: { model_url: FILE("m.mp4") } }))).toBeNull();
  });

  it("an Instagram post or reel becomes its own frame's address; anything else is nothing", () => {
    expect(instaEmbed("https://www.instagram.com/p/CabCdEf123/")).toBe("https://www.instagram.com/p/CabCdEf123/embed");
    expect(instaEmbed("https://instagram.com/reel/Cxyz_987-A?igshid=1")).toBe("https://www.instagram.com/reel/Cxyz_987-A/embed");
    expect(instaEmbed("https://www.instagram.com/anjappar/p/CabCdEf123/")).toBe("https://www.instagram.com/p/CabCdEf123/embed");
    for (const bad of ["https://www.instagram.com/anjappar/", "https://evil.test/p/CabCdEf123/", "https://www.instagram.com/p/<script>/", "javascript:alert(1)", "", null]) expect(instaEmbed(bad as string), String(bad)).toBeNull();
    expect(siteInsta(site({ options: { insta_1: "https://www.instagram.com/p/CabCdEf123/", insta_2: "https://evil.test/x", insta_3: "https://www.instagram.com/reel/Cxyz_987-A/" } })).map((p) => p.embed)).toEqual(["https://www.instagram.com/p/CabCdEf123/embed", "https://www.instagram.com/reel/Cxyz_987-A/embed"]);
  });

  it("the owner's choices are tidied, and refused with a reason when they cannot be used", () => {
    const ok = websiteOptions({ look: "day", lang_ta: true, video_url: FILE("v.mp4"), insta: ["http://www.instagram.com/p/CabCdEf123/?utm=1", "", " https://www.instagram.com/reel/Cxyz_987-A/ "], model_url: FILE("m.glb"), model_name: "  Chicken <b>dum</b>  biryani " });
    expect(ok.errors).toEqual({});
    expect(ok.options).toEqual({ look: "day", lang_ta: true, video_url: FILE("v.mp4"), insta_1: "https://www.instagram.com/p/CabCdEf123/", insta_2: "https://www.instagram.com/reel/Cxyz_987-A/", model_url: FILE("m.glb"), model_name: "Chicken bdum/b biryani" });
    expect(websiteExtrasOn(ok.options)).toBe(5);
    expect(websiteOptions({ look: "night" }).options).toEqual({}); expect(websiteOptions({ look: "neon" }).options).toEqual({});
    const bad = websiteOptions({ video_url: "https://youtube.com/watch?v=1", insta: ["https://www.instagram.com/anjappar/"], model_url: "https://evil.test/m.glb" });
    expect(bad.options).toEqual({}); expect(Object.keys(bad.errors).sort()).toEqual(["insta", "model", "video"]);
    expect(siteLook(site())).toBe("night"); expect(siteLook(site({ options: { look: "calm" } }))).toBe("calm"); expect(siteLook(site({ options: { look: "neon" as "calm" } }))).toBe("night");
  });

  it("a room's own photos are https only, six at most", () => {
    expect(roomPhotos({ photos: ["https://a.test/1.jpg", "http://a.test/2.jpg", "javascript:x", "https://a.test/1.jpg"] })).toEqual(["https://a.test/1.jpg"]);
    expect(roomPhotos({ photos: Array.from({ length: 9 }, (_, i) => `https://a.test/${i}.jpg`) })).toHaveLength(6); expect(roomPhotos({})).toEqual([]);
  });
});
