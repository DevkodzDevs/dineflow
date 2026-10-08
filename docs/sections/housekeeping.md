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
