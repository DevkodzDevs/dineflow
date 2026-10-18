# Translating DineFlow into Tamil and Hindi — the brief

Read with [design-system.md](sections/design-system.md), *The whole app in Tamil or Hindi*. The dictionaries are
`apps/web/public/i18n/{ta,hi}.<hash>.json`; `scripts/i18n-check.mjs` reports what is missing and merges new entries.

DineFlow is a restaurant POS and hotel/resort management app used in India by owners, managers, receptionists,
waiters, cooks, housekeepers, cleaners, electricians, gardeners and security guards. Staff can switch the whole app
to Tamil or to Hindi. You are translating the app's on-screen English: buttons, tabs, headings, labels, hints,
messages, empty states, tooltips.

## How to write
- Plain, short, everyday words that a waiter or housekeeper in Tamil Nadu / North India actually uses at work.
  Not literary, not Sanskritised/pure-Tamil jargon. Where staff normally say the English word, write it in the
  native script (ஆர்டர், பில், மெனு, செக்-இன் / ऑर्डर, बिल, मेनू, चेक-इन).
- Buttons are imperative and short ("Save" → "சேமி" / "सेव करें"). Keep the tone friendly and direct.
- Same length or shorter than natural; screens are small. Never add explanations.
- Keep exactly as they are: numbers, ₹ amounts, %, times, codes and identifiers (T1, Room 104, BILL-12, GSTR-3B,
  Sec 44AB, 33AAB…), brand and product names (DineFlow, WhatsApp, Swiggy, Zomato, Tally, Excel, PDF, Google, Chrome,
  Safari, Android, iPhone, iPad, Razorpay, MakeMyTrip, Booking.com, Airbnb, ONDC, iCal), acronyms (GST, GSTIN, UPI,
  PF, ESI, KOT, OTA, QR, FSSAI, PAN, TDS, HSN, SAC, CGST, SGST, IGST, CA, OTP, AI, ID, VIP, AC, CCTV, KDS, POS, API),
  keyboard keys (Ctrl, Esc, Enter, Tab, Shift, ↑ ↓ ← →).
- Keep symbols and their positions: "·", "—", "→", "…", "•", "/", "+", ":", leading "· " or trailing " ·",
  quotes, brackets. If the English starts or ends with punctuation or a space-joined fragment, so does yours.
- Many strings are FRAGMENTS of a sentence (the rest is a number or a name shown next to it), e.g. "on average
  before someone takes it.", "· cleaned by", "nights · tap two to pick dates". Translate the fragment so it reads
  naturally in that spot; do not complete or reorder it into a sentence it is not.
- `{0}`, `{1}`… (template chunks only) are values filled in at run time (a number, a name, a room). Every
  placeholder must appear exactly once in each translation; you may move them to where the grammar needs them
  (Tamil and Hindi put verbs last). Example: "{0} is on it" → ta "{0} செய்கிறார்", hi "{0} कर रहे हैं".
- If a string is NOT something a person reads on screen — code, a CSS class, a URL or path, a data key, a
  storage key, an internal id, a log line, a regex, an SQL fragment, a file name — return `null` for it.
- Never translate a person's name, a dish name in the data, or an example value inside quotes like "Ravi Kumar".
  You may translate example dish/ingredient words in placeholders ("e.g. Paneer tikka") — keep the dish names.

