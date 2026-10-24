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
