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
  - **Wide (`sm` and up, `[data-room]`, an `@container`): three quiet rows, 130px at every
    width.** The number in plain display type with the condition as its pill on the right (the
    only colour up top — `COND[...].chip`, dot + word); then the guest (or Vacant / Reserved /
    Cleaning, or the repair note) and the one thing to know — "Due out" in red on the day,
    "Awaiting sign-off", "Out 17 Sep" (`dayMonth`; en-IN says "Sept"), how long ago, or the repair
    state in red; then **the actions as the card's footer strip** (2026-10-12, modelled on the Menu card's footer at
    the owner's request): a hairline across, a band of `--color-fill` at 45% from edge to edge (`-mx-3
    -mb-3`, the card `overflow-hidden`), one equal section per action (`repeat(n, minmax(0,1fr))`) split
    by hairlines, 44px tall (36px below 1280 — iPad and tablet, at the owner's request), `FOOT` tones — the main move on the green wash, the rest in their colour.
    It replaced the pills below, which read as loose buttons. (The pills were 30px to the eye, `rounded-full`, `!min-h-0` against the 44px button floor). Only the main move (Pass /
    Cleaned / Touched up) has a fill, the green wash (`SEG.go`); Fail, Pickup and Dirty are a
    hairline outline with the word in red / blue / grey, washing with their colour on hover. The
    finger still gets 44px: an invisible `::before` 7px above and below and 2px each side, with
    `min-w-10` (40 + 4) — the `.switch` trick. There is no Ready / Occupied / Sign-off pill — the
    condition pill and the second line say it; a room out of order has one, Back in service.
    Icons beside the words from a 15rem card; text only below (an iPad-portrait third), at 11px with
    6px sides and 3px gaps, so 101's four pills fit in 181px. **Four tries before this were sent
    back:** a 52px tinted number tile with a 2×2 dock (~250px); a 44px tinted tile and filled tiles
    in a row; the same with tile looks mixed in a row; and a full-width outlined bar ("looks like a
    big button"). Each was too heavy — the fix was making the actions smaller, not rearranging them.
    A probe must not read a pill's `scrollWidth`: the `::before` makes it 4px wider than the box.
  - **Three across from `sm`, four from 1800px** (`sm:grid-cols-3 min-[1800px]:!grid-cols-4` — the
    `!` because Tailwind emits the arbitrary `min-[1800px]` before `sm`, which then won at 1920),
    **top-aligned** (`sm:items-start`): every card has the same three rows, so every card is one
    height and every row is level. Between 640 and 1023 the floor's padding (`sm:p-2.5`) and the
    grid gap (`sm:gap-2.5`) give back the few pixels that keep four segments ≥44px in a third.
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
