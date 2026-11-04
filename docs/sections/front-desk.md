# Front desk (hotel / resort only)

**Routes** `/frontdesk` · `/frontdesk/[id]` (the folio) · `/frontdesk/night-audit`
**Files** `app/(app)/frontdesk/page.tsx` · `FrontDeskClient.tsx` · `[id]/FolioClient.tsx` ·
`night-audit/NightAuditClient.tsx` · `actions.ts`
**Reads** `bookings`, `guests`, `rooms`, `room_types`, `booking_charges`, `orders`, `night_audits`
**Writes** `booking_move_room`, `create_booking`, `check_in`, `check_out`, `folio_totals`, `post_order_to_room`,
`run_night_audit`, `night_audit_numbers`

## What it is

Arrivals, departures and who is in which room. The folio is one stay's bill as it accumulates. The
night audit is the daily close for the rooms side — the hotel equivalent of `close_day`.

**This section does not exist for a restaurant.** `modulesFor()` hides it.

## How it works

A **booking** moves `reserved` → `checked_in` → `checked_out` (or `cancelled` / `no_show`).
`check_in` assigns a room and flips the room's status; `check_out` releases it and queues a cleaning
task (see [housekeeping.md](housekeeping.md)).

A **folio** collects charges: the room rate per night, plus anything posted to it.
`post_order_to_room` is how a Room-type ticket from the till lands on a stay. `folio_totals` does
the arithmetic in one place so the folio, the invoice and the night audit agree.

The **night audit** rolls the business date forward, posts the night's room charges and prints the
discrepancy list — rooms the front office and housekeeping disagree about.

The room chooser uses `.keycard` tiles with a condition dot in the corner, so the person booking can
see at a glance which free room is actually sellable.

**Online check-in on the folio** (`[id]/OnlineCheckin.tsx`, reserved bookings only): *not yet* /
*done* with the time; *Send on WhatsApp*, *Copy link*, *Open on this tablet* (`/checkin/<token>?kiosk=1`
in the same tab). Once done it shows arrival time, the ID to look at (type and last four),
nationality and requests, and for a foreign national a Form C reminder. The link's host comes from
`NEXT_PUBLIC_CLOUD_URL` or the request headers, as Pulse's queue link does. The arrival row says
*Checked in online · arriving 14:30*. See [guest-facing.md](guest-facing.md).

**A ready room for an arrival whose room is not.** `suggestRoom` (`lib/roomsuggest.ts`, 4 tests):
same room type only, free of other stays for those nights, ready by the property's rule (inspected
when `hk_inspect_required`, else clean or inspected), inspected before clean, same floor first.
The arrival row shows *Move to 308*; `booking_move_room` (0081) re-checks all of that, releases the
old room if this booking was holding it today and holds the new one.

**WhatsApp from the folio** (`[id]/FolioClient.tsx`, in the Guest card). Reserved: *Confirm on
WhatsApp* — room type and number, both dates, nights, booking number. Checked in: *Welcome on
WhatsApp* — room, check-out day, "message us any time". Nothing is sent by the app. `waHref` in `lib/wa.ts` builds the link (ten digits get 91 in front; null without a usable number,
so the button simply is not drawn); `waDate` / `waTime` write "Fri, 9 Oct" and "8:30 pm".
The button is styled in full, not `btn btn-outline` — inside the folio card that drew no outline and
squeezed the icon to a dot.

## Before you edit

- **Close the night audit do not call `router.refresh()`** (2026-10-13). Their actions revalidate, and an action that
  revalidates answers with the re-rendered page — the refresh rendered it a second time. Don't add one back;
  see shell-and-nav.md (speed). `actcheck.mjs`.
- **The folio and the stay invoice are one calculation** (0100). A discount comes off the room before its
  tax (and no further than the room); extras are taxed line by line at the facility rate; restaurant GST is the
  tax charged when each order was posted; the total is whole rupees. The invoice used to tax the full room and
  subtract the discount after — a stay paid in full showed money due — and after check-out the folio counted
  the payments as discounts (a negative total). `dry100.cjs` shows both before and after.
- **No GSTIN, no GST**: `post_order_to_room` adds no tax row, and the folio ignores any old one, where the
  property does not collect GST (`gst_collectable`).