## Glossary — use these, every time
| English | Tamil | Hindi |
| --- | --- | --- |
| Order / Orders | ஆர்டர் / ஆர்டர்கள் | ऑर्डर |
| Table | மேசை | टेबल |
| Room / Rooms | அறை / அறைகள் | कमरा / कमरे |
| Bill / Billing | பில் / பில்லிங் | बिल / बिलिंग |
| Invoice | இன்வாய்ஸ் | इनवॉइस |
| Kitchen | சமையலறை | किचन |
| Menu / Dish / Dishes | மெனு / உணவு / உணவுகள் | मेनू / डिश / डिश |
| Staff | பணியாளர்கள் | स्टाफ |
| Guest | விருந்தினர் | मेहमान |
| Customer | வாடிக்கையாளர் | ग्राहक |
| Front desk | வரவேற்பு | फ्रंट डेस्क |
| Housekeeping | ஹவுஸ்கீப்பிங் | हाउसकीपिंग |
| Check-in / Check-out | செக்-இன் / செக்-அவுட் | चेक-इन / चेक-आउट |
| Booking / Reservation | முன்பதிவு | बुकिंग |
| Payment / Paid | பணம் செலுத்துதல் / பணம் வந்தது | भुगतान / भुगतान हुआ |
| Cash / Card | ரொக்கம் / கார்டு | नकद / कार्ड |
| Expense / Expenses | செலவு / செலவுகள் | खर्च |
| Payroll / Salary / Pay | சம்பளம் | वेतन |
| Advance | முன்பணம் | एडवांस |
| Attendance | வருகை | हाज़िरी |
| Pantry / Stock / Ingredient | சரக்கு அறை / சரக்கு / பொருள் | भंडार / स्टॉक / सामग्री |
| Supplier / Purchase order | சப்ளையர் / கொள்முதல் ஆர்டர் | सप्लायर / खरीद ऑर्डर |
| Reports | அறிக்கைகள் | रिपोर्ट |
| Settings | அமைப்புகள் | सेटिंग्स |
| Save / Cancel / Delete / Edit / Add / Search / Close | சேமி / ரத்து / நீக்கு / திருத்து / சேர் / தேடு / மூடு | सेव करें / रद्द करें / हटाएँ / बदलें / जोड़ें / खोजें / बंद करें |
| Done | முடிந்தது | हो गया |
| Today / Yesterday / Tomorrow | இன்று / நேற்று / நாளை | आज / कल / कल |
| Owner / Manager / Supervisor | உரிமையாளர் / மேலாளர் / மேற்பார்வையாளர் | मालिक / मैनेजर / सुपरवाइज़र |
| Waiter / Chef / Cook | வெயிட்டர் / செஃப் / சமையல்காரர் | वेटर / शेफ / रसोइया |
| Cleaner / Labourer / Labour | துப்புரவுப் பணியாளர் / கூலியாள் / கூலியாட்கள் | सफ़ाईकर्मी / मज़दूर / मज़दूर |
| Work / Job | வேலை | काम |
| Late / Waiting / On it | தாமதம் / காத்திருக்கிறது / நடக்கிறது | देर / इंतज़ार / चल रहा है |
| I'll take it | எடுக்கிறேன் | मैं लूँगा |
| Control room (the owner's dashboard) | கட்டுப்பாட்டு அறை | कंट्रोल रूम |
| Section | பகுதி | सेक्शन |
| Property (the hotel/restaurant) | நிறுவனம் | प्रॉपर्टी |
| Outlet / Chain | கிளை / கிளைகள் | आउटलेट / चेन |
| Shift | ஷிஃப்ட் | शिफ्ट |
| Tax | வரி | टैक्स |
| Sign in / Sign out / Password | உள்நுழை / வெளியேறு / கடவுச்சொல் | साइन इन / साइन आउट / पासवर्ड |
| Notification / Alert | அறிவிப்பு | सूचना |
| Department / Position | துறை / பதவி | विभाग / पद |
| Delivery / Parcel / Dine in | டெலிவரி / பார்சல் / இங்கே சாப்பிட | डिलीवरी / पार्सल / यहीं खाना |
| Free (table) / Reserved | காலி / முன்பதிவு | खाली / आरक्षित |
| Ready / Cooking / Served | தயார் / சமையலில் / பரிமாறியது | तैयार / बन रहा है / परोस दिया |
| Night audit | இரவு தணிக்கை | नाइट ऑडिट |

## Output (for `node scripts/i18n-check.mjs --merge file.json`)
One JSON object keyed by the English exactly as `--missing` listed it, each value `{"ta": "…", "hi": "…"}`, or
`null` when the string is not on-screen text (it is then remembered as looked-at and stops being reported).
A key with `{0}`, `{1}`… is a template: every placeholder appears exactly once in each translation, and may move.
A value glued onto a letter in the English (`"{0} dish{1}"`) is an English plural ending — the app drops it in
Tamil and Hindi, so keep the placeholder where it is. An empty string is allowed on purpose for the second half
of a word split across two elements ("Neigh" + "bours": the first carries the whole word, the second is `""`).
UTF-8, no comments. Then run the script again: coverage should read 100%.

How this was first made (2026-10-18): the 4,529 strings and 617 templates were split into 22 chunks grouped by
screen, translated by parallel agents under this brief, checked (every id present, placeholders intact), merged,
and then the screens were walked in Tamil by `langtheme.mjs` to catch what only the browser sees — words the
database sends (Tomorrow's labels), split headings, lower-case labels passed as props.
