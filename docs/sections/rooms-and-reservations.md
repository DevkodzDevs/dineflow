# Rooms, reservations and facilities

**Routes** `/rooms` · `/reservations` · `/facilities`
**Files** `app/(app)/rooms/RoomsClient.tsx` · `app/(app)/reservations/ReservationsClient.tsx` ·
`Calendar.tsx` · `app/(app)/facilities/FacilitiesClient.tsx` · each `actions.ts`
**Reads** `rooms`, `room_types`, `bookings`, `housekeeping_tasks`, `reservations`, `dining_tables`,
`offers`, `reviews`, `profiles`, `facilities`, `facility_bookings`
**Writes** `reservation_set`, facility actions

## What it is

`/rooms` is the room inventory and the live room rack. `/reservations` is **table** bookings for the
dining room — a different thing from a room booking. `/facilities` is the banquet hall, the pool,
the conference room: bookable things that are not rooms.

## How it works

### The month grid (`Calendar.tsx`)

One ruled block, not forty-two cards:

```
.cal-grid   display:grid; gap:1px; background: separator; border-radius; overflow:hidden
.cal-cell   a flush cell on its own background — the 1px gap draws the hairline between them
```

- **Monday first.** A restaurant's week bends around the weekend; splitting Sat from Sun across two
  rows is the wrong cut.
- **Always 42 cells / six rows**, so the grid does not change height as you page and drag the panel
  beside it with it.
- **Today** gets the tint ring on its numeral (`.cal-num.today`). **The open day** inverts the whole
  cell (`.cal-cell.on`). Both can be true at once.
- **Weekend columns** carry their own ground (`.cal-cell.wknd`), so the shape of the week is visible
  before you read a number.
- Each day with bookings gets a **density bar** measured against the busiest day of that month, plus
  up to three status dots and the head count.
- **No guest names in the cells** — the panel beside the grid already lists every booking on the open
  day, in full, with the phone number and the buttons that act on it. The grid's job is showing
  which days are busy.

Cells are 58px (74 from `sm`), and at 412px the grid **fits without scrolling sideways** — seven
columns of ~50px, still above the 44px tap floor.

### Confirmation on WhatsApp
A booking still to come (`requested` / `confirmed`) carries a green WhatsApp button before the ring
button, with the confirmation typed: party, day, time and booking number. Nothing is sent by the
app — it opens WhatsApp and the host presses send. `restaurant` (the name) comes from `page.tsx`.
`waHref` in `lib/wa.ts` builds the link (ten digits get 91 in front; null without a usable number,
so the button simply is not drawn); `waDate` / `waTime` write "Fri, 9 Oct" and "8:30 pm".

## Before you edit

- **Facility cards** (`/facilities`) are one compact card: a kind-coloured icon tile (spa green,
  activity blue, venue amber via `KIND_TONE`), the name with duration and capacity as chips, a 44px
  edit button, then a divider, the price in whole rupees with "per person · N booked · next Sat 4:30
  pm" (from the schedule rows already loaded) and a full-size Book. The grid is
  `repeat(auto-fill, minmax(20rem, 1fr))` beside the schedule; one column on a phone. The old card was
  a big icon, a gap, then the name and price far apart, mostly air on a phone.

- **Room cards carry their own action bar** (`.room-act`, 40px, 44 on touch, sharing the card's
  width). The card is the `keycard` wrapper; the top is the `Link`, the bar is its sibling, so no
  button sits inside a link. The grid is `repeat(auto-fill, minmax(9.5rem, 1fr))` — never so narrow
  that three finger-sized buttons cannot fit. The old row of 13px icons under the card was a 21px
  target. Probe: `diag.mjs` reports 0 small targets at 1366/1280/1194/1024/834/412.

- **`min-w-0` on the calendar card root is load-bearing.** As a grid item it defaults to
  `min-width:auto` and pushed the whole page sideways on a phone.
- **The weekday header must use the same track as the grid** — `gap-px border border-transparent` —
  or the headings drift a pixel further off across the week.
- **Do not stagger the cells.** One fade for the block; 42 animated nodes on a month change is the
  slowest thing on a tablet. `display: contents` on a motion wrapper does not animate anyway.
- **`cal.mjs` counts weekday headings as childless `<div>`s.** If you put spans inside them the
  suite fails without the screen being wrong — and a two-span header reads as "MMon" to a screen
  reader, which is why the short-name variant was dropped.
- **Cancelled and no-show bookings must not colour the calendar** (`LIVE` in `Calendar.tsx`).
- **Room cards**: the wrapper is the flex column and the card is `flex-1 min-h-[7rem]`. An
  `aspect-[5/4]` card clipped its own content.

## Verify

```
node cal.mjs             # 6 checks — 42 cells, 7 weekday heads, dots, the open day,
                         # 0 touch targets under 44px, 0 spill, at 1440/1194/834/412,
                         # plus an empty month and a clean console
```

## See also

[front-desk.md](front-desk.md) · [housekeeping.md](housekeeping.md) ·
[guest-facing.md](guest-facing.md) · [design-system.md](design-system.md)
