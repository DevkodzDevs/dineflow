# Pantry, purchasing and leaks

**Routes** `/inventory` · `/inventory/leaks`
**Files** `app/(app)/inventory/page.tsx` · `InventoryClient.tsx` · `Purchasing.tsx` ·
`leaks/LeaksClient.tsx` · `actions.ts`
**Reads** `ingredients`, `stock_ledger`, `suppliers`, `purchase_orders`, `purchase_items`,
`purchases`
**Writes** `stock_count`, `po_save`, `po_set_status`, `po_receive`, `po_suggest`,
`ingredient_prices`, `wastage_summary`, `leak_report`

## What it is

What the kitchen has, what it is buying, and where it is losing money.

## How it works

**`ingredients`** is the pantry list — name, unit, current stock, reorder level. `v_low_stock` is
the view the dashboard reads.

**`stock_ledger`** is the movement log and the source of truth: every receipt, every deduction from
a fired ticket, every count, every wastage line. Current stock is derived from it. A stock count
writes an adjustment row with the difference, never an overwrite.

**Purchasing** (`Purchasing.tsx`) is a real PO → GRN flow: `po_save` drafts, `po_set_status` moves it
(`draft` → `sent` → `received`), `po_receive` books the goods in and writes the ledger rows.
`po_suggest` proposes a basket from reorder levels and the forecast.

**Scan the supplier bill.** *Record purchase* opens with a photo card. `readSupplierBill` (in
`actions.ts`) sends the photo to the model with the pantry list and gets back supplier, invoice
number and lines, each matched to an ingredient by name. Matched lines land as ordinary form rows;
lines for things the pantry does not stock are listed apart in orange (*Not in your pantry*), to add
as ingredients first. **It writes nothing** — *Add to pantry* → `recordPurchase` is still the only
write, exactly as when the form is typed. Without `ANTHROPIC_API_KEY` it returns a labelled sample
(`Sample Traders`, `SAMPLE-104`, three pantry items plus one unmatched line).

**Leaks** (`/inventory/leaks`) is the variance report: what the recipes say should have been used
against what the ledger says actually went, per ingredient, with a money figure. `wastage_summary`
feeds it.

**Recipes are what connect the two halves.** A dish with no recipe mapped does not move stock when
it is cooked, and the leak report cannot see it. See [menu.md](menu.md).

## Before you edit

- **The Stock tab is Simple Service (2026-10-15).** `SvcHead` ("Buy red and orange") with Leak finder and **Goods arrived** (the Record purchase sheet) — the page head moved from
  `page.tsx` into the client. The tabs and **+ Ingredient** follow. On Stock: three big tiles — **Finished**
  (nothing left, red), **Running low** (at or under the reorder level, amber), **Enough** (green), each a filter
  (`data-level`, `!min-h-[84px]` because `:where(button)` would hold them at 40) · the low-stock strip (Tomorrow's
  list, Draft a purchase order) · a 56px search by name or barcode with a link to Scan · the stock value line · the items
  (`[data-ing]`, `data-level`), finished first, then low. **On a phone a list** (`[data-pantry-list]`): the
  category's picture in its state's colour, the name (a button, `aria-label="Edit"` — the keyboard opens it), the
  amount big with the state, a thin bar, and two 48px squares — **+** (Add stock: the adjust sheet, *Add or correct
  stock*) and the bin (Waste: the same sheet on *Wastage*). **From `sm` a card** (`[data-pantry-grid]`): the
  picture in a tinted square, the name (one line, whole in its title — a two-line name pushed
  its card's amount out of line), the state as a pill, the amount in 34px with "reorder at n",
  a bar against three times the reorder level, **Add stock** — solid green only on an item that needs buying, a
  soft green on the rest, so a full shelf is not a wall of bright buttons — and **Waste**, with the pencil
  top right. The table and its `[data-stock-inline]` phone line are gone.

- **When stock leaves (0092).** `restaurants.stock_draw`: **`ticket`** (default) — a line draws its recipe
  the moment it is inserted, which is the moment the order reaches the kitchen (`place_order` /
  `add_items` insert lines as `pending`); a line cancelled while still pending is credited straight back
  (positive `sale` rows, note *cancelled before cooking*; the leak report and `report_summary` sum the
  ledger, so a credit nets out). **`cook`** — the 0055 rule, on *Start cooking*. Either way a line draws
  **once**: the guard is the ledger's net for that line, so a credited line can draw again if revived,
  and a property switched from `cook` to `ticket` mid-service still draws its pending lines when they
  start or are billed (billing marks lines served). Settings → Kitchen holds the switch. Dry run
  `dry92.cjs` (14).
- **The Stock tab says when something is at or below its reorder level** (`[data-low-strip]`): names,
  "already on Tomorrow's buy list", *Tomorrow's list* and *Draft a purchase order* (→ the Orders tab,
  where `po_suggest` drafts from reorder levels). Tomorrow's list (`forecast_day`, 0092) now carries
  every such ingredient, topped up to twice the level — see [reports-and-forecast.md](reports-and-forecast.md).