- **Cancel a booking** answers when nothing was cancelled (it said ok); **a folio extra or discount** that
  fails keeps the form and shows why.
- **`post_order_to_room` takes only this property's open order** (0098) — it used to mark another
  property's lines and tickets served and free its table, and posting a billed order charged the room
  twice. **`create_booking`** checks the room and a chosen guest are this property's.
- **Arrivals / Upcoming / In house use `Head`** — a tinted icon tile, a bold 17px `h2`
  (`!font-bold`: the global heading weight beats a plain utility), and a count badge in the
  section's colour (green / blue / orange).
- **The booking dialog's room picker has a phone-only layout switch** — 2, 3, 4 across or a list
  (full room type) — saved per device in `localStorage` (`df-room-picker`), read when the form opens
  and written only when someone picks. From `sm` it is always six across.
- **Each room in the picker is a `RoomPick`**: number with its housekeeping dot beside it (level,
  never in the corner), the type under it, and on the wide phone layouts the state in words as tags
  (Inspected / Clean / Dirty / Pickup, plus Cleaning / Reserved). Colours come from `COND_TONE`
  with explicit tokens — `CONDITION_DOT`'s `bg-saffron` is green in the dark theme. Picked is a green
  ring with a tick badge. Probe: `pick.mjs` (every layout at 390, both themes, and 1440).

- **Arrivals / Upcoming / In house use `Head`** — a tinted icon tile, a bold 17px `h2`
  (`!font-bold`: the global heading weight beats a plain utility), and a count badge in the
  section's colour (green / blue / orange).
- **The booking dialog's room picker has a phone-only layout switch** — 2, 3, 4 across or a list
  (full room type) — saved per device in `localStorage` (`df-room-picker`), read when the form opens
  and written only when someone picks. From `sm` it is always six across.
- **Each room in the picker is a `RoomPick`**: number with its housekeeping dot beside it (level,
  never in the corner), the type under it, and on the wide phone layouts the state in words as tags
  (Inspected / Clean / Dirty / Pickup, plus Cleaning / Reserved). Colours come from `COND_TONE`
  with explicit tokens — `CONDITION_DOT`'s `bg-saffron` is green in the dark theme. Picked is a green
  ring with a tick badge. Probe: `pick.mjs` (every layout at 390, both themes, and 1440).

- **A room's `status` and its `condition` are different things.** `status` is
  available/occupied/maintenance/reserved — front-office truth. `condition` is
  dirty/clean/inspected/pickup — housekeeping truth. The discrepancy report exists because they can
  disagree.
- **Check-out does not mean the room is sellable.** If `hk_inspect_required` is on, it must be
  inspected first.
- **The details line truncates and the rate does not** — `truncate` on the line, `shrink-0` on the
  rate. A long guest name used to push the rate off the card.
- **The folio page is two columns from 768px** (`md:grid-cols-[minmax(0,1fr)_344px]`, 372px from
  lg, 400px from xl): details on the left, the 328px receipt on the right, sticky. **The folio comes
  out of the printer like the bill** (`PrinterOutput` with `label="Front desk"` and `fit`,
  2026-10-13). It was the bare paper with a torn top edge. `fit` narrows the machine's sides from
  22px to 8px to fit the box it is in, so it is 344px wide in the 344px column of an iPad held
  upright and full (372px) from lg; the paper never shrinks. The machine is `no-print`: *Print folio*
  prints the paper. Below 768 the receipt follows the
  details. The left column's card pairs (Guest/Stay, Add to folio/Charge an order) use
  `repeat(auto-fit, minmax(15rem, 1fr))`, so they sit side by side when the column allows and stack
  when it doesn't. At 834 the column is ~312px; a viewport `sm:grid-cols-2` there crushed both cards.
  The Stay card shows Arrive / nights / Leave, room · guests · rate chips, and Total / To pay;
  Check in guest is a full-width button under the cards. Online check-in's buttons auto-fit too.
- **The folio's Back link is `shrink-0`.** A long room-and-guest title squeezed it to 34px wide on a
  phone.
- **The call link is an `.icon-btn`**, so it is 44px on a touch screen.
- **Dates are IST.** `todayIST()` in `lib/format.ts`. Never `new Date().toISOString().slice(0,10)`.

## Fixed: this route ignored the theme cookie (2026-10-09)

