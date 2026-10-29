# Billing and invoices

**Routes** `/billing` · `/billing/[orderId]` · `/invoices` · `/invoices/[id]`
**Files** `app/(app)/billing/page.tsx` · `DayClose.tsx` · `[orderId]/BillClient.tsx` ·
`app/(app)/invoices/InvoicesClient.tsx` · `[id]/InvoiceView.tsx` · both `actions.ts`
**Reads** `bills`, `orders`, `bookings`, `day_closes`, `invoices`
**Writes** `generate_bill`, `settle_bill`, `close_day`, `shift_close`, `shift_expected`,
`coupon_check`, `customer_lookup`, `generate_dining_invoice`, `generate_stay_invoice`, `void_bill` (0087)

## What it is

Money leaving the building. `/billing` turns an open ticket into a bill, takes payment, and closes
the shift and the day. `/invoices` is the GST tax invoice — a different document with legal
requirements, generated from a bill or a stay.

## How it works

**Bill → payment → settle.** `generate_bill` freezes the ticket into a `bills` row with its own
numbering and its GST breakdown. `settle_bill` records one or more payments (`cash`, `card`, `upi`…)
against it. **A bill cannot be part-paid**: `settle_bill` (0077) refuses unless the payments in one call
cover the total — the till's "Split" is several methods on one settlement, not a deferred balance.

**The maths lives in `@dineflow/shared/billing.ts`**, not in the screen, because the mobile app and
the printed receipt must agree with it to the paisa.

**GST** is per-property and per-thing: `gst_rate` for dining, `room_gst_rate` /
`room_gst_rate_high` / `room_gst_threshold` for rooms (India's slab rule), `facility_gst_rate` for
facilities. `service_charge_pct` is separate and is not a tax.

**Shift and day close.** `shift_expected` says what the drawer should hold; `shift_close` records
what it actually held and the difference — since 0087 against `cash_drawer` = cash sales + cash in −
cash out (Cash & controls records the in/out), so a float top-up no longer reads as "over". `close_day`
writes the day's row for the reports; **it does not lock anything** — it is an upsert that can be run
again, and nothing refuses a change to a closed day. Monthly sealing is `business_periods` (`proof`).
0087 also fixed its `total_sales`: it joined bills to payments and summed the bill once per payment,
so a bill paid half cash / half UPI counted twice.

**Invoices** are a separate, numbered series. `/invoices` has a month strip with a bar per month and
a reading pane beside the list; on a phone that pane becomes a sheet.

## Before you edit

- **Billing keeps its own design** (owner, 2026-10-15): when the other Dining screens moved to Simple Service
  (see [design-system.md](design-system.md)), Billing was built that way too and then put back exactly as it
  was, at the owner's request — the list with Ready to bill and Today's bills, and the bill page with Discount /
  Guest, Generate bill, Take payment and the counter printer beside it. Do not move it to the `.svc-*` pieces
  without asking. One change since, also asked for: **the coupon field** (`data-coupon`) has the ticket inside the
  box like a search field's glass and Apply at the box's own height; an applied coupon is a green card with the
  code, what it takes off and a cross (`data-coupon-applied`) — it was a loose 14px icon beside a bare box. Generate bill and Mark paid carry `data-kbd-primary` (Ctrl Enter, `Keys.tsx`).

- **Generate bill, Mark paid and Void do not call `router.refresh()`** (2026-10-13). Their actions revalidate, and an action that
  revalidates answers with the re-rendered page — the refresh rendered it a second time. Don't add one back;
  see shell-and-nav.md (speed). `actcheck.mjs`.
- **A dining invoice is its bill, line for line** (0100, 2026-10-13). Each dish carries `taxable` — its share
  of the bill's value after the discount — and the service charge and the on-time fee are lines of their own;
  the lines' tax equals the bill's CGST + SGST to the paisa (the rounding goes on the largest line). The header
  adds up: (dishes + service charge + fee) − (discount + a waived meal) + CGST + SGST + round-off = total. It
  used to list dishes at full price with tax on that, and leave out the service charge and fee: 19 of 36 live
  invoices disagreed with themselves. A bill that collected no GST shows no rate. Older invoices have no
  `taxable`; InvoiceView falls back to the amount.
- **The GST summary on an invoice** groups by rate *and SAC* from each line's `taxable` (InvoiceView), so a
  stay shows its room (996311), meals (996331) and extras (999721) apart.
- **The printed bill shows what it charged** — the service charge and the on-time promise (fee, or a meal
  waived) on the HTML print, the ESC/POS print and the screen receipt; the bill's own date (a reprint used to
  print the reprint's time) and its number as the screen shows it (`BILL-0012`). The receipt's tax summary uses
  the bill's tax base and amounts: with a service charge it used to print a 19.8% "rate".
- **The number series cannot be reset**: `counters` is written only by `next_number` (no direct writes for any
  API role), and `bills (restaurant_id, bill_no)` and `invoices (restaurant_id, invoice_no)` are unique.
- **generate_bill refuses a negative discount** or one above 100% (a negative one was a hidden surcharge, and
  taxed); **settle_bill refuses a voided bill** (a payment queued offline could revive it).
- **The invoice's bill-to GSTIN is checked** (`GSTIN_RE` in `lib/wrote.ts`: 15 characters, state + PAN + entity
  + Z + check) and upper-cased; a failed save says so instead of closing the form.
