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

- **The Stock tab is Simple Service (2026-10-15).** `SvcHead` ("What is on the shelf. Red and orange need
  buying.") with Leak finder and **Goods arrived** (the Record purchase sheet) — the page head moved from
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
