/**
 * A property's website in Tamil or Hindi (an extra the client switches on — ninth pass).
 *
 * What changes is **the page's own words**: headings, buttons, labels, the questions and their answers. What the owner
 * typed — the name, the About, dish names and descriptions, room names, offers — stays exactly as typed; this is not
 * machine translation of anybody's menu. The key is the English line itself, so a line with no entry is simply shown in
 * English and nothing can be "missing": `siteT("ta")("Order online")`.
 *
 * `en → [தமிழ், हिन्दी]`. A heading in two parts (the second is set in the accent) is keyed "first|second".
 */
import { clock, siteAddress, type SiteData } from "./website";

export type SiteLang = "en" | "ta" | "hi";
export const SITE_LANG_NAME: Record<SiteLang, string> = { en: "English", ta: "தமிழ்", hi: "हिन्दी" };

const W: Record<string, [string, string]> = {
  // the floating menu and the things to do
  About: ["அறிமுகம்", "परिचय"], Menu: ["மெனு", "मेन्यू"], Rooms: ["அறைகள்", "कमरे"], Facilities: ["வசதிகள்", "सुविधाएँ"], Offers: ["சலுகைகள்", "ऑफ़र"], Gallery: ["படங்கள்", "गैलरी"], Reviews: ["மதிப்புரைகள்", "समीक्षाएँ"], Contact: ["தொடர்பு", "संपर्क"],
  Sections: ["பகுதிகள்", "अनुभाग"], "Order online": ["ஆன்லைனில் ஆர்டர்", "ऑनलाइन ऑर्डर"], "Book a table": ["மேசை முன்பதிவு", "टेबल बुक करें"], "Join the queue": ["வரிசையில் சேர", "कतार में जुड़ें"], "Book a room": ["அறை முன்பதிவு", "कमरा बुक करें"],
  Call: ["அழைக்க", "कॉल करें"], "Call us": ["எங்களை அழையுங்கள்", "हमें कॉल करें"], Scroll: ["கீழே", "नीचे"], Welcome: ["வரவேற்கிறோம்", "स्वागत है"],
  Restaurant: ["உணவகம்", "रेस्टोरेंट"], Hotel: ["ஹோட்டல்", "होटल"], Resort: ["ரிசார்ட்", "रिज़ॉर्ट"],
  // facts
  "Open now": ["இப்போது திறந்துள்ளது", "अभी खुला है"], "Closed now": ["இப்போது மூடியுள்ளது", "अभी बंद है"], "for two": ["இருவருக்கு", "दो के लिए"], From: ["", ""], "a night": ["முதல் / இரவு", "से / रात"],
  "for two, about": ["இருவருக்கு, சுமார்", "दो के लिए, लगभग"], "a night, from": ["ஒரு இரவுக்கு, தொடக்கம்", "प्रति रात, शुरुआत"], "Open daily ·": ["தினமும் திறந்திருக்கும் ·", "रोज़ खुला ·"],
  "Check-in": ["செக்-இன்", "चेक-इन"], "· Check-out": ["· செக்-அவுட்", "· चेक-आउट"], "Check dates": ["தேதிகளைப் பார்க்க", "तारीखें देखें"], "per night, plus taxes": ["ஒரு இரவுக்கு, வரிகள் தனி", "प्रति रात, कर अलग"],
  Book: ["முன்பதிவு", "बुक करें"], min: ["நிமி", "मिनट"], Included: ["கட்டணமில்லை", "शामिल"], Veg: ["சைவம்", "शाकाहारी"], "Non-veg": ["அசைவம்", "मांसाहारी"],
  "guest reviews": ["விருந்தினர் மதிப்புரைகள்", "मेहमानों की समीक्षाएँ"], "dishes on the menu": ["உணவு வகைகள்", "व्यंजन मेन्यू में"], "room types": ["அறை வகைகள்", "कमरों के प्रकार"], reviews: ["மதிப்புரைகள்", "समीक्षाएँ"],
  // sections
  "Our|story": ["எங்கள்|கதை", "हमारी|कहानी"], "Rooms &|rates": ["அறைகள்,|கட்டணம்", "कमरे और|दरें"], "The|experience": ["இங்கே|அனுபவம்", "यहाँ का|अनुभव"], "Signature|plates": ["சிறப்பு|உணவுகள்", "ख़ास|व्यंजन"],
  "The|menu": ["எங்கள்|மெனு", "हमारा|मेन्यू"], "Today's|offers": ["இன்றைய|சலுகைகள்", "आज के|ऑफ़र"], "The|gallery": ["எங்கள்|படங்கள்", "हमारी|गैलरी"], "On|Instagram": ["Instagram-இல்|நாங்கள்", "Instagram|पर"],
  "Kind|words": ["விருந்தினர்|கருத்துகள்", "मेहमानों की|राय"], "Questions,|answered": ["கேள்விகள்,|பதில்கள்", "सवाल,|जवाब"],
  "Find our|table": ["எங்களைக்|கண்டறியுங்கள்", "हम तक|पहुँचें"], "Find your|way": ["எங்களைக்|கண்டறியுங்கள்", "हम तक|पहुँचें"], "The way|here": ["இங்கு வரும்|வழி", "यहाँ का|रास्ता"],
  "Come|hungry.": ["பசியோடு|வாருங்கள்.", "भूख लेकर|आइए।"], "Your room|is ready.": ["உங்கள் அறை|தயார்.", "आपका कमरा|तैयार है।"], "Stay a little|longer.": ["இன்னும் கொஞ்சம்|தங்குங்கள்.", "थोड़ा और|ठहरिए।"],
  "Stay with us": ["எங்களுடன் தங்குங்கள்", "हमारे साथ ठहरें"], "Things to do": ["செய்யக்கூடியவை", "करने को बहुत कुछ"], "From the kitchen": ["சமையலறையிலிருந்து", "रसोई से"], "Running now": ["இப்போது நடப்பில்", "अभी चालू"],
  "A look around": ["ஒரு பார்வை", "एक नज़र"], "Follow along": ["எங்களைத் தொடருங்கள்", "जुड़े रहें"], "From our guests": ["விருந்தினர்களிடமிருந்து", "हमारे मेहमानों से"], "Good to know": ["தெரிந்துகொள்ள", "जानने योग्य"],
  "Where we are": ["நாங்கள் இருக்கும் இடம்", "हम कहाँ हैं"], "See you soon": ["விரைவில் சந்திப்போம்", "जल्द मिलते हैं"], "What we cook": ["நாங்கள் சமைப்பது", "हम क्या पकाते हैं"], Dining: ["உணவு", "भोजन"],
  "What the kitchen is proud of — keep going.": ["எங்கள் சமையலறையின் பெருமை.", "हमारी रसोई की शान।"], "Show less": ["குறைவாகக் காட்டு", "कम दिखाएँ"], Show: ["மேலும்", "और"], more: ["", ""],
  "Prices are today's, before taxes.": ["இன்றைய விலைகள்; வரிகள் தனி.", "आज की कीमतें; कर अलग।"], "Some photos are illustrative — photo credits": ["சில படங்கள் மாதிரிக்கானவை — பட உரிமை", "कुछ तस्वीरें सांकेतिक हैं — फ़ोटो क्रेडिट"],
  "Offer of the day": ["இன்றைய சலுகை", "आज का ऑफ़र"], "On orders above": ["குறைந்தபட்ச ஆர்டர்", "न्यूनतम ऑर्डर"], "On every order": ["எல்லா ஆர்டர்களுக்கும்", "हर ऑर्डर पर"], "Follow us": ["எங்களைப் பின்தொடருங்கள்", "हमें फ़ॉलो करें"],
  "Drawn, not to scale": ["வரைபடம் — அளவுப்படி அல்ல", "चित्र — पैमाने पर नहीं"], "From where you are": ["நீங்கள் இருக்கும் இடத்திலிருந்து", "आप जहाँ हैं वहाँ से"], Directions: ["வழி", "रास्ता"], Chat: ["அரட்டை", "चैट"], Write: ["எழுத", "लिखें"],
  "Review us on Google": ["Google-இல் மதிப்பிடுங்கள்", "Google पर रिव्यू दें"], Privacy: ["தனியுரிமை", "गोपनीयता"], "Website by": ["இணையதளம்:", "वेबसाइट:"],
  // the client pieces (SiteWords hands these to them)
  "Live map": ["நேரடி வரைபடம்", "लाइव नक्शा"], "Close map": ["வரைபடத்தை மூடு", "नक्शा बंद करें"], "Copy address": ["முகவரியை நகலெடு", "पता कॉपी करें"], Copied: ["நகலெடுக்கப்பட்டது", "कॉपी हो गया"], Share: ["பகிர்", "शेयर"],
  "Link copied": ["இணைப்பு நகலெடுக்கப்பட்டது", "लिंक कॉपी हो गया"], Close: ["மூடு", "बंद करें"], Dish: ["உணவு", "व्यंजन"], Room: ["அறை", "कमरा"], Vegetarian: ["சைவம்", "शाकाहारी"], "Non-vegetarian": ["அசைவம்", "मांसाहारी"],
  "Signature dishes": ["சிறப்பு உணவுகள்", "ख़ास व्यंजन"], "Next dish": ["அடுத்த உணவு", "अगला व्यंजन"], "Previous dish": ["முந்தைய உணவு", "पिछला व्यंजन"], "Next photo": ["அடுத்த படம்", "अगली तस्वीर"], "Previous photo": ["முந்தைய படம்", "पिछली तस्वीर"],
  "Book this room": ["இந்த அறையை முன்பதிவு செய்ய", "यह कमरा बुक करें"], Sleeps: ["தங்கும் நபர்கள்:", "ठहर सकते हैं:"], photos: ["படங்கள்", "तस्वीरें"],
  "Send an enquiry": ["விசாரணை அனுப்ப", "पूछताछ भेजें"], Enquiry: ["விசாரணை", "पूछताछ"], "Send an|enquiry": ["விசாரணை|அனுப்புங்கள்", "पूछताछ|भेजें"], "Your name": ["உங்கள் பெயர்", "आपका नाम"], Date: ["தேதி", "तारीख़"], People: ["நபர்கள்", "लोग"], Guests: ["விருந்தினர்கள்", "मेहमान"],
  "Plan your stay": ["உங்கள் தங்குதலைத் திட்டமிடுங்கள்", "अपना ठहराव तय करें"], "Parties · orders · questions": ["விழாக்கள் · ஆர்டர்கள் · கேள்விகள்", "पार्टी · ऑर्डर · सवाल"], "What would you like to ask?": ["என்ன கேட்க விரும்புகிறீர்கள்?", "आप क्या पूछना चाहते हैं?"],
  "Open WhatsApp": ["WhatsApp-ஐத் திற", "WhatsApp खोलें"], "Opens WhatsApp with your message written. You press send.": ["உங்கள் செய்தியுடன் WhatsApp திறக்கும். அனுப்புவது நீங்கள்தான்.", "आपके संदेश के साथ WhatsApp खुलेगा। भेजना आपको है।"],
  Offer: ["சலுகை", "ऑफ़र"], "See post": ["பதிவைப் பார்க்க", "पोस्ट देखें"], "Loads from Instagram when you tap": ["தொட்டால் Instagram-இலிருந்து திறக்கும்", "छूने पर Instagram से खुलेगा"],
  "in 3D": ["— 3D-இல் பாருங்கள்", "— 3D में देखें"], See: ["", ""], "Drag to turn it. Pinch or scroll to come closer.": ["இழுத்துத் திருப்புங்கள். அருகில் பார்க்க விரல்களால் பெரிதாக்குங்கள்.", "घुमाने के लिए खींचें। पास देखने के लिए ज़ूम करें।"],
  "Loading the 3D view…": ["3D காட்சி ஏறுகிறது…", "3D दृश्य लोड हो रहा है…"], "The 3D view could not be loaded on this device.": ["இந்தக் கருவியில் 3D காட்சியைத் திறக்க முடியவில்லை.", "इस डिवाइस पर 3D दृश्य नहीं खुल सका।"],
};

