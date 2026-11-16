// TEMPORARY probe fixture data — deleted before commit. Made-up places (no database).
import type { SiteData } from "@/lib/website";
import { photoAt } from "@/lib/dishPhotos";

const W = "https://upload.wikimedia.org/wikipedia/commons/";
const P = {
  c65: W + "d/d7/Chicken_65.jpg", paneer: W + "f/f2/Paneer_tikka.jpg", manch: W + "b/bb/Chicken_Manchurian_%28Hyderabad_Style%29_%2811960049916%29.jpg",
  biryani: W + "7/7c/Hyderabadi_Chicken_Biryani.jpg", dum: W + "5/5a/%22Hyderabadi_Dum_Biryani%22.jpg", dosa: W + "b/ba/Masala_Dosa_2023.jpg", idli: W + "1/11/Idli_Sambar.JPG",
  kothu: W + "a/a3/Chicken_Kottu.jpg", jamun: W + "c/c1/Gulab-jamun-wallpaper-1.jpg", kheer: W + "4/46/Kheer.jpg", vada: W + "0/0c/Medu_Vadas.JPG", butter: W + "4/41/Butter_Chicken_%26_Butter_Naan_-_Home_-_Chandigarh_-_India_-_0006.jpg",
  parotta: W + "0/03/Malabar_Porotta_%28cropped%29.jpg",
};
const big = (u: string) => photoAt(u, 1280);
const PLACE = {
  restaurant: [W + "6/62/Barbieri_-_ViaSophia25668.jpg", P.dum, P.dosa, P.butter, P.paneer].map(big),
  hotel: [W + "3/36/Livorno_-_Hotel_Palazzo_-_2025-09-29_20-09-38_001.jpg", W + "0/07/Hotel-suite-living-room.jpg", W + "b/b6/Apartment_building_lobby.jpg", W + "e/e4/SkyPark_Infinity_Pool_%28view_from_deckchair%29.jpg", W + "9/92/Backyardpool.jpg"].map(big),
  resort: [W + "e/e4/SkyPark_Infinity_Pool_%28view_from_deckchair%29.jpg", W + "0/07/Hotel-suite-living-room.jpg", W + "7/73/Beach_at_Fort_Lauderdale.jpg", W + "4/43/Woman_kayaking_on_a_turquoise_lake_%2851125937521%29.jpg", W + "9/92/Backyardpool.jpg", W + "f/f4/Pyramid_resort_jasper.JPG"].map(big),
};
const lib = "Photo: Wikimedia Commons (CC BY-SA)";
const dish = (name: string, price: number, is_veg: boolean, description: string | null = null, image_url: string | null = null, from: number | null = null, own = false) => ({ name, price, is_veg, description, image_url, image_credit: image_url && !own ? lib : null, from });
const MENU = [
  { name: "Starters", items: [dish("Chicken 65", 220, false, "Fried, with curry leaves and green chilli", P.c65), dish("Paneer tikka", 240, true, "Charred in the tandoor", P.paneer, null, true), dish("Gobi manchurian", 180, true, null, P.manch), dish("Mutton sukka", 320, false, "Dry-roasted with black pepper"), dish("Masala vadai", 90, true, null, P.vada), dish("Prawn pepper fry", 360, false), dish("Butter chicken", 300, false, "Slow-cooked in tomato and butter", P.butter), dish("Egg podimas", 120, false)] },
  { name: "Biryani", items: [dish("Chicken dum biryani", 260, false, "Seeraga samba rice, cooked on dum", P.dum, 180, true), dish("Mutton biryani", 340, false, null, P.biryani, 240), dish("Veg biryani", 200, true)] },
  { name: "Tiffin", items: [dish("Ghee roast dosa", 120, true, null, P.dosa), dish("Idli (2)", 50, true, "With sambar and three chutneys", P.idli), dish("Kothu parotta", 170, false, null, P.kothu), dish("Malabar parotta", 60, true, null, P.parotta), dish("A very long dish name that keeps going to see how the row wraps on a narrow phone screen", 150, true, "And a long description that should clamp at two lines however much is written here about the dish and how it is made in the kitchen every single morning before the doors open")] },
  { name: "Desserts", items: [dish("Gulab jamun", 80, true, null, P.jamun), dish("Elaneer payasam", 110, true, null, P.kheer)] },
];
const REVIEWS = [
  { guest: "Ravi K", rating: 5, body: "The biryani is the best in town. Quick service, clean place.", reply: "Thank you Ravi — see you again.", at: "2026-11-01" },
  { guest: null, rating: 4, body: "Good food, a little crowded on Sunday.", reply: null, at: "2026-10-28" },
  { guest: "Meena", rating: 5, body: "Loved the sea-view suite and the breakfast. The staff remembered our names by the second morning, which says everything.", reply: null, at: "2026-10-20" },
];
const base = { demo: false, logo_url: null, rating: 4.5, rating_count: 128, address: "12, West Masi Street, near the temple tank, Madurai, Tamil Nadu 625001", district: "Madurai", phone: "+91 98765 43210", updated_at: "2026-11-14T00:00:00Z", photos: null as string[] | null,
  pincode: "625001" as string | null, lat: 9.9195 as number | null, lng: 78.1193 as number | null, fssai_no: "12419012001234" as string | null, email: "hello@example.in" as string | null,
  links: { instagram: "https://www.instagram.com/example", facebook: "https://www.facebook.com/example", youtube: "https://www.youtube.com/@example", whatsapp: "919876543210", google: "https://maps.app.goo.gl/example" } as SiteData["links"] };
