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
<div className="grid lg:grid-cols-[minmax(0,1fr)_360px] gap-6">
  <section className="min-w-0"> … dishes … </section>
  <aside> … the ticket … </aside>
```

Each dish tile carries a `Thumb` (image, or the initial plus a veg mark), a price pill and an
**always-visible stepper** — a dish not on the ticket still shows `− 0 +` with the minus disabled,
so the control never appears and disappears under a thumb. `takeOne` removes one, the cross clears
the dish outright and only exists while the count is above zero.

A dish with sizes or add-ons opens `OptionChooser` instead of incrementing. Combos expand to their
parts. "+ Cooking request" writes `p_note`.

**Ticket types** are Dine In / Takeaway / Delivery / Room. Room posts the charge to a folio via
`post_order_to_room` (see [front-desk.md](front-desk.md)).

**Moving work around the floor** — `move_order` (table to table), `merge_orders` (two tickets into
one), `split_order` (one into two) — all RPCs, all atomic.

## Before you edit

- **`minmax(0,1fr)`, never `1fr`, for the dish track.** A `1fr` grid item will not shrink below its
  content and pushes the ticket rail off the screen. Pair with `min-w-0` on the section.
- **A card in a grid cell needs the wrapper to be the flex column**, with the card `flex-1`. Putting
  `h-full` on the card hid the "Reserve" label behind the tile above it on `/orders`.
- **The "Reserve" slot is always rendered**, invisible when absent, so cards in a row stay the same
  height.
- **Stock is not `is_available`.** `is_available` is the dish-level sold-out switch the menu owns;
  `menu_stock` is the live count derived from recipes and the pantry. Both can hide a dish.
- **Never write `order_items` directly.** `place_order` recomputes the ticket, applies variants and
  add-ons, and checks stock in one transaction.

## Verify

```
node design-test.mjs     # 27 of its checks are the till: the stepper at zero, two taps,
                         # the cross appearing and retiring, the ticket agreeing, 0 nested buttons
node responsive.mjs      # the till and the option dialog at 5 widths
```

## See also

[menu.md](menu.md) · [kitchen.md](kitchen.md) · [billing-and-invoices.md](billing-and-invoices.md)
