/**
 * The floor's words, in English and — when a device asks for it — Tamil or Hindi under them: the Dining screens, and
 * (0109) the main buttons of Expenses, Checklists, Payroll, Outlets and Staff.
 *
 * A second line, never a replacement: English stays on every button so a manager, a probe and a
 * support call all read the same screen. The choice is the device's (the `df-lang` cookie, like
 * `df-theme`): the till tablet is set once for the people who use it. The translations are short
 * floor words, the way staff say them — have someone on the floor read them before relying on them.
 */
export type Lang = "en" | "ta" | "hi" | "ta-all" | "hi-all";
export const LANG_COOKIE = "df-lang";
/** "ta-all" / "hi-all" (2026-10-18): the whole app in Tamil or Hindi, not a second line —
 *  components/ui/FullLanguage.tsx does the screens, and `say` gives the word alone. */
export const LANGS: { v: Lang; label: string; short: string; hint: string; group: "line" | "all" }[] = [
  { v: "en", label: "English", short: "A", hint: "All English", group: "line" },
  { v: "ta", label: "English + தமிழ்", short: "அ", hint: "Tamil under buttons", group: "line" },
  { v: "hi", label: "English + हिन्दी", short: "अ", hint: "Hindi under buttons", group: "line" },
  // each whole-app choice describes itself in its own script — the menu is never translated, so it can always be read
  { v: "ta-all", label: "தமிழ் — முழுவதும்", short: "த", hint: "எல்லாம் தமிழில்", group: "all" },
  { v: "hi-all", label: "हिन्दी — पूरा ऐप", short: "हि", hint: "सब हिन्दी में", group: "all" },
];
export const readLang = (v: string | null | undefined): Lang => (v === "ta" || v === "hi" || v === "ta-all" || v === "hi-all" ? v : "en");
/** The script a choice is written in: "ta" for both Tamil choices, "hi" for both Hindi ones. */
export const scriptOf = (l: Lang): "en" | "ta" | "hi" => (l === "ta-all" ? "ta" : l === "hi-all" ? "hi" : l);
/** The whole-app language, or null when the app is in English (with or without a second line). */
export const allOf = (l: Lang): "ta" | "hi" | null => (l === "ta-all" ? "ta" : l === "hi-all" ? "hi" : null);