- **Pantry's head** is `SvcHead` in `InventoryClient` (Leak finder, Goods arrived — full width under the title on
  a phone). The Leak finder page keeps its own `PageHeader`.


- **Never write a stock level directly.** Append to `stock_ledger`; the level is derived. A direct
  write silently breaks the leak report, which compares expected against actual movement.
- **Units are per-ingredient and do not convert automatically.** `applyStandardRecipe` skips an
  ingredient the pantry keeps in another unit rather than guessing, and says so.
- **Record purchase is one card per item**, not a five-column row: the ingredient picker across the top
  (`aria-label="Ingredient"`) with a 44px delete, then labelled Qty (with the unit) and Cost per unit,
  an "In packs of N" toggle only when the ingredient has a pack size, and the line's own total. From
  `sm` the bottom row is `1fr 1fr 14.5rem`, a fixed last column so every item's fields line up whether
  or not it has the packs toggle. Above the items: a solid scan card with a Take photo button, a result
  panel ("3 items read · Supplier", sample pill, unmatched items as amber chips), and Supplier/Invoice
  auto-fit at 11rem. `cost.mjs` measures every cost box: 219/219 at 834–1920, 166/166 at 412. The old
  rows cut "972.02" to "972.0" and hid ingredient names under the select arrow on a phone.
- **A received PO is a financial record.** Correct it with a new adjustment, not an edit.
- **`/inventory/leaks` is read-only** and is meant to be. It is evidence for a conversation, not a
  place to change numbers.

## Verify

```
pnpm --filter @dineflow/web typecheck
node toolbars.mjs        # the pantry rail at 4 widths
```

Then receive a small PO on a demo property and confirm the ledger and the level both moved.

## See also

[menu.md](menu.md) · [reports-and-forecast.md](reports-and-forecast.md) · [scan.md](scan.md)
- **The pantry is a list on a phone and cards from `sm`** (2026-10-15): the amount a store keeper opens the page
  for is the biggest thing on each row and card. (It was a table whose *In stock* column ran off a 412 screen.)
- **The item's picture is in its kind's colour** (2026-10-20 — the owner could barely see it: the state's green drawn on
  the state's green wash, the same on every healthy item). `IngIcon` in `InventoryClient` (`[data-ing-icon]`, card and
  phone row): `ING_HUE` by category — vegetables green, fruit and grocery amber, dairy blue, meat red, seafood and
  cleaning cyan, drinks and packaged violet — as a 17% wash over the card with a hairline of the hue, the drawing 23px at
  2.1 stroke in the hue mixed a fifth toward the label (lifted in the dark themes, deepened in the light). A finished or
  low item carries a dot in its state's colour (`--st`) on the corner; the state itself is still the pill and the bar.

- **Flap numbers (2026-10-20)** — design-system.md, *Flap numbers*. Finished / Running low / Enough are shuffling flap counts (`[data-level-n]`), red / amber / green when they hold anything.