const DATA: Record<string, SiteData> = {
  restaurant: { ...base, slug: "zz-probe", name: "Anjappar Chettinad", type: "restaurant", tagline: "Fiery Chettinad, cooked on wood fire", headline: null,
    about: "Three generations of the same family have cooked here.\n\nWe grind our own masalas every morning and cook the biryani on dum, the slow way. Come hungry.", cuisines: ["Chettinad", "South Indian", "Biryani"], price_for_two: 600,
    opens_at: "11:00:00", closes_at: "23:00:00", check_in_time: null, check_out_time: null, sections: ["about", "menu", "order", "reserve", "queue", "offers", "gallery", "reviews", "contact"],
    can: { order: true, reserve: true, queue: true, book: false }, menu: MENU, rooms: [], facilities: [],
    offers: [{ title: "15% off lunch", kind: "percent", value: 15, min_order: 500, code: "LUNCH15" }, { title: "Free dessert on weekends", kind: "flat", value: 0, min_order: 0, code: null }], reviews: REVIEWS },
  hotel: { ...base, slug: "zz-probe", name: "Hotel Temple View", type: "hotel", tagline: "A quiet stay in the heart of Madurai", headline: null, about: "Forty rooms, a rooftop restaurant and a five-minute walk to the temple.", cuisines: null, price_for_two: null,
    opens_at: null, closes_at: null, check_in_time: "14:00:00", check_out_time: "11:00:00", sections: ["about", "rooms", "book", "menu", "reserve", "gallery", "reviews", "contact"], can: { order: false, reserve: true, queue: false, book: true },
    menu: MENU.slice(0, 2), rooms: [{ name: "Deluxe room", base_rate: 3500, capacity: 2, amenities: ["AC", "WiFi", "Breakfast", "TV"] }, { name: "Sea-view suite", base_rate: 7200, capacity: 3, amenities: ["AC", "WiFi", "Breakfast", "Balcony", "Bathtub", "Mini bar"] }], facilities: [], offers: [], reviews: REVIEWS },
  resort: { ...base, slug: "zz-probe", name: "Tan Resort & Spa", type: "resort", tagline: "Palms, a private beach and nothing to do", headline: "Wake up to the sea", about: "Twelve villas on a private beach, an hour from the city.\n\nSwim, kayak, eat fish caught that morning.", cuisines: null, price_for_two: null,
    opens_at: null, closes_at: null, check_in_time: "13:00:00", check_out_time: "11:00:00", sections: ["about", "rooms", "book", "facilities", "menu", "order", "reserve", "offers", "gallery", "reviews", "contact"], can: { order: true, reserve: true, queue: false, book: true },
    menu: MENU, rooms: [{ name: "Garden villa", base_rate: 6500, capacity: 2, amenities: ["AC", "WiFi", "Breakfast"] }, { name: "Beach villa", base_rate: 9800, capacity: 3, amenities: ["AC", "WiFi", "Breakfast", "Private deck"] }, { name: "Family pool villa", base_rate: 14500, capacity: 5, amenities: ["AC", "WiFi", "All meals", "Private pool"] }],
    facilities: [{ name: "Infinity pool", kind: "pool", rate: 0, minutes: 0 }, { name: "Ayurvedic spa", kind: "spa", rate: 2500, minutes: 60 }, { name: "Kayaking", kind: "activity", rate: 800, minutes: 45 }, { name: "Sunset cruise", kind: "activity", rate: 1500, minutes: 90 }, { name: "Yoga deck", kind: "activity", rate: 0, minutes: 60 }],
    offers: [{ title: "Stay 3, pay 2", kind: "flat", value: 0, min_order: 0, code: "LONGSTAY" }], reviews: REVIEWS },
};
export type Q = { kind?: string; bare?: string; photo?: string; logo?: string; plain?: string; extras?: string; stats?: string; old?: string; more?: string; look?: string; lang?: string; langs?: string };
export function pick(q: Q): SiteData {
  const kind = (q.kind && DATA[q.kind] ? q.kind : "restaurant") as keyof typeof PLACE;
  let d = DATA[kind];
  if (q.photo) d = { ...d, photos: PLACE[kind] };
  if (q.logo) d = { ...d, logo_url: photoAt(P.jamun, 330) };
  if (q.plain) d = { ...d, pincode: null, lat: null, lng: null, fssai_no: null, email: null, links: null };
  // the extras a client can switch on: all of them, only the count, or an announcement whose last day has passed
  if (q.extras) d = { ...d, options: { review_url: "https://g.page/r/CabC-123/review", enquiry: true, banner_text: "Pongal special: sakkarai pongal all this week", banner_until: "2099-01-20", offer_popup: true, stats: true } };
  if (q.stats) d = { ...d, options: { stats: true } };
  if (q.old) d = { ...d, options: { banner_text: "Last year's festival", banner_until: "2020-01-01", review_url: "https://evil.test/review", enquiry: true }, links: { ...(d.links ?? {}), whatsapp: undefined } };
  // ninth pass: rooms with their own photos, Instagram posts, a film and a 3D dish (files that do not exist — the page must not mind), a look
  const FILE = (n: string) => `https://probe.supabase.co/storage/v1/object/public/site/11111111-2222-3333-4444-555555555555/${n}`;
  if (q.more) d = { ...d, rooms: d.rooms.map((r, i) => ({ ...r, photos: i === 0 ? PLACE.hotel.slice(1, 4) : i === 1 ? [PLACE.resort[1]] : [] })),
    options: { ...(d.options ?? {}), insta_1: "https://www.instagram.com/p/CabCdEf123/", insta_2: "https://www.instagram.com/reel/Cxyz_987-A/", video_url: FILE("video-abc.mp4"), model_url: FILE("model-abc.glb"), model_name: "Chicken dum biryani" } };
  if (q.look === "calm" || q.look === "day") d = { ...d, options: { ...(d.options ?? {}), look: q.look } };
  if (q.langs || q.lang) d = { ...d, options: { ...(d.options ?? {}), lang_ta: true, lang_hi: true } };
  if (q.bare) d = { ...d, tagline: null, about: null, headline: null, rating: null, rating_count: null, address: null, cuisines: null, price_for_two: null, offers: [], reviews: [], can: { order: false, reserve: false, queue: false, book: false }, menu: [{ name: "Menu", items: [dish("Tea", 15, true)] }] };
  return d;
}