type W = { en: string; ta: string; hi: string };
export const WORDS = {
  /* where a table is — one colour each, the same on every screen */
  free: { en: "Free", ta: "காலி", hi: "खाली" },
  ordered: { en: "Ordered", ta: "ஆர்டர் ஆனது", hi: "ऑर्डर हुआ" },
  cooking: { en: "Cooking", ta: "சமையலில்", hi: "बन रहा है" },
  food_ready: { en: "Food ready", ta: "உணவு தயார்", hi: "खाना तैयार" },
  eating: { en: "Eating", ta: "சாப்பிடுகிறார்கள்", hi: "खा रहे हैं" },
  bill: { en: "Bill", ta: "பில்", hi: "बिल" },
  late: { en: "Late", ta: "தாமதம்", hi: "देर" },
  reserved: { en: "Reserved", ta: "முன்பதிவு", hi: "आरक्षित" },
  /* taking an order */
  take_order: { en: "Take order", ta: "ஆர்டர் எடு", hi: "ऑर्डर लें" },
  parcel: { en: "Parcel", ta: "பார்சல்", hi: "पार्सल" },
  dine_in: { en: "Dine in", ta: "இங்கே சாப்பிட", hi: "यहीं खाना" },
  delivery: { en: "Delivery", ta: "டெலிவரி", hi: "डिलीवरी" },
  room: { en: "Room", ta: "அறை", hi: "कमरा" },
  table: { en: "Table", ta: "மேசை", hi: "टेबल" },
  dishes: { en: "Dishes", ta: "உணவுகள்", hi: "डिश" },
  send: { en: "Send", ta: "அனுப்பு", hi: "भेजें" },
  send_kitchen: { en: "Send to kitchen", ta: "சமையலறைக்கு அனுப்பு", hi: "किचन में भेजें" },
  add: { en: "Add", ta: "சேர்", hi: "जोड़ें" },
  choose: { en: "Choose", ta: "தேர்வு", hi: "चुनें" },
  note: { en: "Note", ta: "குறிப்பு", hi: "नोट" },
  change: { en: "Change", ta: "மாற்று", hi: "बदलें" },
  /* the kitchen */
  new: { en: "New", ta: "புதியது", hi: "नया" },
  start_cooking: { en: "Start cooking", ta: "சமைக்கத் தொடங்கு", hi: "बनाना शुरू करें" },
  ready: { en: "Ready", ta: "தயார்", hi: "तैयार" },
  ready_take: { en: "Ready — take it out", ta: "தயார் — எடுத்துச் செல்", hi: "तैयार — ले जाएँ" },
  served: { en: "Served", ta: "பரிமாறியது", hi: "परोस दिया" },
  /* the money */
  print_bill: { en: "Print bill", ta: "பில் அச்சிடு", hi: "बिल छापें" },
  payment: { en: "Payment", ta: "பணம்", hi: "भुगतान" },
  how_paid: { en: "How did they pay?", ta: "எப்படி பணம் கொடுத்தார்கள்?", hi: "कैसे भुगतान किया?" },
  to_pay: { en: "To pay", ta: "செலுத்த வேண்டியது", hi: "देना है" },
  paid: { en: "Paid", ta: "பணம் வந்தது", hi: "भुगतान हुआ" },
  cash: { en: "Cash", ta: "ரொக்கம்", hi: "नकद" },
  upi: { en: "UPI", ta: "UPI", hi: "UPI" },
  card: { en: "Card", ta: "கார்டு", hi: "कार्ड" },
  split: { en: "Split", ta: "பிரித்து", hi: "बाँटकर" },
  next_order: { en: "Next order", ta: "அடுத்த ஆர்டர்", hi: "अगला ऑर्डर" },
  print: { en: "Print", ta: "அச்சிடு", hi: "प्रिंट" },
  close_shift: { en: "Close shift", ta: "ஷிஃப்ட் முடி", hi: "शिफ्ट बंद करें" },
  /* bookings, the door, online orders */
  seat_now: { en: "Seat now", ta: "உட்கார வை", hi: "बैठाएँ" },
  coming: { en: "Coming", ta: "வருகிறார்கள்", hi: "आ रहे हैं" },
  at_table: { en: "At table", ta: "மேசையில்", hi: "टेबल पर" },
  new_booking: { en: "New booking", ta: "புதிய முன்பதிவு", hi: "नई बुकिंग" },
  call: { en: "Call", ta: "அழை", hi: "कॉल करें" },
  add_waiting: { en: "Add to waiting list", ta: "காத்திருப்பில் சேர்", hi: "वेटिंग में जोड़ें" },
  table_ready: { en: "Table ready", ta: "மேசை தயார்", hi: "टेबल तैयार" },
  accept: { en: "Accept", ta: "ஏற்கவும்", hi: "स्वीकार करें" },
  reject: { en: "No", ta: "வேண்டாம்", hi: "नहीं" },
  /* the pantry, the menu, the guests */
  add_stock: { en: "Add stock", ta: "சரக்கு சேர்", hi: "स्टॉक जोड़ें" },
  waste: { en: "Waste", ta: "வீண்", hi: "बर्बाद" },
  goods_arrived: { en: "Goods arrived", ta: "சரக்கு வந்தது", hi: "माल आया" },
  finished: { en: "Finished", ta: "தீர்ந்தது", hi: "खत्म" },
  running_low: { en: "Running low", ta: "குறைவு", hi: "कम है" },
  enough: { en: "Enough", ta: "போதும்", hi: "काफी है" },
  available: { en: "Available", ta: "கிடைக்கும்", hi: "उपलब्ध" },
  sold_out: { en: "Sold out", ta: "தீர்ந்தது", hi: "खत्म" },
  new_dish: { en: "New dish", ta: "புதிய உணவு", hi: "नई डिश" },
  edit: { en: "Edit", ta: "திருத்து", hi: "बदलें" },
  add_customer: { en: "Add customer", ta: "வாடிக்கையாளர் சேர்", hi: "ग्राहक जोड़ें" },
  whatsapp: { en: "WhatsApp", ta: "WhatsApp", hi: "WhatsApp" },
  /* expenses and checklists (0104) */
  save_expense: { en: "Save expense", ta: "செலவைச் சேமி", hi: "खर्च सेव करें" },
  new_list: { en: "New list", ta: "புதிய பட்டியல்", hi: "नई सूची" },
  save_list: { en: "Save list", ta: "பட்டியலைச் சேமி", hi: "सूची सेव करें" },
  opening: { en: "Opening", ta: "திறக்கும்போது", hi: "खुलते समय" },
  closing: { en: "Closing", ta: "மூடும்போது", hi: "बंद करते समय" },
  any_time: { en: "Any time", ta: "எப்போதும்", hi: "कभी भी" },
  /* payroll (0106) */
  work_out_pay: { en: "Work out pay", ta: "சம்பளம் கணக்கிடு", hi: "वेतन निकालें" },
  work_out_again: { en: "Work out again", ta: "மீண்டும் கணக்கிடு", hi: "फिर से निकालें" },
  finalise: { en: "Finalise", ta: "இறுதி செய்", hi: "पक्का करें" },
  give_advance: { en: "Give advance", ta: "முன்பணம் கொடு", hi: "एडवांस दें" },
  save: { en: "Save", ta: "சேமி", hi: "सेव करें" },
  /* outlets (0106) */
  work_here: { en: "Work here", ta: "இங்கே வேலை", hi: "यहाँ काम करें" },
  open_outlet: { en: "Open outlet", ta: "புதிய கிளை திற", hi: "नई शाखा खोलें" },
  send_menu: { en: "Send menu", ta: "மெனு அனுப்பு", hi: "मेनू भेजें" },
  switch_on: { en: "Switch it on", ta: "இயக்கு", hi: "चालू करें" },
  /* staff (0107) */
  add_staff: { en: "Add staff", ta: "ஆள் சேர்", hi: "स्टाफ जोड़ें" },
  people: { en: "People", ta: "நபர்கள்", hi: "लोग" },
  team_chart: { en: "Team chart", ta: "வரைபடம்", hi: "टीम चार्ट" },
  positions: { en: "Positions", ta: "பதவிகள்", hi: "पद" },
  /* cleaning after every guest (0111) */
  cleaning: { en: "Cleaning", ta: "சுத்தம்", hi: "सफ़ाई" },
  take_it: { en: "I'll take it", ta: "எடுக்கிறேன்", hi: "मैं लूँगा" },
  clean_done: { en: "Done", ta: "முடிந்தது", hi: "हो गया" },
  give_back: { en: "Give back", ta: "திருப்பு", hi: "वापस दें" },
  not_needed: { en: "Not needed", ta: "தேவையில்லை", hi: "ज़रूरत नहीं" },
  assign: { en: "Give to", ta: "ஒப்படை", hi: "सौंपें" },
  waiting: { en: "Waiting", ta: "காத்திருக்கிறது", hi: "इंतज़ार" },
  on_it: { en: "On it", ta: "நடக்கிறது", hi: "चल रहा है" },
  done_today: { en: "Done today", ta: "இன்று முடிந்தவை", hi: "आज हुए" },
  to_inspect: { en: "To inspect", ta: "சரிபார்க்க", hi: "जाँचना है" },
  pass_it: { en: "Pass", ta: "சரி", hi: "पास" },
  fail_it: { en: "Fail", ta: "தவறு", hi: "फ़ेल" },
  /* work: every job on the property (0113) */
  work: { en: "Work", ta: "வேலை", hi: "काम" },
  new_job: { en: "New job", ta: "புதிய வேலை", hi: "नया काम" },
  raise_it: { en: "Raise it", ta: "பதிவு செய்", hi: "दर्ज करें" },
  drop_it: { en: "Drop", ta: "விடு", hi: "हटाएँ" },
  with_note: { en: "Done, with the note", ta: "குறிப்புடன் முடிந்தது", hi: "नोट के साथ हो गया" },
  coming_up: { en: "Coming up", ta: "வரவிருப்பவை", hi: "आगे" },
} satisfies Record<string, W>;
export type Word = keyof typeof WORDS;

