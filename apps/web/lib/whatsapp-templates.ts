/**
 * The WhatsApp templates DineFlow sends (0177). Meta only lets a business start a conversation with a template it has
 * approved, so the owner creates each of these ONCE in Meta Business Manager → WhatsApp Manager → Message templates,
 * verbatim: the same name, the category Utility, one language version per language the property uses (English `en`,
 * Tamil `ta`, Hindi `hi`), and the body text below with its {{1}}…{{n}} in the same order. The app fills the numbers
 * from `params`, in that order, and nothing else — a word changed here without changing it in Meta is a message refused.
 *
 * Rules Meta applies to a body parameter (the app enforces them in lib/whatsapp.ts `cleanParam`): no newline, no four
 * spaces in a row, at most 1,024 characters. A link in a parameter is allowed in a Utility template; if Meta's review
 * objects to the bill link in {{4}} of `dineflow_bill`, make {{4}} a "Visit website" button with a dynamic URL instead and
 * the app's payload builder takes `button: token` — see `templatePayload`.
 *
 * Settings → WhatsApp shows these texts with a Copy button so nothing is retyped.
 */
export type WaLang = "en" | "ta" | "hi";
export type WaKind = "reservation" | "booking" | "bill" | "day_close" | "alert" | "shift_reminder" | "table_ready" | "order_accepted" | "order_ready" | "order_out" | "test";

export type WaTemplate = {
  /** the template's name in Meta, exactly */
  name: string;
  kind: WaKind;
  /** what each {{n}} is, in order — the caller passes the same number of strings */
  params: string[];
  /** the body text per language, with {{1}}…{{n}} */
  body: Record<WaLang, string>;
};

export const WA_LANGS: { code: WaLang; label: string }[] = [
  { code: "en", label: "English" },
  { code: "ta", label: "தமிழ் (Tamil)" },
  { code: "hi", label: "हिन्दी (Hindi)" },
];

