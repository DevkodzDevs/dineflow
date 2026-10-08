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

- **A room card is one shape everywhere**: the number (30px) with the guest or "Vacant" under it and
  the state chip (dot + label) at the right; a line with the since-time and "out MM-DD" / "Due out"
  tags; then one row of controls — the main action full-width (Cleaned / Touched up / Pass), Fail
  beside it when an inspection is due, and Pickup / Mark dirty behind a ⋯ menu (`menuFor`, closes on
  outside tap or Escape). A room with nothing to press shows "Ready to sell" / "Guest in room" /
  "Awaiting sign-off" in that place. The state is a slim pill inside the left edge. Floor sections
  are not `overflow-hidden`, so the ⋯ menu is never clipped. Probe: `card.mjs`.

- **Floors are an accordion** (`openFloor`: a floor number, `"all"` or null). The first floor is
  open; opening another closes it; tapping the open one closes it. The board head is "FLOORS n" and a
  segmented switch, One at a time | All open; tapping a floor while all are open shows just that one.
  Each floor head: its number in a tile (filled when open), bold name, tags for rooms / dirty /
  out of order (or "all clear"), and the chevron in a round button. Probe: `acc.mjs` (1440 dark, 390 paper).

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

- **On a phone the room board is one room per row** (`grid-cols-1 min-[520px]:grid-cols-2 …`) and
  a card's actions are one row of equal buttons (`grid-flow-col auto-cols-fr`); from 520px it goes
  back to the two-column action grid with the lead action spanning. Two across on a phone, a 170px
  card stacked four 44px pills two by two beside cards with one — tall empty holes.

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
