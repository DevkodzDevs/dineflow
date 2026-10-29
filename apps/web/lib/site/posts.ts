/**
 * The blog (2026-10-29, item 18): articles a restaurant or hotel owner in India actually needs, written plainly, each true as
 * written on its date. Rules and rates change — a post that goes out of date is corrected (and its `updated` set) or taken
 * down. English only, like the guest pages; lib/i18n leaves this file alone (the scan skips lib/site/posts.ts).
 */
export type Block = { h?: string; p?: string; list?: string[]; note?: string };
export type Post = { slug: string; title: string; summary: string; date: string; updated?: string; minutes: number; body: Block[] };

export const POSTS: Post[] = [
  {
    slug: "gst-on-restaurant-bills", date: "2026-10-29", minutes: 4,
    title: "GST on restaurant bills: 5%, 18%, and the dish that is different",
    summary: "Which rate your restaurant charges, when a single bill needs two rates, and what a composition dealer must print instead.",
    body: [
      { p: "Most restaurants in India charge GST at 5% on food and service, without input tax credit. That one rate covers dine-in, takeaway and delivery from your own counter." },
      { h: "When the rate is 18%", p: "A restaurant inside a hotel whose rooms are let at more than ₹7,500 a night is in \"specified premises\" and charges 18%, with input tax credit. How a hotel counts as specified premises was changed in 2025 — if you share a building with rooms, confirm your rate with your CA." },
      { h: "The dish that is different", p: "Goods sold as they are — a sealed bottle of water, a packaged soft drink — can carry their own GST rate rather than the restaurant's. Then one bill has two rates, and each must be taxed on its own share of the bill." },
      { list: ["Food and service: the restaurant's rate (usually 5%).", "A packaged item sold as it is: its own rate and HSN code.", "Alcohol for drinking: outside GST altogether — state VAT applies instead."] },
      { h: "Composition dealers", p: "A restaurant on the composition scheme may not collect GST from guests. It prints a bill of supply that says so, and pays 5% of its turnover through CMP-08." },
      { h: "In DineFlow", p: "Each dish can carry its own GST rate and HSN code. A bill with several rates shares the discount and service charge across them and prints a tax table by rate; the tax invoice shows each dish at its own rate. Composition and unregistered properties print a bill of supply with no GST." },
      { note: "This is a guide, not tax advice. Rates and rules change; your CA has the last word on your business." },
    ],
  },
  {
    slug: "swiggy-zomato-gst-section-9-5", date: "2026-10-29", minutes: 3,
    title: "Swiggy and Zomato orders: who pays the GST?",
    summary: "Since January 2022 the platform pays the GST on food it delivers for you. Here is what that means for your bills and your return.",
    body: [
      { p: "From 1 January 2022, GST on restaurant service supplied through an e-commerce operator — Swiggy, Zomato and the ONDC buyer apps — is collected and paid by the operator, not the restaurant. This is section 9(5) of the CGST Act." },
      { h: "What changes on your side", list: ["Do not charge GST again on those orders — the customer has already paid it to the platform.", "Report the value of those supplies in GSTR-3B, table 3.1.1(ii), with no tax against them.", "Orders from your own website, your own app or a QR at the table are yours: charge GST on them as usual."] },
      { h: "In DineFlow", p: "An order that arrives through a Swiggy, Zomato or ONDC channel is billed without GST, and the bill says the operator pays it under section 9(5). The Tax screen lists these sales apart from your taxed sales, so the month's figures match the return." },
      { note: "This is a guide, not tax advice. Your CA has the last word on your returns." },
    ],
  },
  {
    slug: "service-charge-is-optional", date: "2026-10-29", minutes: 3,
    title: "Service charge is optional — here is how to handle it",
    summary: "A restaurant may not add a service charge automatically. What the guidelines say, and a simple way to stay on the right side of them.",
    body: [
      { p: "In July 2022 the Central Consumer Protection Authority issued guidelines on service charge in hotels and restaurants. The Delhi High Court upheld them in 2025." },
      { h: "What the guidelines say", list: ["A service charge may not be added to the bill automatically or by default.", "It may not be collected under another name.", "The guest must be told it is voluntary, and may not be refused entry or service for declining it.", "It may not be added to the bill and then taxed as if it were part of the food."] },
      { h: "A simple way to handle it", p: "Keep the menu price as the price. If a guest wants to leave a service charge or a tip, let them choose it — and make sure the bill shows it as a separate, optional line." },
      { h: "In DineFlow", p: "Every bill has a service charge switch, marked optional — only if the guest agrees. It is off by default for orders placed through a QR, your website or a delivery platform, because those guests never saw it." },
      { note: "This is a guide, not legal advice." },
    ],
  },
  {
    slug: "qr-table-ordering", date: "2026-10-29", minutes: 4,
    title: "QR table ordering, start to finish",
    summary: "What a guest sees from scanning the table's code to paying the bill, and what your staff see at each step.",
    body: [
      { h: "1. Scan and order", p: "Each table has its own QR code. The guest scans it, sees your menu with photos, sizes and add-ons, adds a note for the kitchen, and places the order — no app to install." },
      { h: "2. The staff hear it", p: "A card pops up for the waiters with the table, the dishes and the total. One tap accepts it and sends it to the kitchen, notes and all. A second round from the same table joins the same ticket." },
      { h: "3. The guest follows it", p: "A small card on the guest's phone moves through Sent, Kitchen, Cooking, Ready and Served. They can call a waiter, ask for water or ask for the bill from the same screen." },
      { h: "4. The bill and paying", p: "When the bill is printed, the guest's card shows Pay with the amount. They pay by UPI with the amount filled in, or by card through your own Razorpay account — the money goes to you, not to us. The table frees itself and a cleaning job opens." },
      { h: "What it costs to set up", p: "Print the codes from Settings → Table QR and put one on each table. That is all." },
    ],
  },
];