`/frontdesk` used to render dark for someone who had chosen light. The server sends
`<html data-theme="dark">` and THEME_BOOT corrects it before paint; when React rebuilt this page's
tree it re-applied the server's `<html>` attributes and the page went back to dark. `ThemeKeeper`
(root layout) now watches the attribute and restores the chosen value the moment anything changes
it. `theme.mjs` checks this page with five others at 0.6 s and 4.6 s. See shell-and-nav.md.

## Verify

```
node guests-test.mjs     # 17 checks — includes the stay rows and the phone layout.
                         # It edits a guest and puts it back; keep that property.
pnpm --filter @dineflow/web typecheck
```

## See also

[rooms-and-reservations.md](rooms-and-reservations.md) · [housekeeping.md](housekeeping.md) ·
[guests-and-customers.md](guests-and-customers.md) ·
[billing-and-invoices.md](billing-and-invoices.md)

- **Flap numbers (2026-10-20)** — design-system.md, *Flap numbers*. Arrivals, Departures, In house and Rooms ready are `StatTile` flaps, which now shuffle and settle when a count changes.
- **Short copy** (2026-10-23): subtitles and hints cut to a few words.
- **Bookings are stay tickets** (`StayCard.module.css`; 2026-10-24, the owner twice: "ultra modern, user friendly,
  properly fit"). `Row` takes `kind` (arrival / upcoming / inhouse), which sets `--tone` — green, blue, amber, red when due
  out — for the band, badge, avatar and timeline. The **band**: ROOM, the number at 34px with housekeeping's dot
  (`[data-room-dot]`), the type under it (one line, …), and a badge (`[data-badge]`: Arriving today / Due since <date> /
  Tomorrow / In N days / Night N of M / Due out). A dashed **tear line** with notches (circles in the page colour, clipped
  by the card). The **guest**: an initials avatar, the name (★ VIP; one line, …), "2 guests · #24". The **stay**
  (`[data-stay]`) like a boarding pass: CHECK-IN date and weekday, the nights on a track, CHECK-OUT — dates read at midday
  so no time zone moves them. **Chips**: the room's state (`[data-room-state]`: Room ready / cleaned / awaits inspection /
  not cleaned yet / needs a touch-up) and online check-in; the guest's note (two lines at most); *Move to N · ready now*.
  The **foot**: rate / night, then Check in (`[data-check-in]`), Cancel (a real 40/44px button) or Folio ›. The first
  redraw that morning (a tinted tile and chips) was not enough; the action sharing the top row had squeezed the details to
  "Garden …" on a phone.
- **Night audit → Discrepancies** (`[data-discrepancies]`): a head with a tinted state tile, "Desk and housekeeping
  disagree" (or agree) and the count; each row (`[data-discrepancy=<kind>]`) is a link — the room as a tile, the guest in
  bold and what is wrong, a tag for the kind (`KIND`: Overstay, No guest, Room shows empty, Dirty on sale) and "Settle in
  Front desk / Rooms / Housekeeping", which is where the link goes.
- Probe: `pw/fd94.mjs` — a demo resort with long type names, an overstay, a VIP with a long name and a note, an arrival in
  a dirty room; 412 paper and dark, 834, 1440: contents inside every card, no sideways scroll, Check in ≥44 on touch, the
  dot clear of the ROOM label.

- **Empty columns (2026-10-24).** No arrivals, nothing upcoming and nobody in house are `EmptyState`s (design-system.md):
  Arrivals and Upcoming the 76px row (with a *Booking* button on Arrivals), In house the full panel with **New booking**
  (`[data-fd-empty]`). The stay cards (`Row`) are unchanged.
- **A booked room turns Arriving on its arrival day (2026-10-29, 0154)** — `hold_due` on the Front desk and Rooms screens; it used to
  happen only for a booking made for today (rooms-and-reservations.md).
- **Food charged to a room is taxed per dish (2026-10-29, 0155).** `post_order_to_room` taxed the posted food at the property's one
  rate, so an 18% dish was taxed 5% on the folio (₹360 → ₹18 instead of ₹64.80). It now groups the order's lines by rate and asks
  `bill_tax`, the bill's own sum (billing-and-invoices.md). Found by `pw/links156.mjs`; checked by `m/gst156b.mjs`.