/** The English and, when the device asked for one, the second line. In a whole-app language the
 *  word is that language alone (`en` carries it), with no second line. */
export const say = (w: Word, lang: Lang): { en: string; alt: string | null } => {
  const all = allOf(lang); if (all) return { en: WORDS[w][all], alt: null };
  return { en: WORDS[w].en, alt: lang === "en" || WORDS[w][lang as "ta" | "hi"] === WORDS[w].en ? null : WORDS[w][lang as "ta" | "hi"] };
};

/**
 * The picture for a menu category, from its own name — owners name them freely ("Breads & Rice",
 * "Tandoor", "Cool drinks"), so the till guesses by word. A lucide icon name, resolved on the client.
 */
const CAT_ICONS: [RegExp, string][] = [
  [/popular|best ?sell/i, "Star"],
  [/soup|rasam|shorba/i, "Soup"],
  [/starter|snack|appet|tandoor|grill|kebab|tikka|fry|65/i, "Drumstick"],
  [/bread|naan|roti|paratha|parotta|kulcha|dosa|tiffin|idli/i, "Wheat"],
  [/biryani|rice|pulao|meals|thali/i, "CookingPot"],
  [/main|curry|gravy|masala|dal|sabzi/i, "Soup"],
  [/coffee|tea|chai/i, "Coffee"],
  [/drink|beverage|juice|shake|lassi|soda|cool/i, "CupSoda"],
  [/dessert|sweet|ice|kulfi|cake/i, "IceCreamCone"],
  [/salad|veg|green/i, "Salad"],
  [/sea|fish|prawn/i, "Fish"],
  [/pizza|burger|sandwich|chinese|noodle|pasta/i, "Pizza"],
  [/combo|meal|platter|family/i, "Layers"],
];
export const catIcon = (name: string): string => CAT_ICONS.find(([re]) => re.test(name))?.[1] ?? "UtensilsCrossed";