const at = (lang: SiteLang) => (lang === "ta" ? 0 : 1);
/** The page's own words in a language. An unknown line comes back as it went in. */
export const siteT = (lang: SiteLang) => (line: string): string => (lang === "en" ? line : W[line]?.[at(lang)] ?? line);
/** A two-part heading: [first, the accent word]. */
export const sitePair = (lang: SiteLang) => (first: string, second?: string): [string, string | undefined] => {
  if (lang === "en" || !second) return [siteT(lang)(first), second];
  const got = W[`${first}|${second}`]?.[at(lang)]; if (!got) return [first, second];
  const [a, b] = got.split("|"); return [a, b];
};
/** Only the lines the client pieces show, for the chosen language ({} in English) — the whole table never goes to a browser. */
const CLIENT = ["Live map", "Close map", "Directions", "Copy address", "Copied", "Share", "Link copied", "Close", "Dish", "Room", "Vegetarian", "Non-vegetarian", "Signature dishes", "Next dish", "Previous dish", "Next photo", "Previous photo",
  "Book this room", "Sleeps", "photos", "per night, plus taxes", "Send an enquiry", "Enquiry", "Send an|enquiry", "Your name", "Date", "People", "Guests", "Check-in", "Plan your stay", "Parties · orders · questions", "What would you like to ask?",
  "Open WhatsApp", "Opens WhatsApp with your message written. You press send.", "Offer", "See post", "Loads from Instagram when you tap", "in 3D", "See", "Drag to turn it. Pinch or scroll to come closer.", "Loading the 3D view…", "The 3D view could not be loaded on this device.", "Order online"];