- **Shorter copy (2026-10-29, the owner: "maximum 3 or 4 words, try 2 or 3 — clean and neat").** Subtitles, hints, helper
  lines and empty-state hints cut to two–four words, or removed where they said the obvious. Error and refusal messages,
  steps to follow outside the app, printed and exported text, WhatsApp bodies and tooltips were left as they were.
- **Check out asks in the app's dialog (2026-10-30)** — "Check out? The room goes to cleaning and one invoice is made." (`ask`, tone
  go), not the browser's "dineflow.cloud says" box (shell-and-nav.md).

## 2026-10-30 — Table bookings on the front desk
- **The owner: "show the table reservations here too".** Under In house, **Table bookings** — today's table bookings (requested,
  confirmed, seated): the time, the name, how many, the table and, for a guest staying here, *Room 101* (`[data-fd-tables]`,
  `[data-fd-table]`, `[data-fd-table-room]`), Coming / Late (15 min) / At table; a tap opens Reservations, **+ Book a table**
  (`[data-fd-book-table]`) a new one — both only for someone holding Reservations (`canBook`, from `modulesFor`). Each in-house
  card has a **Table** key (`[data-book-table]`) → New booking with their room chosen. Live on `reservations` too.

- **Table bookings are tickets (2026-10-30, second pass — `.fdt`):** the time on a stub in its state's colour (blue coming, red
  late, green at the table), a torn edge with notches like the stay cards, the name and its status pill, then the party, the table
  and the room as small pills, and a round arrow. "Late" is worked out after the page mounts, so the server's HTML and the first
  paint agree.
- **The folio slip reads cleanly (2026-10-31, the owner: "the bill looks collapsed").** The slot's shadow on the paper shows only while
  it feeds; at rest the sheet's top is clean paper, the receipt's top padding is 26px under the slot (`Receipt noTopEdge`), the machine
  is its own layer (`isolation: isolate` — Safari smeared the shadow across the sheet while the sticky column scrolled), and the
  sheet's height follows a ResizeObserver (measured once, it was taken before the receipt font loaded). shots159: the name 22px clear.
- **Printing the folio prints the slip alone** (`[data-folio]` is `data-print-root` — billing-and-invoices.md).

## 2026-11-02 — one grid, level rows (the owner: "cards alignment looks zigzag")
- **Arrivals, In house, Upcoming and Table bookings are four sections in one grid** (`[data-fd-grid]`, two columns from `lg`).
  Two independent columns let Upcoming and Table bookings start wherever the column above ended; as rows, Arrivals | In house and
  Upcoming | Table bookings start level. Below `lg`, one column in the order it always had (`order-*`).
- **Every stay card has the chips row**: an in-house stay says when it leaves (`[data-out-chip]`: Checks out today / tomorrow /
  in N days, red when today or past) — it was a chip-row shorter than the arrival beside it. **The foot is one height**
  (`.act { min-height: 48px }`) whether it holds Check in, Cancel, Table + Folio or Folio.
- shots49 on a demo resort at 1194/1440/1920: the heads level (556/556, 1006/1006 at 1194), the first arrival and in-house cards
  start level and are one height (378/378); 834 and 412 one column, Arrivals → Upcoming → In house → Table bookings.

## 2026-11-02 — level heads, empty boards that fill their row (the owner: "alignment — not looking good, ultra modern")
- **Heads are one height** (`Head`: `min-h-11`): Table bookings' Book a table made its head taller, so its title sat ~10px below
  Upcoming's. shots163: 1040 / 1040 at 1194.
- **The grid's rows stretch** (no `items-start`); each section is a column and its list `flex-1`, so an empty board takes its
  row-mate's height. **`BoardEmpty` + `Board.module.css`** replace the shared `EmptyState` here (the shared one is unchanged):
  a glass panel washed in the board's hue from its corner, a dot field fading in from the right, the icon on a glowing tile and faint
  and large in the corner, the title, a 2–3 word hint (Today's check-ins · Checked-in stays · Future bookings · Today's table bookings)
  and the action. From lg it is a size container (`fde`): ≥ 176px tall it stacks and centres, shorter it is one 76px row; at most
  392px (one stay card), so a long list beside it does not stretch it further. Below lg it is the row. `[data-fd-empty]` kept.