export const WA_TEMPLATES: Record<WaKind, WaTemplate> = {
  test: {
    name: "dineflow_test", kind: "test",
    params: ["property name"],
    body: {
      en: "This is a test from {{1}} on DineFlow. WhatsApp messages are working.",
      ta: "இது DineFlow-இல் {{1}} அனுப்பிய சோதனைச் செய்தி. WhatsApp செய்திகள் வேலை செய்கின்றன.",
      hi: "यह DineFlow पर {{1}} की ओर से एक परीक्षण संदेश है। WhatsApp संदेश काम कर रहे हैं।",
    },
  },
  reservation: {
    name: "dineflow_reservation", kind: "reservation",
    params: ["guest's first name", "property name", "date (Fri 10 Oct)", "time (7:30 pm)", "number of guests", "reservation number"],
    body: {
      en: "Hello {{1}}, your table at {{2}} is confirmed for {{3}} at {{4}} for {{5}} guests. Reservation #{{6}}. See you soon.",
      ta: "வணக்கம் {{1}}, {{2}}-இல் உங்கள் மேசை {{3}} அன்று {{4}} மணிக்கு {{5}} பேருக்கு உறுதி செய்யப்பட்டது. முன்பதிவு #{{6}}. விரைவில் சந்திப்போம்.",
      hi: "नमस्ते {{1}}, {{2}} में आपकी टेबल {{3}} को {{4}} बजे {{5}} लोगों के लिए पक्की है। आरक्षण #{{6}}। जल्द मिलते हैं।",
    },
  },
  booking: {
    name: "dineflow_booking", kind: "booking",
    params: ["guest's first name", "property name", "room number", "check-in (Fri 10 Oct)", "check-out (Sun 12 Oct)", "booking number"],
    body: {
      en: "Hello {{1}}, your room at {{2}} is booked. Room {{3}}, {{4}} to {{5}}. Booking #{{6}}. We look forward to your stay.",
      ta: "வணக்கம் {{1}}, {{2}}-இல் உங்கள் அறை முன்பதிவு செய்யப்பட்டது. அறை {{3}}, {{4}} முதல் {{5}} வரை. முன்பதிவு #{{6}}. உங்கள் வருகைக்காக காத்திருக்கிறோம்.",
      hi: "नमस्ते {{1}}, {{2}} में आपका कमरा बुक हो गया है। कमरा {{3}}, {{4}} से {{5}} तक। बुकिंग #{{6}}। आपके आने की प्रतीक्षा है।",
    },
  },
  bill: {
    name: "dineflow_bill", kind: "bill",
    params: ["customer's first name (or 'Guest')", "property name", "bill total, digits (1,240.00)", "the bill's link (https://…/pay/<token>)"],
    body: {
      en: "Thank you {{1}}. Your bill at {{2}} is ₹{{3}}. See it here: {{4}}",
      ta: "நன்றி {{1}}. {{2}}-இல் உங்கள் பில் ₹{{3}}. பில் பார்க்க: {{4}}",
      hi: "धन्यवाद {{1}}। {{2}} में आपका बिल ₹{{3}} है। बिल देखें: {{4}}",
    },
  },
  day_close: {
    name: "dineflow_day_close", kind: "day_close",
    params: ["property name", "date (Fri 10 Oct)", "sales, digits", "bills count", "cash expected, digits", "cash counted, with ₹ (₹1,200.00) or 'not counted'", "voids count"],
    body: {
      en: "{{1}} — day close for {{2}}. Sales ₹{{3}} on {{4}} bills. Cash expected ₹{{5}}, counted {{6}}. Voids: {{7}}.",
      ta: "{{1}} — {{2}} நாள் முடிவு. விற்பனை ₹{{3}}, {{4}} பில்கள். பணம் எதிர்பார்த்தது ₹{{5}}, எண்ணியது {{6}}. ரத்து பில்கள்: {{7}}.",
      hi: "{{1}} — {{2}} का दिन बंद। बिक्री ₹{{3}}, {{4}} बिल। नकद अपेक्षित ₹{{5}}, गिना {{6}}। रद्द बिल: {{7}}।",
    },
  },
  alert: {
    name: "dineflow_alert", kind: "alert",
    params: ["property name", "what happened (Bill 214 voided: wrong table)", "amount, digits", "who did it"],
    body: {
      en: "{{1}}: {{2}} — ₹{{3}} — by {{4}}.",
      ta: "{{1}}: {{2}} — ₹{{3}} — {{4}} செய்தது.",
      hi: "{{1}}: {{2}} — ₹{{3}} — {{4}} द्वारा।",
    },
  },
  table_ready: {
    name: "dineflow_table_ready", kind: "table_ready",
    params: ["guest's first name", "property name", "their number of the day (token)", "their place-in-line link (https://…/queue/<slug>?t=<token>)"],
    body: {
      en: "Hello {{1}}, your table at {{2}} is ready. Your number is {{3}}. Please come to the host stand. {{4}}",
      ta: "வணக்கம் {{1}}, {{2}}-இல் உங்கள் மேசை தயார். உங்கள் எண் {{3}}. தயவுசெய்து வரவேற்பு இடத்திற்கு வாருங்கள். {{4}}",
      hi: "नमस्ते {{1}}, {{2}} में आपकी टेबल तैयार है। आपका नंबर {{3}} है। कृपया काउंटर पर आइए। {{4}}",
    },
  },
  order_accepted: {
    name: "dineflow_order_accepted", kind: "order_accepted",
    params: ["guest's first name", "property name", "order number (ref)", "minutes until it is ready (25)"],
    body: {
      en: "Hi {{1}}, {{2}} has accepted your order #{{3}}. It will be ready in about {{4}} minutes. We will message you when it is on its way.",
      ta: "வணக்கம் {{1}}, {{2}} உங்கள் ஆர்டர் #{{3}}-ஐ ஏற்றுக்கொண்டது. சுமார் {{4}} நிமிடங்களில் தயாராகும். புறப்படும்போது உங்களுக்குத் தெரிவிப்போம்.",
      hi: "नमस्ते {{1}}, {{2}} ने आपका ऑर्डर #{{3}} स्वीकार कर लिया है। यह लगभग {{4}} मिनट में तैयार होगा। भेजते समय हम आपको सूचित करेंगे।",
    },
  },
  order_ready: {
    name: "dineflow_order_ready", kind: "order_ready",
    params: ["guest's first name", "property name", "order number (ref)", "what next (Please collect it at the counter. / It will be sent out shortly.)"],
    body: {
      en: "Hi {{1}}, your order #{{3}} at {{2}} is ready. {{4}}",
      ta: "வணக்கம் {{1}}, {{2}}-இல் உங்கள் ஆர்டர் #{{3}} தயாராக உள்ளது. {{4}}",
      hi: "नमस्ते {{1}}, {{2}} में आपका ऑर्डर #{{3}} तैयार है। {{4}}",
    },
  },
  order_out: {
    name: "dineflow_order_out", kind: "order_out",
    params: ["guest's first name", "property name", "order number (ref)", "rider (name and phone)", "tracking link (https://…/track/<token>)"],
    body: {
      en: "Hi {{1}}, your order #{{3}} from {{2}} is out for delivery with {{4}}. Track it here: {{5}}",
      ta: "வணக்கம் {{1}}, {{2}}-இலிருந்து உங்கள் ஆர்டர் #{{3}} {{4}} மூலம் டெலிவரிக்கு புறப்பட்டுவிட்டது. இங்கே கண்காணிக்கவும்: {{5}}",
      hi: "नमस्ते {{1}}, {{2}} से आपका ऑर्डर #{{3}} {{4}} के साथ डिलीवरी के लिए निकल चुका है। यहाँ ट्रैक करें: {{5}}",
    },
  },
  shift_reminder: {
    name: "dineflow_shift_reminder", kind: "shift_reminder",
    params: ["staff first name", "property name", "shift start (7:30 am)"],
    body: {
      en: "Hello {{1}}, a reminder: your shift at {{2}} starts at {{3}}.",
      ta: "வணக்கம் {{1}}, நினைவூட்டல்: {{2}}-இல் உங்கள் பணி {{3}} மணிக்கு தொடங்கும்.",
      hi: "नमस्ते {{1}}, याद दिलाना: {{2}} में आपकी शिफ्ट {{3}} बजे शुरू होगी।",
    },
  },
};

export const WA_TEMPLATE_LIST: WaTemplate[] = Object.values(WA_TEMPLATES);

/** The body with its numbers filled in — what the guest will read; for previews and the test suite, never for sending. */
export function renderTemplate(t: WaTemplate, lang: WaLang, params: string[]): string {
  return t.body[lang].replace(/\{\{(\d+)\}\}/g, (_, n) => params[Number(n) - 1] ?? "");
}