export const clientWords = (lang: SiteLang): Record<string, string> => (lang === "en" ? {} : Object.fromEntries(CLIENT.filter((k) => W[k]).map((k) => [k, W[k][at(lang)]])));
/** Which language a visitor asked for, if the client offers it. */
export const siteLang = (asked: string | undefined, o: { lang_ta?: boolean; lang_hi?: boolean } | null | undefined): SiteLang => (asked === "ta" && o?.lang_ta ? "ta" : asked === "hi" && o?.lang_hi ? "hi" : "en");
export const siteLangs = (o: { lang_ta?: boolean; lang_hi?: boolean } | null | undefined): SiteLang[] => (o?.lang_ta || o?.lang_hi ? ["en", ...(o.lang_ta ? ["ta" as const] : []), ...(o.lang_hi ? ["hi" as const] : [])] : []);

const rupees = (n: number) => `₹${new Intl.NumberFormat("en-IN").format(Math.round(n))}`;
/** The story said large, in Tamil or Hindi: the same few facts the English lines say. */
export function sagaIn(d: SiteData, lang: "ta" | "hi"): string[][] {
  const ta = lang === "ta", town = d.district?.trim(), dishes = d.menu.reduce((n, c) => n + c.items.length, 0);
  const low = d.rooms.map((r) => Number(r.base_rate)).filter((n) => n > 0).sort((a, b) => a - b)[0];
  const lines: (string[] | null)[] = d.type === "restaurant" ? [
    d.cuisines?.[0] ? [`${d.cuisines[0]}.`, ta ? "புதிதாகச் சமைத்தது." : "ताज़ा बना।"] : null,
    d.opens_at && d.closes_at ? [ta ? `${clock(d.opens_at)} முதல்.` : `${clock(d.opens_at)} से।`, ta ? `${clock(d.closes_at)} வரை.` : `${clock(d.closes_at)} तक।`] : null,
    dishes > 1 ? [ta ? `${dishes} உணவுகள்.` : `${dishes} व्यंजन।`, ta ? "ஒரே சமையலறை." : "एक रसोई।"] : null,
    [town ? `${town}.` : ta ? "உங்கள் அருகில்." : "आपके पास।", ta ? "பசியோடு வாருங்கள்." : "भूख लेकर आइए।"],
  ] : [
    d.rooms.length ? [ta ? `${d.rooms.length} அறை வகைகள்.` : `${d.rooms.length} तरह के कमरे।`, low ? (ta ? `${rupees(low)} முதல்.` : `${rupees(low)} से।`) : ta ? "இன்றிரவு உங்களுக்கு." : "आज रात आपका।"] : null,
    d.check_in_time ? [ta ? `செக்-இன் ${clock(d.check_in_time)}.` : `चेक-इन ${clock(d.check_in_time)}।`, ta ? "நிம்மதியாக உறங்குங்கள்." : "आराम से सोइए।"] : null,
    d.facilities.length > 1 ? [ta ? `${d.facilities.length} அனுபவங்கள்.` : `${d.facilities.length} अनुभव।`, ta ? "அல்லது முழு ஓய்வு." : "या पूरा आराम।"] : null,
    [town ? `${town}.` : ta ? "இங்கேயே." : "यहीं।", ta ? "சற்று தங்குங்கள்." : "कुछ देर ठहरिए।"],
  ];
  return lines.filter((l): l is string[] => !!l).slice(0, 4);
}