- shots163 at 1194/1440/1920: the empty In house ends level with the arrival (378px, 990/990), the empty Arrivals beside a guest in
  house the same; Upcoming and Table bookings empties 76/76 and level; 834/412 one column, compact.

## 2026-11-03 — a room comes to booking by what Room status says (0166)
- The owner: "Room status decides whether a room is free for a booking." **New booking**'s room picker (`BookingForm`, `whyNot`)
  for the dates chosen: a room booked for any of those nights reads *Booked*; for a stay **from today** also *Guest in* (occupied, or
  a stay still checked in), *Being cleaned* (dirty, or status cleaning), *Touch-up* (pickup), *Not inspected* (where
  `hk_inspect_required`). Those tiles are disabled (`[data-room-pick]`, `[data-why]`), sorted after the free ones, the why in red where
  the type was; a line under the grid counts them (`[data-rooms-open]`: "3 free and ready now" / "… for these dates"). Out of order is
  still left out. A dirty room can be booked for a later date. Confirm needs a room that is free (`roomOk`).
- The database agrees (data-and-rls.md, 0166): `create_booking` refuses an out-of-order room for any dates and a not-ready room for a
  stay from today (and marks it Arriving by IST, not UTC); **`check_in` refuses a room that is not ready** — before, it checked only
  the inspection, and only where the property inspects. *Move to N · ready now* (0081) is the way round it for an arrival.

## 2026-11-03 — room service from the room's QR (0170)
- A room's QR order is a **room-service order on the stay** (`orders.booking_id`, customer "Room 102 · name"); a later order from
  the room joins it while no bill is printed on it. **When the kitchen marks its last dish served it goes on the folio by itself**
  (`_room_order_served` trigger → `_post_room_order`: "Room service #n" and "GST on room service #n", each dish at its own rate as
  0155) — nobody has to press Post. Until then the folio's *Charge a restaurant order* lists it first, "From this room · goes on the
  bill when served" (`[data-folio-order="room"]`); **Post to room** still works on it (it serves it at once).
- **Check-out refuses while room service is open on the stay**: "room service order #n is still open — post it to the room or bill
  it before check-out" — before, food still cooking at check-out was never charged.

