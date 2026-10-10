# Housekeeping (hotel / resort only)

**Route** `/housekeeping`
**Files** `app/(app)/housekeeping/page.tsx` · `HousekeepingClient.tsx` · `actions.ts`
**Reads** `rooms`, `bookings`, `housekeeping_tasks`
**Writes** `set_room_condition`, `inspect_room`, `hk_build_sheet`

## What it is

The live room-status board in housekeeping's own words, the supervisor's sign-off, the day's task
sheet in one press, and the discrepancy report that used to wait for the night audit.

## How it works

**The four conditions**, in the colours housekeeping boards have used for decades:

| Condition | Colour | Means |
| --- | --- | --- |
| `dirty` | red | needs cleaning |
| `clean` | **amber** | cleaned, not yet inspected |
| `inspected` | green | signed off, sellable |
| `pickup` | blue | occupied, needs a touch-up |

A room is sellable when it is `inspected`, or `clean` if the property has `hk_inspect_required` off.

**The card.** A colour rail down the left edge carries the condition; the pill repeats it in words.
The identity block is the guest or "Vacant", then the since-line, then a hairline, then the actions.
Every state puts its buttons through **one grid** — one action fills the row, three put the one you
will press on top — so a board of thirty rooms is one shape repeated rather than four.

Action tones: *Cleaned* / *Touched up* / *Pass* are green-tinted, *Fail* is outline with red text,
*Pickup* and *Dirty* are plain outline. A filled red *Fail* on thirty cards reads as thirty problems.

**Discrepancies** are computed live in the client: occupied with nobody checked in, a guest checked
in to a room not marked occupied, a room on sale that housekeeping calls dirty, a guest past their
check-out date.

**`hk_build_sheet`** adds a stayover service for every occupied room tonight and a clean for any
dirty room without a ticket.

## Before you edit

- **A room card has two shapes, the phone's and the wide one.** Both are in the DOM and one is
  `display: none` at each width, so a width has one grid item per room — a probe must read the
  *visible* card (`offsetParent`), or it finds the hidden copy first.
  - **Phone (below `sm`), as it was:** the number (30px), the guest or "Vacant", the state chip; a
    `min-h-5` line with the since-time and "out MM-DD" / "Due out"; then the **action dock** in one
    row — every move the room allows, all visible (the owner asked for no hidden menu), as equal
    tiles, icon over label (`.dock-tile`, 52px, 56 on touch): Cleaned / Touched up / Pass in green,
    Fail red, Pickup blue, Dirty grey. One to a row under 520px, `auto-fill minmax(15rem)` to 639.
    Probe: `dock.mjs` (390 both themes, 600).
  - **Wide (`sm` and up, `[data-room]`, an `@container`), two lines and one row of actions,
    130px tall:** the number in a 44px tile washed with the condition's colour (16% wash, 38%
    inner ring — red dirty and out of order, amber clean, green inspected, blue pickup); the guest,
    or Vacant / Reserved / Cleaning, or the repair note; under it the condition and the one thing to
    know — "Due out" in red on the day, "Out 17 Sep" (`dayMonth`; en-IN says "Sept"), how long
    ago, or where the repair stands. Then the actions as 48px tiles with a 12px radius (`rounded-xl`
    is 28px here and made pills): the standing first (Ready / Occupied / Sign-off), Back in service
    for a room out of order. Tones are `SOFT` — the main move on the green wash, the rest on
    `--color-fill` with red / blue / grey text; the dock's `bg-2` is the card's own colour in dark
    and those buttons vanished. **One look per card width, always one row:** from a 15rem card
    (an iPad in landscape, a laptop) every tile is icon beside label — four a little tighter
    (12px, 15px icon, `gap-1 px-1`) so "Pickup" fits in ~71px at 1194; under 15rem (an
    iPad-portrait third) every tile is icon over label, 3px apart. Mixing the two in one row, and a
    four-action card going two by two, made the rows look uneven and was sent back. Only a card
    under 185px inside (an iPad narrower than 820 in portrait) puts four two by two, where four in
    a row would be under 44px each. Between 640 and 1023 the floor's padding (`sm:p-2.5`), the gap
    (`sm:gap-2.5`) and the card's padding (`sm:p-2.5`) give back the pixels that keep four tiles
    ≥44px: 46px at 834, 44 at 820.
  - **Three across from `sm`, four from 1800px** (`sm:grid-cols-3 min-[1800px]:!grid-cols-4` — the
    `!` because Tailwind emits the arbitrary `min-[1800px]` before `sm`, which then won at 1920),
    **top-aligned** (`sm:items-start`): every card is one height (130px; 126 under 15rem), so rows
    are level; a four-action card on an iPad narrower than 820 in portrait is the one taller card,
    on its own rather than stretching its neighbours into cards with a hole in the middle. The first wide version — a 52px tile, a line
    of chips and the dock two to a row — came out ~250px a card and was sent back as too large.
  Probe: `hk.mjs`.

- **Floors are an accordion** (`openFloor`: a floor number, `"all"` or null). The first floor is
  open; opening another closes it; tapping the open one closes it. The board head is "FLOORS n" and a
  segmented switch, One at a time | All open; tapping a floor while all are open shows just that one.
  Each floor head: its number in a tile (filled when open), bold name, tags for rooms / dirty /
  out of order (or "all clear"), and the chevron in a round button. Probe: `acc.mjs` (1440 dark, 390 paper).

- **On a phone the page is two tabs** — `Segmented` Rooms n | Tasks n (`view` state, `sm:hidden`).
  Rooms holds the discrepancies and the board; Tasks the To do / In progress columns, New task and
  Recently done. Each side is hidden with `max-sm:hidden`, so from `sm` both show and there is no
  switch. The switch is not sticky: the TopBar already sticks at top-4 and they would collide.
  Probe: `hktabs.mjs` (390 both themes, 834).

- **An out-of-order room card says why and how it comes back**: the open maintenance task for that
  room number (Waiting for repair / Being fixed, its note and age, or "No repair task open"), and
  Back in service → `setRoomStatus(id, "available")` from `../rooms/actions`, which marks it clean
  so a supervisor still inspects it before it sells. It was an empty dark block on the board.


- **The task board is two columns from `md`, with the form beside it only from `xl`.** At `lg` the
  form's column left ~290px per board column and "Done · room ready" ran out of its button. The
  button says "Done"; what it does to the room is in its title.

- **Do not use `--color-saffron` or `--color-mint` for the clean/inspected distinction.** Both alias
  to the tint (green) in the dark theme. That is exactly how the board ended up showing amber
  *Clean* pills inside green frames, indistinguishable from the inspected rooms beside them. Use
  `var(--color-orange)` and `var(--color-tint)` explicitly.
- **`mt-auto` belongs on the footer, not on the since-line.** Put it on the since-line and the slack
  a stretched grid row leaves opens up *between* "Vacant" and the timestamp, which reads as a bug.
- **Check-out creates a cleaning task automatically.** Do not add a second one.
- **A green "Dirty" button reads as approval**, which is the opposite of what it does.

## Verify

```
node toolbars.mjs        # the condition-count rail at 4 widths
pnpm --filter @dineflow/web typecheck
```

Then shoot the board at 1440 and 412, **in both themes** — the rail colours and the tinted buttons
are the whole point and they are theme-dependent.

## See also

[front-desk.md](front-desk.md) · [rooms-and-reservations.md](rooms-and-reservations.md) ·
[design-system.md](design-system.md)
