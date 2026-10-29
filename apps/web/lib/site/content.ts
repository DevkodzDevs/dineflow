/**
 * What the public site says (2026-10-29, the owner's item 18 — a landing page, pages for each kind of business, a blog).
 * Every line here is something DineFlow does today — no customer counts, no testimonials, no figures we cannot stand
 * behind. A feature added to the app may be added here; a feature taken out must be taken out here too.
 * The strings are on-screen text, so the whole-app Tamil and Hindi (lib/i18n) translate them.
 */
export type Feature = { key: string; icon: string; title: string; body: string };
export const FEATURES: Feature[] = [
  { key: "billing", icon: "receipt", title: "Bills and GST done right", body: "A GST rate and HSN code for each dish, CGST and SGST on every bill, credit notes for refunds, and Swiggy or Zomato orders billed without GST under section 9(5)." },
  { key: "qr", icon: "qr", title: "Guests order and pay from the table", body: "They scan the table's code, order, call a waiter or ask for the bill, watch the order move, and pay by UPI or card — on your own Razorpay account." },
  { key: "kitchen", icon: "chef", title: "A kitchen screen that keeps up", body: "Tickets reach the right station with the guest's notes on every dish; waiters hear when food is ready; an order board for the pass." },
  { key: "online", icon: "bike", title: "Online orders in one queue", body: "Your own website with delivery and takeaway, and Swiggy, Zomato and ONDC orders in the same queue once connected — accept, pause or slow down in a tap." },
  { key: "rooms", icon: "bed", title: "Rooms, front desk and housekeeping", body: "Bookings, check-in and check-out, folios with the room-tariff GST slabs, housekeeping and cleaning boards, and room calendars kept in step with booking sites." },
  { key: "team", icon: "people", title: "Staff, attendance and payroll", body: "Attendance by fingerprint or selfie, checklists, cleaning and work jobs, and payroll with payslips — each person starts on their own My day." },
  { key: "stock", icon: "box", title: "Pantry, recipes and purchases", body: "Stock is drawn by each dish's recipe as it is made, low stock is flagged, and purchase orders and goods received are kept together." },
  { key: "insight", icon: "chart", title: "Reports and an assistant", body: "Sales, tax and staff reports, a forecast for tomorrow, and an assistant that answers questions about your own business." },
];

export const INDIA: { title: string; body: string }[] = [
  { title: "GST and FSSAI on every bill", body: "Tax invoices, bills of supply for composition dealers, place of supply and SAC — the way an Indian bill must read." },
  { title: "UPI with the amount filled in", body: "Every bill carries a QR the guest's UPI app opens with the exact amount." },
  { title: "English, தமிழ், हिंदी", body: "The whole staff app in Tamil or Hindi, switched per person." },
  { title: "Keeps working when the internet drops", body: "Orders, kitchen tickets and bills carry on and catch up when the connection is back." },
  { title: "Any phone, tablet or computer", body: "In the browser, or as the app on Android, iPhone and Windows; 58 mm and 80 mm receipt printers." },
  { title: "Your data in India", body: "Each property's data is kept apart from every other's, on servers in Mumbai." },
];

export type Kind = { slug: string; name: string; title: string; intro: string; points: { title: string; body: string }[]; features: string[] };
export const KINDS: Kind[] = [
  { slug: "restaurants", name: "Restaurants", title: "For restaurants", intro: "From the first table to the last bill: orders at the table or at the till, the kitchen screen, billing with GST, and the day's close.",
    points: [
      { title: "Tables at a glance", body: "Every table's state on one floor — free, ordered, late, waiting to be cleaned — with move, merge and split." },
      { title: "Courses and notes", body: "Fire courses when the table is ready; a guest's \"less spicy\" reaches every dish on the ticket." },
      { title: "Bills in seconds", body: "Split evenly, take cash, UPI and card together, and send the bill or the receipt on WhatsApp." },
      { title: "The day adds up", body: "Shift and day close with the cash drawer, and a GST summary ready for your CA." },
    ], features: ["billing", "qr", "kitchen", "stock"] },
  { slug: "cafes", name: "Cafés", title: "For cafés and quick service", intro: "A fast counter, tokens for takeaway, and guests who can order from their table without waiting for anyone.",
    points: [
      { title: "A quick counter", body: "Search the menu, add sizes and add-ons, and print the ticket and the bill in one go." },
      { title: "Tokens for takeaway", body: "A token on every parcel order, and a ready bubble when it is done." },
      { title: "Order at the table", body: "A QR on each table — guests order, and pay by UPI or card when they are done." },
      { title: "Offers that apply themselves", body: "Happy hours and offers by day and time, coupons, and loyalty points for regulars." },
    ], features: ["qr", "billing", "kitchen", "insight"] },
  { slug: "cloud-kitchens", name: "Cloud kitchens", title: "For cloud kitchens", intro: "Every channel in one queue, a kitchen screen that keeps up, and the tax on aggregator orders handled the way the law asks.",
    points: [
      { title: "One queue", body: "Your website, Swiggy, Zomato and ONDC side by side, with accept and pause." },
      { title: "Section 9(5) handled", body: "Aggregator orders billed without GST — the platform pays it — and reported apart in your returns." },
      { title: "Packing and delivery charges", body: "Taxed with the food, on the bill the customer was quoted." },
      { title: "Stock by recipe", body: "Ingredients drawn as dishes are made, so you know what to buy tomorrow." },
    ], features: ["online", "kitchen", "billing", "stock"] },
  { slug: "hotels-resorts", name: "Hotels and resorts", title: "For hotels and resorts", intro: "Rooms and dining in one app: the front desk, housekeeping, the restaurant and room service, on one folio.",
    points: [
      { title: "Front desk", body: "Bookings, check-in and check-out, online pre-check-in, and the folio with every charge." },
      { title: "Room GST slabs", body: "The right rate on each night's tariff, and meals and extras with their own codes on the invoice." },
      { title: "Housekeeping", body: "Rooms to clean the moment a guest leaves, with who took them and when." },
      { title: "Room service on the folio", body: "An order from the restaurant posted to the room, paid at check-out." },
    ], features: ["rooms", "billing", "team", "insight"] },
];

export const FAQ: { q: string; a: string }[] = [
  { q: "Is there a free trial?", a: "Yes — 7 days with everything switched on, and no card needed. Your data stays when you join." },
  { q: "Do I need special hardware?", a: "No. Any phone, tablet or computer works; 58 mm and 80 mm receipt printers and a cash drawer work too." },
  { q: "Does it work without internet?", a: "Orders, kitchen tickets and bills keep working and catch up when the connection is back." },
  { q: "Can guests pay online?", a: "Yes, by UPI or card through your own Razorpay account — the money goes straight to you." },
  { q: "Which languages?", a: "The staff app in English, Tamil and Hindi, chosen by each person." },
  { q: "Can I run more than one outlet?", a: "Yes — switch between outlets from the same login, each with its own menu and reports." },
];
