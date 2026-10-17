/**
 * The Dining screens' words, in English and — when a device asks for it — Tamil or Hindi under them.
 *
 * A second line, never a replacement: English stays on every button so a manager, a probe and a
 * support call all read the same screen. The choice is the device's (the `df-lang` cookie, like
 * `df-theme`): the till tablet is set once for the people who use it. The translations are short
 * floor words, the way staff say them — have someone on the floor read them before relying on them.
 */
export type Lang = "en" | "ta" | "hi";
export const LANG_COOKIE = "df-lang";
export const LANGS: { v: Lang; label: string; short: string; hint: string }[] = [
  { v: "en", label: "English", short: "A", hint: "Buttons in English only." },
  { v: "ta", label: "English + தமிழ்", short: "அ", hint: "Tamil under the English on the Dining screens." },
  { v: "hi", label: "English + हिन्दी", short: "अ", hint: "Hindi under the English on the Dining screens." },
];
export const readLang = (v: string | null | undefined): Lang => (v === "ta" || v === "hi" ? v : "en");

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
} satisfies Record<string, W>;
export type Word = keyof typeof WORDS;

/** The English and, when the device asked for one, the second line. */
export const say = (w: Word, lang: Lang): { en: string; alt: string | null } =>
  ({ en: WORDS[w].en, alt: lang === "en" || WORDS[w][lang] === WORDS[w].en ? null : WORDS[w][lang] });

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
