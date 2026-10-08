# Orders and the till

**Routes** `/orders` (the floor) · `/orders/new` (the till) · `/orders/[id]` (one ticket)
**Files** `app/(app)/orders/page.tsx` · `OrdersClient.tsx` · `new/PosClient.tsx` ·
`[id]/OrderDetail.tsx` · `actions.ts`
**Reads** `orders`, `order_items`, `dining_tables`, `menu_items`, `menu_variants`, `addon_groups`,
`menu_item_addon_groups`, `combo_items`, `categories`, `bookings`
**Writes** `place_order`, `fire_kot`, `recall_kot`, `move_order`, `merge_orders`, `split_order`,
`menu_stock`

## What it is

The busiest screen in the app. `/orders` is the floor at a glance — one card per table, open tickets
and their totals. `/orders/new` is the till: pick dishes, build a ticket, send it to the kitchen.

## How it works

**The till** (`PosClient.tsx`) is a two-track layout: a dish grid on the left, the ticket on the
right.

```
<div className="grid lg:grid-cols-[minmax(0,1fr)_clamp(280px,32%,380px)] gap-6">
  <section className="min-w-0"> … dishes … </section>
  <aside className="feather p-4 sticky …"> … the ticket (CartPanel) … </aside>
```

**Dish tiles** are `grid-cols-2` on a phone and `repeat(auto-fill, minmax(176px, 1fr))` above it —
3 across at 1194 and 1440 beside the rail, 6 at 1920, 4 on a tablet without the rail. A tile is: veg mark · category · price
(`formatINR(…, { whole: true })`, so ₹280 not ₹280.00) on one line, the name on two (`min-h-[2lh]`
keeps rows level), and a `.stepper` right-anchored at the bottom. **At zero the tile shows one plus
and nothing else.** Once the dish is on the ticket, the minus and the count appear to the left of
the plus — the plus itself never moves, which is the whole contract (design-test measures it).
`takeOne` removes one; clearing a dish outright is the cross on its ticket line.

The grid is **photo-first only when at least half the menu has `image_url`** (`photoFirst`):
`Thumb size="lg"` becomes a full-width 4:3 picture on every tile (initial stand-in for the few
without one) and `size="sm"` a 40px thumb on each ticket line. Under that threshold no thumbs are
drawn at all — sixty grey squares with letters in them are not thumbnails.

**The ticket rail** (`CartPanel`, used in the desktop `<aside>` and the phone sheet alike) reads top
to bottom: "Order details" + Clear · `Segmented` type (Dine in / Takeaway / Delivery / Room when
guests are in) · for dine-in, **Table and Guest side by side**, each a button that opens below it —
Table into a 5-across grid that closes on pick (occupied dimmed, the "already has order #n running"
notice under it), Guest into Name + Phone (phone drives `lookupCustomer`); takeaway and delivery
show Name + Phone directly · "Ticket · n items" + Courses toggle · the line cards (name and ×, then
`.stepper`, a note icon and the price; the note field appears below only when opened) · then a fixed
summary block: the cooking-request chip and the total on one row, the on-time promise, errors and
pantry warnings, and a full-width `Button variant="ink"` Send to kitchen.

**The rail always fits the screen; only the ticket lines scroll.** Every child of the panel is
`shrink-0` except the line list (`flex-1 min-h-0 overflow-y-auto`). The desktop `<aside>`'s height
is **measured** (`railRef` effect, on scroll and resize): viewport bottom less 16px, from the rail's
top or the 24px sticky line, whichever is lower — and capped at the dish column's bottom. The dish
`<section>` is `lg:min-h-[calc(100dvh-2.5rem)]` so it is always long enough for the rail to stick.
A fixed `calc(100dvh - 3rem)` put Send to kitchen ~180px below the fold, because the rail starts
under the master banner and search bar, not at the top of the viewport. Measured list space with
nine dishes: 1920×1080 465px · 1440×900 283 · 1366×768 151 · 1194×834 217 · 1024×768 130 ·
834 sheet 609 · 412 sheet 372.

A dish with sizes or add-ons opens `OptionChooser` instead of incrementing. Combos expand to their
parts. "+ Cooking request" writes `p_note`.

**Ticket types** are Dine In / Takeaway / Delivery / Room. Room posts the charge to a folio via
`post_order_to_room` (see [front-desk.md](front-desk.md)).

**Moving work around the floor** — `move_order` (table to table), `merge_orders` (two tickets into
one), `split_order` (one into two) — all RPCs, all atomic.

## Before you edit

- **The floor is two tables across on a phone** (`grid-cols-2 min-[520px]:grid-cols-3`). At three, a
  108px card could not hold "T3 · READY · 4 seats". In the open-orders list the dish names truncate
  and the total is `shrink-0`, so they never run together.

- **The control floor is unlayered CSS** (`:where(button) { min-height: 40px }`, 44 under a coarse
  pointer). A plain `h-8` utility loses to it; only an `!important` utility wins. Size tile and rail
  controls at 40 (`h-10`) and let the floor lift them on touch — do not fight it with `!h-8`.
- **Narrow tiles cannot hold price + × + stepper on one row** (176px tile, 44px touch targets).
  That is why the price lives in the top meta row and the tile has no cross.
- **`minmax(0,1fr)`, never `1fr`, for the dish track.** A `1fr` grid item will not shrink below its
  content and pushes the ticket rail off the screen. Pair with `min-w-0` on the section.
- **A floor table is one card** (`feather`, `filled` when occupied): the `Link` on top, and for a
  table with no ticket a Reserve button inside the card (`.room-act`, 40/44px). Grid rows stretch,
  so every card in a row is the same height without a placeholder. Reserve was 11px text floating
  under the card — a 16px target that made free cards look shorter than occupied ones.
- **Reserved is `--color-orange` with a dashed border**, never `--color-saffron`, which is green in
  the dark theme. Free carries a green dot.
- **Open orders carry a 3px state strip** (ready green, preparing orange, served blue, pending
  grey); the dish line sits under a hairline with the total `shrink-0`.
- **Stock is not `is_available`.** `is_available` is the dish-level sold-out switch the menu owns;
  `menu_stock` is the live count derived from recipes and the pantry. Both can hide a dish.
- **Never write `order_items` directly.** `place_order` recomputes the ticket, applies variants and
  add-ons, and checks stock in one transaction.

## Verify

```
node design-test.mjs     # the till checks: one plus at zero, two taps put 2 on the tile and a
                         # minus beside the plus, the plus has not moved, the ticket agrees, the
                         # minus takes one back and retires at zero, 0 nested buttons
node responsive.mjs      # the till and the option dialog at 5 widths
node fit.mjs             # nine dishes on the ticket at 7 real screen sizes (not full-page shots,
                         # which hide this): panel ends on screen, Send visible, the line list
                         # scrolls, nothing else overflows, still fits after scrolling the dishes
                         # and with one short category at 1920
```

## See also

[menu.md](menu.md) · [kitchen.md](kitchen.md) · [billing-and-invoices.md](billing-and-invoices.md)