- Not done (see the money review in the 2026-10-13 report): staff can still write `order_items` prices and
  quantities, `orders.status`, `bookings.rate`, `booking_charges`, `customers.points` and `shift_closes`
  directly. *(Done 2026-10-29, 0146: 9(5), a rate per dish, the service-charge switch, credit notes — below; and 0150: the
  direct writes are fenced — "Money changes only through the till", below.)*
- **Scan to pay is one card, and its QR follows the payment method** (`[data-scan-pay]`, `data-mode`,
  2026-10-13). With UPI among the rows and a UPI ID set (Settings → Payments, `restaurants.upi_vpa` /
  `upi_payee`), the QR is a `upi://pay` request for exactly the UPI amount — the whole bill, or the
  UPI part of a split ("UPI part of ₹…"), redrawn as the rows change (`upiUri` / `validVpa` in
  `lib/upi.ts`, the same link format the guest's `/pay` page builds; 4 unit tests). With card or cash
  chosen, or no UPI ID, it is the bill link (`/pay/<token>`), which opens the bill on the guest's
  phone with UPI and card; UPI chosen without an ID says where to add one. The QR is a 216px white
  tile with the amount in large type under it; the link's Open / Copy link / WhatsApp sit in a footer
  strip. The Take payment card carries no QR of its own — one QR on the screen, never two (the first
  version drew the UPI QR inside Take payment and the link card below it). Probe: `scan.mjs` (11,
  on a real unpaid bill: the amount in the QR, a split, Full cash, back to UPI; nothing is paid).


- **Invoices' figures come from `invoice_summary` (0089)**, not from the rows on screen: *Invoiced*,
  *GST collected*, *Stay invoices*, *Outstanding* and the six-month strip are counted by the database
  over the whole window. The list itself is the latest **300** (`SHOWN`); past that a footnote
  (`[data-shown]`) says "Showing the latest 300 of N — the totals above count all N". Summing the
  rows in the page was wrong past PostgREST's 1000-row cap.


- **Never recompute a settled bill.** The GST breakdown on a `bills` row is the legal record of what
  was charged. If a rate changes, it changes for the next bill.
- **Do not invent invoice numbers in the client.** The series is allocated server-side; a gap or a
  duplicate is a compliance problem, not a display bug.
- **The invoices suite is time-dependent.** Demo invoices age out of the default 30-day window; pin
  the suite to `?days=365` rather than "fixing" the screen.
- **A refund is not a negative bill** — check how the existing flow records it before adding one.

## Verify

```
node design-test.mjs     # invoices: month strip + bars, row click fills the pane, totals,
                         # subtotal/GST/total/owed, the next row swaps the pane, the phone sheet
pnpm --filter @dineflow/web test
```

## See also

[orders-and-till.md](orders-and-till.md) · [tax-and-compliance.md](tax-and-compliance.md) ·
[reports-and-forecast.md](reports-and-forecast.md)

- **Printed bills and KOTs escape every value** (`lib/print/html.ts`, `e()`): item names, notes and
  the guest's name reach them from public storefront orders, and the browser-print fallback writes the
  HTML into a same-origin window — unescaped, a note could run script with the staff member's
  session. The pay QR must be an image `data:` URL. Tested in `lib/security.test.ts`.
- **Direct bill/invoice edits are fenced in the database (0084, tightened 0087)**: a bill cannot be
  changed directly at all now — a void goes through `void_bill(p_bill, p_reason)`, which checks the role
  (owner/manager/supervisor/cashier), insists on a reason, puts the name on the bill and the order back
  to `open`, and leaves a `bill.void` row in the audit trail. The invoice's bill-to fields remain the
  one direct update. The "Void & edit" link opens a `ReasonDialog`. See
  [controls-and-intelligence.md](controls-and-intelligence.md).
- **`PrinterOutput` (the machine the bill comes out of) takes `fit`** (2026-10-13, for the folio).
  With `fit` its sides narrow from 22px to 8px to the width of the box it sits in, so a narrow column
  keeps the paper whole. The bill does not pass it: its column is 400px. The machine body and the
  shadow it casts on the paper are `no-print`, so a page print is the paper only.
- **Cash settles pop the drawer** (`openDrawer()` in `usePrinter.ts`): every bill printer with the
  "kick the drawer" switch gets ESC p after the receipt. The switch had been saved since 0004 and read
  by nothing.

- **Invoiced by month is a column chart with a readout** (`MonthStrip` in `InvoicesClient.tsx`, every
  width): one series, one hue — bars from a common baseline, the chosen month solid tint and the rest
  32% tint, empty months a 3px stub — and the chosen month's total, invoice count and change on the
  month before in a readout above. It opens on the latest month with invoices; tap, hover or focus a
  bar to read another. No number on every bar; a `sr-only` table carries all six for a screen reader.
  The bar buttons strip the global button chrome (`!border-0 !bg-transparent !p-0`) — without it each
  column drew a heavy rounded box. It used to be a 3×2 grid of thin bars with twelve figures.
- **An invoice's detail (`Detail`, the pane beside the list from 1280 and the dialog below it)** reads
  like an invoice: a headline block washed green when settled or red when not — the number, the
  kind, "Paid in full" or "₹X due", the total in 34px, the issue date and property; then who it is
  billed to (the phone is a tap-to-call link); the charges as a receipt list (description, qty ×
  rate · GST, amount); the sums in order (subtotal, discount, GST with its CGST/SGST split, total,
  paid, balance); and **Open invoice / Print as real buttons** (`btn-filled`, `btn-gray`). Open
  invoice was `btn btn-primary`, a class this app does not have, and rendered as plain text. The
  pane sticks at 92px, under the floating top bar. Probe: `invdlg.mjs`; `design-test`'s invoice
  checks predate this and the month chart (they read a hidden month table as invoice rows).
- **On a phone the filters are two segmented rows** (`sm:hidden`): All · Stay · Dining, and 7 days ·
  30 days · 90 days · 1 yr, each one row, 44px. sm and up keep the chips. Probe: `inv.mjs` (20 checks
  over five widths, with the order header).
- **Short copy** (2026-10-23): subtitles and hints cut to a few words.

- **The counter, redrawn** (2026-10-24, the owner: "pro-level billing, ultra modern, and who billed — from the login"). The
  "keeps its own design" note above is superseded by this request. `page.tsx` fetches, `BillingBoard.tsx` draws: who is at the
  counter (the login) and how many payments they took today; six figures (sales, average bill, unpaid, cash, UPI, card with its
  share) and the payment mix as one bar; **Ready to bill** — filter by kind (Dine in / Parcel / Delivery), oldest or biggest first,
  the wait amber at 45 min and red at 90; **Today's bills** — search (bill, order, table, name), filter by state, each row with its
  payment methods and "Billed by <name> · paid to <name>". The bill: "Billed by" and "At the counter" chips, **Split evenly ÷2 ÷3
  ÷4** (the last share takes the odd paise), **Cash given** keys (Exact / ₹100 / ₹200 / ₹500 / ₹2000) and the change to return,
  large. Who took each payment is `payments.received_by` (0139, defaulting to the signed-in person).
- **No invoices yet** (2026-10-24) is `Empty`'s sm+ form — the invoice icon, blue (design-system.md). The phone is unchanged.
- **Invoices: Cards · Table (2026-10-25, the app's ViewSwitch, `[data-view-switch=invoices]`).** The 620px table scrolled a
  phone sideways. Cards below md (`[data-invoice-card]`): the number, kind and date, the guest, the total and status, what
  is still due in red. The detail pane beside the list from xl is unchanged. `df-view:invoices`.
## Stage 1 money (2026-10-29, 0146 / 0147 — the owner: "the money errors first, carefully")

- **One tax sum: `bill_tax(groups, base, collect)`.** The dishes' value per rate (`[{rate, amount}]`) and everything taxed
  (the dishes after the discount + service charge + on-time fee + packing & delivery) → the base shared out by value, the
  largest rate takes the paise, each part taxed at its rate (half CGST, half SGST). `generate_bill` and `dine_order` (the
  guest's quote) both call it; `@dineflow/shared` `billTax` / `computeBill` is the same sum line for line for the preview,
  and `r2` now rounds as Postgres does (half away from zero — 2.475 → 2.48; the plain float sum gave 2.47). With one rate
  it is exactly the old sum (400 bases × 4 rates, 0 differences). `lib/billing.test.ts` (8) is pinned to the database's
  own answers.
- **A GST rate and an HSN per dish.** `menu_items.gst_rate` (0, 5, 12, 18, 28, 40; null = the property's) and `hsn`
  (4–8 digits; null = SAC 996331), set in the dish editor (`[data-dish-tax]`). `order_item_tax` (BEFORE INSERT on
  order_items) copies them onto the line from the dish, whoever writes the line, and keeps them — a hand-set rate is
  ignored, a menu change never touches an order already taken. `bills.tax_lines` (`[{rate, base, cgst, sgst}]`) is the
  tax per rate as charged; the receipt, the thermal and the browser print show a per-rate table when there are several.
  The tax invoice puts each dish at its own rate and code; the service charge, fee and packing become one line a rate
  ("Service charge & charges") when the rates differ, and the lines still equal the bill to the paisa.
- **Not IGST.** A restaurant's or hotel's place of supply is the property (IGST Act s.12(2)/(3)), so its bill is CGST + SGST
  whoever the buyer is. Building IGST (the plan's item 3) would have made wrong invoices; only HSN/SAC was built.
- **A QR / website order's money reaches the bill** (the owner's T3: quoted ₹132 with 10% off, billed ₹147).
  `accept_online_order_for` adds the online order's `raw.discount` and `raw.fee` to `orders.discount_amount` /
  `extra_charges` (website channel only — an aggregator's figures are its own), and `offer_title`; a second round adds
  to them. `generate_bill` takes `discount_amount` off with the rest and charges `extra_charges` as `bills.charges`
  ("Packing & delivery", taxed with the food). The bill page shows them (`[data-online-offer]`, `[data-packing]`).
- **Section 9(5).** An order through a `swiggy` / `zomato` / `ondc` channel: no GST on the bill (`gst_by_operator`,
  every rate 0), the receipt says the operator pays it (`[data-operator-note]`), the bill page says so (`[data-gst-operator]`).
- **The service charge is a switch** (`[data-service-charge]`, `generate_bill(p_service_charge)`, `bills.service_charge_on`):
  on by default at the till as before, off by default for an order that came from a QR, the website or an aggregator —
  that guest never saw it. "Only if guest agrees": a service charge cannot be compulsory (CCPA, 2022).
- **Credit notes** (`credit_notes`, `issue_credit_note(bill, amount, reason, method)`): only on a paid bill (an unpaid one
  is voided); owner, manager, supervisor or cashier; a reason; numbered CN-0001…; the GST in proportion (the last note on
  a bill takes exactly what is left, so the notes' tax = the bill's); cash goes out of the drawer as a `cash_movements`
  'out' / 'refund' row (the shift's expected cash follows); `bill.refund` in the audit trail; the bill is never changed.
  The paid bill lists them (`[data-credit-notes]`, each printable — `creditNoteHtml`) and offers *Refund / credit note*
  (`[data-refund]`, gone when nothing is left) → `RefundSheet` (amount, Cash/UPI/Card/Other, reasons). `close_day` keeps
  the day's `refunds` beside the sales. Loyalty points earned on a refunded bill are not taken back (yet); Tally's export
  does not carry credit notes (yet).
- Probe: `pw/money151.mjs` (11). Older bills have no `tax_lines` and print as before.
## Money changes only through the till (2026-10-29, 0150 — item 7)

A fence trigger (`money_fence`) on order_items, orders, bookings, booking_charges, customers and shift_closes looks at who
is writing: `_api_write()` is `current_user in ('authenticated','anon')` — true only for a write straight from the API; a
security-definer RPC runs as its owner and the service role as itself, so every RPC is untouched. Refused from the API, each
with a sentence that says where to do it: a line's price, quantity, dish, options, a new or deleted line; an order's status,
`discount_amount`, `extra_charges`, promise, number, channel, a new or deleted order; a booking's rate, a new or deleted
booking; editing or deleting a room charge; customers' points, visits and spend (a new customer starts at 0); any shift
close. Still allowed: a line's **status** (the kitchen, the waiter's Serve, the offline queue, the mobile app), an order's notes
and customer, a customer's name, notes and tags, the front desk's cancel, and **adding** a room charge (its form inserts it) —
which now writes `charge.add` / `discount.give` to the audit trail (`audit_booking_charges`). Dry-run (dry150, 19 cases) and
from the screens (`fence150.mjs`): the kitchen's Start cooking → Ready → Served, the folio's charge with its audit line.
**A new direct write to these tables from the browser will be refused — add it as an RPC.**
- **Room service follows the dish's GST rate (2026-10-29, 0155)** — `post_order_to_room` uses `bill_tax` with the order's lines
  grouped by rate, like `generate_bill`; before, a dish with its own rate was taxed at the property's on the folio (front-desk.md).
- **Shorter copy (2026-10-29, the owner: "maximum 3 or 4 words, try 2 or 3 — clean and neat").** Subtitles, hints, helper
  lines and empty-state hints cut to two–four words, or removed where they said the obvious. Error and refusal messages,
  steps to follow outside the app, printed and exported text, WhatsApp bodies and tooltips were left as they were.