## 2026-11-03 — Book a room: four steps, one sheet, a foot that says what is missing
The owner: "room booking options more easily accessible, more user friendly and easily understandable." The form moved out of
`FrontDeskClient.tsx` into **`frontdesk/BookingForm.tsx`** (+ `BookingForm.module.css`; `COND_TONE`, `Room`, `RoomTax` are exported from
it). The button and the sheet are **Book a room** (`[data-fd-new-booking]`; it was "New booking" — a probe that clicked that text needs
the hook). The empty Upcoming board has a *Booking* button too.
- **Four numbered steps** (`[data-step=when|room|guest|pay]`), each number a tick when done. **When**: the two dates and counters for
  Nights · Adults · Children (`[data-counter]`, 44px − / +); moving check-in keeps the nights, check-out is never on or before it.
  **Room**: room-type chips — rate, sleeps, *n free* (`[data-room-type-chip]`, a filter over the same list); the picker, the layout switch
  and **every part of 0166 unchanged** (`whyNot`, `ranked`, `[data-rooms-open]`, `RoomPick` with `why` / `[data-why]` / disabled); a room that
  sleeps fewer than the party warns, it does not refuse (`[data-sleeps-warn]`). **Guest**: one name and one phone; a returning guest
  (the 200 most recent) appears as either is typed (`[data-guest-matches]`), *Use* fills both (`[data-guest-chosen]`, *Change* undoes it);
  ID and email no longer fold — all five are required since 2026-11-04 (below). **Payment**: the rate (with *Use it* back to the type's rate when changed), the advance with
  None · 1 night · Full stay (Full stay only when more than one night), **Booked by** Walk-in · Phone · OTA · Agent, and *+ Note* —
  `notes` reaches `create_booking` for the first time.
- **The foot** (`[data-booking-foot]`, `data-no-foot` so the kit's own foot does not pin the button alone): "Room 102 · 3 nights · 3 guests",
  the room charge + GST, the advance; **Total**, or **Due at check-out** after an advance. The GST is the folio's: `roomGstFor(rate, low, high,
  threshold)` only where `gstCollectable` (page.tsx passes `tax`; defaults 5 / 18 / 7,500 as `room_gst_for`). The button names what is
  missing — *Pick a room*, *Room 102: booked — pick another*, *Add the guest's name* — until it is **Confirm booking**.
- **`/frontdesk?new=1&room=<id>`** opens the sheet with that room picked (`openNew`); closing it takes `?new` off the URL.
- Checked: `pw/book171.mjs` (51) — testing-and-gates.md.


## 2026-11-04 — late check-out on the stay bill (0171)
The owner: "if the guest overstays, add an extra amount by how long — more than 3 hours half a day, more than that a full day,
and further on the same way."
- **The rule** (Settings → Rooms & stays → *Charge late check-out*, `LateCheckoutRule.tsx`, `[data-late-rule]`; owner only, as every
  property setting): the stay is due out on its check-out date at the property's check-out time (IST). Each whole 24 h late is a
  night at the stay's rate; of the rest, up to **Half night after** (3 h) is free, then **½ night**, past **Full night after** (6 h)
  **1 night**. 2 h → ₹0 · 3 h 20 m → ½ · 6 h 40 m → 1 · 27 h 20 m → 1½. The boxes are hours (step ½), saved as minutes
  (`late_half_after_min` / `late_full_after_min`); the three bands are drawn under them as they are typed (`[data-late-band]`).
- **Where it lands**: `folio_totals` returns `late_fee` and `late_label` ("Late check-out · 3h 20m · half day"); the fee is room
  revenue — in `taxable`, taxed at the room's slab (`room_gst_for`), its own line on the stay invoice (SAC 996311, qty ½ / 1 / 1½).
  Live while the guest is in; **frozen at check-out** on `bookings.late_fee / late_label`, so a closed stay never changes.
  `check_out` asks for it in the balance — paying only the nights is refused with "it includes the late check-out (…)".
- **Waive**: `late_checkout_waive(booking, true|false)` — owner, manager or supervisor, while the guest is in; the label says
  "· waived" and the fee is ₹0. The booking columns are fenced (`fence_bookings`): not writable through the API.
- **Only stays due out after the rule went on** (`restaurants.late_checkout_since`, set when 0171 was applied) are charged: three
  live stays were already overdue (one since 17 Sep) and get no surprise charge — settle those by hand as before.
- **Do not also add "Late check-out" by hand** from the charge picker: that would charge it twice, and at the 18% extras rate.
- **On the folio** (`FolioClient`, the Stay card, `[data-folio-late]`): *half* / *full* — the clock in orange or red, "Late check-out",
  "4h 00m · half day", the amount and **Waive** (`waiveLate` → `late_checkout_waive`); *waived* — struck through, **Charge it** puts it
  back; *soon* — due out today and not late yet: "Late check-out after 15:42 · ½ night, 1 night after 18:42". The slip has the line and
  it is in the subtotal; the payment row follows the balance (the folio's own effect). While the folio is open it fetches itself once
  when the next step is reached (a timer, not after an action). Inside the Stay card `due` is the balance — the check-out moment is
  `dueOut` (the hint first compared the clock with the rupees).
- Checked: `folio171.mjs` 47/47 on a Try-Demo resort — 1440 dark, 1194 royal, 834 paper, 412 dark and bright, 1920 colour: half a night
  ₹1,250, the slip line, payment = balance (₹4,351), Waive → To pay ₹3,038 and back, the hint an hour before, nothing two days out, 44px on
  touch, inside the card; it puts the stay back. `qr171.mjs` 142/142 for Settings (and Join by QR).
- Checked: `dry171.mjs` (rolled back, a fresh demo resort) 40/40 — the bands at 0, 2 h, the 3 h and 6 h edges, 1 d + 1 h, 1 d 3 h 20 m,
  2 d 6 h 40 m; folio ₹5,000 + 5% = ₹5,250; short payment refused; waiter refused, manager waives and puts back; API writes refused;
  the owner's 4 h / 8 h rule, off → ₹0; full before half refused; checked out → frozen, invoice line ₹1,000 and invoice = folio, paid;
  three closed stays' folios unchanged; anon refused.

## 2026-11-04 — the owner's round: required guest details, the folio, the invoice after check-out, compact lists, tables
- **Book a room's guest needs all five** (the owner: "name, number, email, ID type and ID last 4 must be required"): *Guest name ·
  Mobile number · Email · ID type · ID last 4*, all shown (no fold), each marked *. The button walks them in order — *Add the guest's
  name* → *Add a 10-digit mobile number* → *Add the guest's email* → *Choose the ID type* → *Add the ID's last 4* → Confirm booking. The
  phone is the shared `PhoneInput` (design-system.md); Aadhaar's last four are digits, other IDs letters or digits (stored upper-case);
  PAN joined the ID types. **A returning guest** (page.tsx now reads their email and ID) is asked only for what the record lacks
  (`[data-guest-lacks]`), and `createBooking` writes those back onto the guest after `create_booking` — a returning guest's record
  was never updated before. `bookingSchema.guest` (packages/shared) refuses the same (10-digit mobile, email, ID type, 4 characters);
  nothing else uses that schema. Hooks: `[data-guest-email]`, `[data-guest-id-type]`, `[data-guest-id4]`.
- **The folio** (`[id]/FolioClient.tsx`, `Folio.module.css`):
  - **← Front desk** at the top (`[data-folio-back]`).
  - **The Stay card, redrawn** ("messy — clean"): a pill for where the stay stands (`[data-stay-when]`: Night 2 of 3 / Due out today /
    Arriving today / Arrives in n days / Checked out), arrive and leave with the check-in and check-out times on a dashed line with the
    nights between, **Room · Guests · Rate** as three quiet cells, then Total and To pay with a bar for how much is paid.
  - **Add to folio's words are a pick-or-type box** (`ChargePicker.tsx`, `[data-charge-picker]`): open it (focus or the chevron,
    `[data-charge-toggle]`, 44px on touch) for **Used here** — what this property has posted before, newest amount, "₹150 last time"
    — then **Common** (`charges.ts`: Laundry, Minibar, Airport pickup/drop, Extra bed, Early check-in, Breakfast, Room service, Spa,
    Damage charge; discounts: Loyal guest, Corporate rate, Long stay, Service recovery, Manager's discount). Typing filters; words that
    match nothing offer *Use "…"* (`[data-charge-own]`); ↑ ↓ Enter Escape. Picking fills the amount when it is empty. **No "Late
    check-out"** — 0171 (dineflow-55) works that fee out and adds it itself; a hand-posted one would charge it twice. The lists are in
    `charges.ts`, not the client file: a server page cannot read plain values out of a "use client" module.
  - **Charge a restaurant order lists this stay's orders only** (the owner: "it shows for every new customer"). It listed every open
    order in the property, unfiltered. Now: room service from the room's QR (`booking_id`, 0170), a till room-service ticket for this room
    ("Room 305 · …"), or an order with the guest's phone (`phone10` both sides) — else *No orders for this room*. Anyone else's open
    order (not another room's ticket) waits behind **Another order** (`[data-folio-another]`) and asks before it posts.
  - **The payment follows the balance.** Posting an extra or an order left Check out's amount at the old balance, and Check out & invoice
    stayed greyed out until someone retyped it (found by s172's screenshot). A split the desk has made is left alone.
  - **Check out lands on `/invoices/<id>?done=checkout`** — billing-and-invoices.md.
- **The front desk's lists past three** (the owner: "first in full, the others compact"): Arrivals, Upcoming and In house each show their
  first stay as the ticket and the rest as one-row cards (`Mini`, `StayCard.module.css` `.mini*`, `[data-compact]`): the room on a
  stub in the section's colour, the guest, a badge (Today / Late / Tomorrow / In n days / Night 2/3 / Due out), the dates and the party, and
  the same move — Check in, a ✕ to cancel (`[data-cancel-compact]`, asks first), a Table key and ›. Three or fewer stay tickets.
- **Tables on the desk, only where there are tables** (`[data-fd-tables-tile]`): a fifth tile, *Tables free* n, "3 in use · 1 cleaning ·
  12 in all" (page.tsx: `dining_tables`, open orders on a table, open `table_cleanings`). No tables → four tiles as before. With tables
  the page also listens to `dining_tables`, `table_cleanings` and `orders`.
- Checked: `pw/s172.mjs` — testing-and-gates.md.
