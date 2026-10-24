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

- **Reservations is Simple Service (2026-10-15).** `SvcHead` with **New booking** (the phone-booking sheet) · a
  strip of seven days (`[data-days]`: today, or from the chosen day when it is further out — `page.tsx` reads
  their counts) with day arrows (`aria-label` Previous day / Next day — the `[` `]` keys press them; since
  2026-10-20 in the panel's heading, see below) and the chosen day's guest count · chips **Coming** (blue), **Late**
  (red: not seated 15 min after its time, in IST) and **At table** (green), each filtering — on a phone one row
  of equal parts (`grid-flow-col auto-cols-fr`; they wrapped onto two lines with the guest count) · tabs **Day · Month · Reviews**: the month grid
  (`Calendar.tsx`, unchanged) is the Month tab and a tap on a day comes back to Day. A booking is one card
  (`[data-res]`, `data-kind`): the time big with AM/PM, the name (two lines), party, occasion, offer, the state
  pill, then **Seat now** (the table sheet), Call, the WhatsApp confirmation and ⋯ (*Did not come*, *Cancel
  booking*); a seated one has **Take order** at its table and **Done**. Late first, then by time; two across from
  `md`, three from `min-[100rem]`.

- **The top of Reservations is one panel (2026-10-20, `[data-res-top]` — the owner: "plain, not polished").**
  The strip of days, the arrows on its sides, and the chips and tabs floating under it are now one `feather` card:
  - **Heading row:** the month the seven days sit in (`[data-month-label]`, "October 2026", or "Oct – Nov 2026" across a
    month end), under it the chosen day with its tables and guests (`[data-day-summary]`, "Today, 20 Oct · 1 table ·
    4 guests"; the guests keep `[data-guests]`); on the right a **Today** jump (`[data-today-jump]`, only when another
    day is open) and the two 44px arrows — now on a phone too (`aria-label` Previous day / Next day, still pressed by
    the `[` `]` keys).
  - **The rail** (`[data-days]`) is `grid-cols-7` at every width — no sideways scroll, 47px pills on a 412 phone. A
    pill (`data-day`, `data-busy`, `aria-current="date"` on the chosen one) is weekday small caps ("TODAY" for today),
    the date in display type, then up to three tint dots on a phone and "n tables" from `sm` (the words stay as
    `sr-only` text on a phone — `svcflow2.mjs` reads them). Chosen: solid label colour; today otherwise: a 2px tint
    ring and the weekday in the tint; an empty day's numeral is quieter (`label-2`).
  - **The bar under a hairline:** the state chips (`[data-res-chips]`, `[data-state-chip]`, unchanged) and the switch
    (`[data-res-tabs]`, `role=tablist`, each `[data-tab=day|month|reviews]` with `aria-selected`) — a plain three-part
    control with icons and the review count as a badge. It replaced the kit `Segmented`, whose animated thumb and
    unequal labels crowded "Month" under "Reviews · 10" on the iPad. On a phone: chips in one row, then the switch full
    width in three equal parts.
- **The state chips (Ready · Occupied · Arriving · Cleaning · Maintenance) are a `Rail`** labelled
  "Rooms by state", wrapped `flex flex-1` so it still shares the toolbar with Room types & rates and
  + Room. On a phone and an iPad in portrait the chips run past the edge; the round arrow on the right
  slides them into view and turns round at the end. See [design-system.md](design-system.md).

- **Facility cards** (`/facilities`) are one compact card: a kind-coloured icon tile (spa green,
  activity blue, venue amber via `KIND_TONE`), the name with duration and capacity as chips, a 44px
  edit button, then a divider, the price in whole rupees with "per person · N booked · next Sat 4:30
  pm" (from the schedule rows already loaded) and a full-size Book. The grid is
  `repeat(auto-fill, minmax(20rem, 1fr))` beside the schedule; one column on a phone. A row-list
  layout (one panel per kind) was tried after this and the owner preferred these cards, so it was
  taken out again.

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

- **Flap numbers (2026-10-20)** — design-system.md, *Flap numbers*. Room numbers on the Rooms cards are spelled on flap tiles (up to four characters); each reservation's time is a `FlapClock at` (`[data-res-time]`), AM/PM under it.

- **Facilities, 2026-10-21 (the owner: "the button takes a whole row"; "the schedule is messy").** The row above the
  sections carries a count chip per kind (Spa · Activities · Venues, in their colours) and **+ Facility**
  (`[data-fac-bar]`, `[data-new-facility]`). The **Schedule** card (`[data-fac-schedule]`) is one row per booking
  (`[data-fac-slot]`): a date tile — day, month, time in IST — then what and who, the amount (or *folio*) and a 44px ✕
  to cancel. The time had been a 64px column that ran into the name. shots41.

- **Rooms: the number a size up** (2026-10-21): the flap tiles are 36px for a three-figure number (32px for four, so it
  still clears the room type on a phone) — were 30px.
- **Reservations, the date head on a phone (2026-10-21, the owner: "messy").** Row one: the month and the ‹ › day arrows
  joined in one control (`[data-day-arrows]`); row two: the chosen day's line (`[data-day-summary]`) with a small tinted
  *↺ Today* chip (`[data-today-jump]`, 44px to the finger) when another day is open. The summary had run under a Today
  button and two arrows on one row. The seven day pills are a touch more compact on a phone (62px, 21px figure).
  shots41: nothing overlaps at 412 or 1440, seven days on one row.
  The kind chips are a `Rail` (`rail-fade`, label *Kinds*): on a phone, where they run past the edge, the shared light round
  › (glass, 80% opacity) slides the rest into view and turns round at the end. shots42: 412 and 360.
- **Short copy** (2026-10-23): subtitles and hints cut to a few words.
- **The room type has its own line** (2026-10-24, the owner: "the text goes out of the card"). It sat beside the flap
  number as `shrink-0` and "Deluxe Cottage" ran past a 184px phone card; now it is under the number (`[data-room-type]`,
  11.5px, one line, … with the full name as its title). `pw/fd94.mjs` checks every room card holds its text at 412,
  834 and 1440.

- **Rooms and Facilities, empty (2026-10-24).** Rooms with no room type says *Start with a room type* and opens the type
  sheet; with types but no rooms, *Add a room* (`[data-rooms-empty=types|rooms]`). Facilities with none offers three starts —
  Spa, Activity, Venue — each opening the form set to that kind (a venue 4 h and 100 people) (`[data-fac-empty]`,
  `[data-fac-start]`).