- **The pantry switch and purchase orders, redesigned (2026-10-21 — the owner: "messy").**
  - **A master saw every property's purchase orders, with no ingredient names.** `purchase_orders`, `purchase_order_items`
    and `suppliers` let a platform admin read every property (RLS `… OR is_platform_admin()`); `ingredients` does not. So
    the owner, signed in as master and acting as a resort, got all 20 orders ("18 waiting" = 8 drafts + 10 sent, across
    two properties) and lines reading *10 —, 15 —*. `page.tsx` now awaits the session and asks every list for
    `restaurant_id = session.restaurant.id`. Other pages that lean on RLS alone may show the same to a master.
  - **The switch** (`[data-pantry-tabs]`, `[data-pantry-tab]`): a 3 × 2 grid of icon tiles on a phone, one row of six from
    `sm` (were six pills running off the screen); the Orders count is a badge. *+ Ingredient* shows on Stock only.
  - **Purchase orders** (`[data-po]`, `[data-po-status]`): a head of three counts — Drafts, Sent, On order (₹) — and
    New order; then a card each, the way an OTA card is: status icon, supplier, PO no · lines · date, the total and a
    status badge; the lines as chips (quantity + unit, then the name; four shown, *+n more*; *got n* when received short);
    expected / received date, and *Back to draft* on a sent one; the actions as the footer strip (`CardStrip`: Send or
    Resend on WhatsApp — a draft becomes sent — · Edit · Cancel · **Receive**). Open orders first, then received, cancelled
    last (`PO_RANK`). shots35 checks names on every line, strips on open ones only, 360–1440.
  - **Cards across, the owner's choice (2026-10-21):** from `lg` a 2 · 3 · 4 switch (`[data-po-cols]`, `Segmented`) beside
    New order; **3 unless chosen**, kept on that device (`localStorage` `df-po-cols`, read after mount, every access in
    try/catch). A tablet shows 2 across, a phone 1, and neither shows the switch. At 4 across a card under 19rem drops its
    status icon and the total goes a size down (`@max-[19rem]`), so the supplier's name keeps its room. shots36: 18 of 18.
  - **No empty card (2026-10-21, the owner: "this empty card design").** Cards in a row stretch to the tallest, so a
    one-line order showed a blank gap and the closed ones had no foot. Now: the lines are a list (name · qty unit · ₹, three
    shown, *+n more*) in a soft panel (`[data-po-lines]`) that takes the spare height, with *Items · n* and *Back to draft*
    on its head; under it the track (`PoTrack`, `[data-po-track]`): Drafted → Sent → Due / Received, Cancelled in red, each
    with its date; and **every card has the footer strip** — received and cancelled ones get **Order again**, which opens the
    form on a copy with no id (supplier, note and lines kept, no date) and saves a new draft (`savePo` sends `po?.id ||
    null`). A one-action strip keeps the four-action strip's height (`[&>*]:!h-14 @[26rem]:[&>*]:!h-11`), so the strips
    of a row line up. Only the body of a cancelled card is dimmed, not its Order again. shots37: 8 of 8 (strips level at 2,
    3 and 4 across, Order again saved PO-5 as a draft). A probe that inserts POs by number must move `counters` (`po`) on, or
    the next real order collides with PO-1.

## Stock as a grid, an item's details, and the supplier cards (2026-10-23)

- **Cards or a table** (the owner: "a grid, a row opens the product in a dialog, the cards untouched; the grid from an iPad
  up, cards on a phone; a default I can set"). A ViewSwitch beside + Ingredient; until a default is pinned, CSS shows the grid
  from md and the phone list / cards below it (`df-view:pantry`). `PantryGrid` (end of InventoryClient.tsx,
  `[data-pantry-table]`): Item, State, In stock with its bar, Reorder at, Cost / unit, Value, Category, Barcode — columns by
  the grid's own width — every column sorts, and + (Add stock) and the bin (Waste) sit at the row's end. **A row opens
  `ItemDetail`** (`[data-item-detail]`): how it stands, the amount against its reorder level, cost, value, pack, barcode,
  the last six stock moves, the price history, and Add stock · Waste · Edit (each closes it and opens its own sheet).
- **Supplier cards** (the owner: "modern"): built like an OTA channel card — the initial on its own hue, the name and what
  they bring (the notes), the lead time as a pill, a soft panel with the phone and the GSTIN that never wraps a line, and
  Call · WhatsApp · Edit along the foot (`CardStrip`).
- **Short copy** (2026-10-23): subtitles and hints cut to a few words.
- **Pantry is empty** (and no purchases, orders, suppliers, wastage — 2026-10-24) are `Empty`'s sm+ form with their own icons
  (design-system.md). The phone is unchanged.
- **Shorter copy (2026-10-29, the owner: "maximum 3 or 4 words, try 2 or 3 — clean and neat").** Subtitles, hints, helper
  lines and empty-state hints cut to two–four words, or removed where they said the obvious. Error and refusal messages,
  steps to follow outside the app, printed and exported text, WhatsApp bodies and tooltips were left as they were.