/** The questions and answers in Tamil or Hindi: the same facts `siteFaq` gives in English, from the same records. */
export function faqIn(d: SiteData, lang: "ta" | "hi"): { q: string; a: string }[] {
  const ta = lang === "ta", n = d.name, out: { q: string; a: string }[] = [], a = siteAddress(d);
  const dishes = d.menu.flatMap((c) => c.items), veg = dishes.filter((m) => m.is_veg).length, low = d.rooms.map((r) => Number(r.base_rate)).filter((x) => x > 0).sort((x, y) => x - y)[0];
  const where = () => { if (a) out.push(ta ? { q: `${n} எங்கே உள்ளது?`, a: `${n} முகவரி: ${a.full}. வழி காண இந்தப் பக்கத்தில் “வழி” என்பதைத் தொடுங்கள்.` } : { q: `${n} कहाँ है?`, a: `${n} का पता: ${a.full}। रास्ते के लिए इस पेज पर “रास्ता” दबाएँ।` }); };
  if (d.type === "restaurant") {
    if (d.opens_at && d.closes_at) out.push(ta ? { q: `${n} திறந்திருக்கும் நேரம் என்ன?`, a: `${n} தினமும் ${clock(d.opens_at)} முதல் ${clock(d.closes_at)} வரை திறந்திருக்கும்.` } : { q: `${n} कब खुला रहता है?`, a: `${n} रोज़ ${clock(d.opens_at)} से ${clock(d.closes_at)} तक खुला रहता है।` });
    where();
    if (d.cuisines?.length) out.push(ta ? { q: `${n}-இல் என்ன உணவு கிடைக்கும்?`, a: `${d.cuisines.join(", ")}.${dishes.length > 1 ? ` மெனுவில் ${dishes.length} உணவுகள் உள்ளன; இன்றைய விலைகள் இந்தப் பக்கத்தில்.` : ""}` } : { q: `${n} में क्या खाना मिलता है?`, a: `${d.cuisines.join(", ")}।${dishes.length > 1 ? ` मेन्यू में ${dishes.length} व्यंजन हैं; आज की कीमतें इसी पेज पर।` : ""}` });
    if (veg > 0) out.push(ta ? { q: `${n}-இல் சைவ உணவு உண்டா?`, a: veg === dishes.length ? "ஆம் — முழு மெனுவும் சைவம்." : `ஆம் — மெனுவில் உள்ள ${dishes.length} உணவுகளில் ${veg} சைவம்; பச்சைப் புள்ளியால் குறிக்கப்பட்டுள்ளன.` } : { q: `क्या ${n} में शाकाहारी खाना है?`, a: veg === dishes.length ? "हाँ — पूरा मेन्यू शाकाहारी है।" : `हाँ — मेन्यू के ${dishes.length} व्यंजनों में ${veg} शाकाहारी हैं; हरे निशान से दिखाए गए हैं।` });
    if (d.price_for_two) out.push(ta ? { q: `${n}-இல் இருவருக்கு எவ்வளவு ஆகும்?`, a: `இருவருக்கு சுமார் ${rupees(Number(d.price_for_two))}.` } : { q: `${n} में दो लोगों का खर्च कितना है?`, a: `दो के लिए लगभग ${rupees(Number(d.price_for_two))}।` });
    if (d.can.order) out.push(ta ? { q: `${n}-இல் ஆன்லைனில் ஆர்டர் செய்யலாமா?`, a: "ஆம் — இந்த இணையதளத்திலேயே ஆர்டர் செய்யலாம். செயலி எதுவும் தேவையில்லை." } : { q: `क्या ${n} से ऑनलाइन ऑर्डर कर सकते हैं?`, a: "हाँ — इसी वेबसाइट से ऑर्डर करें। कोई ऐप नहीं चाहिए।" });
    if (d.can.reserve) out.push(ta ? { q: `${n}-இல் மேசை முன்பதிவு செய்யலாமா?`, a: "ஆம் — இந்த இணையதளத்தில் நாளையும் நேரத்தையும் தேர்ந்தெடுங்கள்." } : { q: `क्या ${n} में टेबल बुक कर सकते हैं?`, a: "हाँ — इसी वेबसाइट पर दिन और समय चुनें।" });
  } else {
    if (d.check_in_time && d.check_out_time) out.push(ta ? { q: `${n}-இல் செக்-இன், செக்-அவுட் நேரம் என்ன?`, a: `செக்-இன் ${clock(d.check_in_time)} முதல்; செக்-அவுட் ${clock(d.check_out_time)}-க்குள்.` } : { q: `${n} में चेक-इन और चेक-आउट का समय क्या है?`, a: `चेक-इन ${clock(d.check_in_time)} से; चेक-आउट ${clock(d.check_out_time)} तक।` });
    if (low) out.push(ta ? { q: `${n}-இல் அறைக் கட்டணம் எவ்வளவு?`, a: `அறைகள் ஒரு இரவுக்கு ${rupees(low)} முதல்; வரிகள் தனி.` } : { q: `${n} में कमरे का किराया कितना है?`, a: `कमरे ${rupees(low)} प्रति रात से; कर अलग।` });
    if (d.can.book) out.push(ta ? { q: `${n}-இல் அறை முன்பதிவு செய்வது எப்படி?`, a: "இந்த இணையதளத்தில் தேதிகளைத் தேர்ந்தெடுத்து நேரடியாக முன்பதிவு செய்யுங்கள்." } : { q: `${n} में कमरा कैसे बुक करें?`, a: "इसी वेबसाइट पर तारीखें चुनकर सीधे बुक करें।" });
    where();
    if (d.facilities.length) out.push(ta ? { q: `${n}-இல் என்னென்ன செய்யலாம்?`, a: `${d.facilities.slice(0, 8).map((f) => f.name).join(", ")}.` } : { q: `${n} में क्या-क्या कर सकते हैं?`, a: `${d.facilities.slice(0, 8).map((f) => f.name).join(", ")}।` });
    if (dishes.length) out.push(ta ? { q: `${n}-இல் உணவு கிடைக்குமா?`, a: "ஆம் — மெனு இந்தப் பக்கத்தில் உள்ளது." } : { q: `क्या ${n} में खाना मिलता है?`, a: "हाँ — मेन्यू इसी पेज पर है।" });
  }
  if (d.phone) out.push(ta ? { q: `${n}-ஐத் தொடர்பு கொள்வது எப்படி?`, a: `${d.phone} என்ற எண்ணை அழையுங்கள்.` } : { q: `${n} से संपर्क कैसे करें?`, a: `${d.phone} पर कॉल करें।` });
  return out.slice(0, 8);
}
