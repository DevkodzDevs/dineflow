// TEMPORARY probe harness — deleted before commit. Renders Settings → Website card on made-up checklists (no sign-in, no database).
import { WebsiteCard } from "@/app/(app)/settings/WebsiteCard";
import { WEBSITE_SECTIONS, WEBSITE_PLAN_KEYS, WEBSITE_PLAN_DEFAULTS, type WebsiteSetup, type WebsiteStats, type WebsitePlan, type WebsitePlanKey } from "@dineflow/shared";

const base = { feature: true, listed: true, dining: true, delivery: true, takeaway: false, booking_engine: true, has_tagline: true, has_address: true, has_phone: true, has_logo: false,
  district: "Madurai" as string | null, cuisines: ["Chettinad", "Biryani"], has_pincode: false, has_pin: false, has_hours: true, has_stay_times: true, has_fssai: false, photos: 4, dishes: 16, room_types: 0, facilities: 0, offers: 1, reviews: 3, site: null as WebsiteSetup["site"] };
const site = (over: Partial<NonNullable<WebsiteSetup["site"]>> = {}): NonNullable<WebsiteSetup["site"]> => ({ sections: ["about", "menu", "order", "offers", "gallery", "contact"], headline: "Fiery Chettinad, cooked on wood fire", about: "Three generations of one family.", email: null, links: {},
  published: true, created_at: "2026-11-14T00:00:00Z", updated_at: "2026-11-16T00:00:00Z", ...over });

const PRICE: Record<string, [number | null, number | null]> = { basic: [0, null], standard: [499, 4999], premium: [999, 9999], elite: [null, null] };
const PLANS: WebsitePlan[] = WEBSITE_PLAN_KEYS.map((key) => ({ key, label: WEBSITE_PLAN_DEFAULTS[key].label, price_month: PRICE[key][0], price_year: PRICE[key][1], features: [...WEBSITE_PLAN_DEFAULTS[key].features] }));

export default async function Harness({ searchParams }: { searchParams: Promise<{ kind?: string; state?: string; owner?: string; plan?: string }> }) {
  const q = await searchParams, kind = (q.kind === "resort" || q.kind === "hotel" ? q.kind : "restaurant") as WebsiteSetup["type"], state = q.state ?? "none";
  let setup: WebsiteSetup = { ...base, type: kind, slug: "anjappar", name: kind === "restaurant" ? "Anjappar Chettinad" : kind === "hotel" ? "Hotel Temple View" : "Tan Resort & Spa", allowed: [...WEBSITE_SECTIONS[kind]],
    ...(kind === "restaurant" ? {} : { room_types: 3, cuisines: [] }), ...(kind === "resort" ? { facilities: 4 } : {}) };
  // a resort with gaps: no photos, reviews, offers or facilities; ordering, table booking and the booking page switched off
  if (state === "gaps") setup = { ...setup, slug: null, photos: 0, reviews: 0, offers: 0, facilities: 0, delivery: false, dining: false, booking_engine: false };
  if (state === "live") setup = { ...setup, site: site() };
  if (state === "hidden") setup = { ...setup, site: site({ published: false }) };
  // everything a place can give: a logo, a pin, a pincode, the licence, every link
  if (state === "full") setup = { ...setup, has_logo: true, has_pin: true, has_pincode: true, has_fssai: true, site: site({ email: "hello@example.in", links: { whatsapp: "919876543210", instagram: "https://www.instagram.com/example", facebook: "https://www.facebook.com/example", youtube: "https://www.youtube.com/@example", google: "https://maps.app.goo.gl/example" }, options: { review_url: "https://g.page/r/CabC-123/review" } }) };
  // the client's own choices switched on, with a month of counts
  let stats: WebsiteStats | null = null;
  if (state === "extras") { setup = { ...setup, site: site({ links: { whatsapp: "919876543210" }, options: { review_url: "https://g.page/r/CabC-123/review", enquiry: true, banner_text: "Pongal special all this week", banner_until: "2099-01-20", offer_popup: true, stats: true } }) };
    stats = { days: 30, total: { view: 1412, call: 23, order: 9, directions: 31, whatsapp: 1, dish: 88 }, views: [] }; }
  // the files a property has added: gallery photos, room photos, a film, a 3D dish, a look, its own domain
  const FILE = (n: string) => `https://probe.supabase.co/storage/v1/object/public/site/11111111-2222-3333-4444-555555555555/${n}`;
  if (state === "media") setup = { ...setup, photo_list: ["https://upload.wikimedia.org/wikipedia/commons/thumb/b/ba/Masala_Dosa_2023.jpg/330px-Masala_Dosa_2023.jpg", FILE("photo-a.webp")],
    room_list: kind === "restaurant" ? [] : [{ id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", name: "Deluxe room", photos: [FILE("room-a.webp")] }, { id: "aaaaaaaa-bbbb-cccc-dddd-ffffffffffff", name: "Sea-view suite", photos: [] }],
    site: site({ domain: "www.example-cafe.com", options: { look: "day", lang_ta: true, video_url: FILE("video-a.mp4"), model_url: FILE("model-a.glb"), model_name: "Chicken dum biryani", insta_1: "https://www.instagram.com/p/CabCdEf123" } }) };
  if (state === "counting") setup = { ...setup, site: site({ options: { stats: true } }) };
  // the website plan the property is on (elite unless the address says otherwise), and the price list
  const plan = (WEBSITE_PLAN_KEYS.includes(q.plan as WebsitePlanKey) ? q.plan : "elite") as WebsitePlanKey;
  setup = { ...setup, plan, plans: PLANS, can: [...WEBSITE_PLAN_DEFAULTS[plan].features] };
  return (
    <main className="mx-auto max-w-[760px] p-4 sm:p-8">
      <WebsiteCard setup={state === "unavailable" ? null : setup} available={state !== "unavailable"} base="https://www.dineflow.cloud" owner={q.owner !== "0"} stats={stats} />
    </main>
  );
}
