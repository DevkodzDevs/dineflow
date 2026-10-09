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

- **Never write a stock level directly.** Append to `stock_ledger`; the level is derived. A direct
  write silently breaks the leak report, which compares expected against actual movement.
- **Units are per-ingredient and do not convert automatically.** `applyStandardRecipe` skips an
  ingredient the pantry keeps in another unit rather than guessing, and says so.
- **On a phone the purchase row stacks**: the ingredient takes its own full line, qty / cost / packs
  sit under it. Five columns at 412px left the name ~100px and it hid under the select's arrow.
  `sm:` and up keep the single row.
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
