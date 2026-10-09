# Menu

**Route** `/menu`
**Files** `app/(app)/menu/page.tsx` · `MenuClient.tsx` · `Options.tsx` · `actions.ts`
**Reads** `menu_items`, `categories`, `menu_variants`, `addon_groups`, `addons`,
`menu_item_addon_groups`, `combo_items`, `recipe_items`, `ingredients`
**Writes** `saveMenuItem`, `saveCategory`, `deleteCategory`, `toggleAvailable`, `deleteMenuItem`,
`saveRecipe`, `applyStandardRecipe`, `setCategoryStation`, `suggestDish`, `suggestRecipe`

## What it is

The dish list, its categories, and everything a dish can be sold as — sizes, add-on groups, combos —
plus the recipe that makes the pantry move when the dish is cooked.

## How it works

**The toolbar** is a filter rail plus an action group:

```
[ All ][ Starters ][ Mains ][ … ]        [ + Categories ][ Add-ons ][ + New dish ]
└── .toolbar-group: scrolls, fades      └── .toolbar-end: never scrolls
```

Category chips use the shared `.chip` / `.chip.on` classes so they match every other rail in the
app. *Manage categories* lives in the action group, not at the end of the rail — it is not a filter,
and at the end of a scrolling rail it was the first thing to disappear.

**Options** (`Options.tsx`) holds three editors: `OptionsEditor` (a dish's sizes and which add-on
groups it offers), `GroupsManager` (the groups themselves, shared across dishes) and `ComboParts`.
A dish card shows what it has as small pills — `combo · 3 parts`, `Half / Full`, `2 add-on groups`.

**Recipes** map a dish to ingredients per plate. `findStandardRecipe` in `@dineflow/shared` offers a
known plate for common Indian dishes; `applyStandardRecipe` maps it and creates any missing pantry
lines. With `ANTHROPIC_API_KEY` set, `suggestDish` and `suggestRecipe` propose values the person then
checks and saves — the server throws away any ingredient id the model invents.

**From photo** (`MenuImport.tsx`, a toolbar button after *Add-ons*). `readMenuPhoto` reads a
photographed printed or handwritten menu into dishes — name, section, price, veg — and writes
nothing. The owner ticks what to keep, fixes a name or price, toggles veg, and *Add N dishes* →
`importDishes` is the only write: it matches a section by name or creates it (`sort_order` 100+),
validates every row with `menuItemSchema` (prep 15 min, available) and inserts in one go. **A dish
whose name is already on the menu starts unticked**, so a second photo of the same page does not
double the menu. Without the key it returns a three-dish sample (Ghee roast dosa, Mutton chukka,
Jigarthanda) — on manoooo, Mutton chukka already exists and shows as *already on your menu*.

**A dish with no recipe does not move stock**, and the card says so in red.

## Before you edit

- **The photo import's name and price boxes are `!min-h-10`, 44 on touch** — they were `!min-h-0`,
  35px, under the touch floor at 412, 834 and 1194.

- **A price comes from the cheapest variant when variants exist** — the card shows `from ₹X`. Do not
  read `menu_items.price` as the sell price without checking `menu_variants`.
- **`is_available` is the sold-out switch, not stock.** See [orders-and-till.md](orders-and-till.md).
- **Deleting a category does not delete its dishes**; they fall back to uncategorised.
- **The AI buttons only appear when `ai` is true** (the key is set). Everything must work without
  them. *From photo* is the exception — it always shows, and runs a labelled sample without the key,
  the same way Scan does.
- **The dish form is uncontrolled** (`defaultValue`). The model fills it by writing onto the inputs —
  the same thing a person would type — so nothing about how the form saves changes.

## Verify

```
node toolbars.mjs        # 24 checks; menu is the hardest rail in the app
node responsive.mjs      # the add-ons dialog at 5 widths
pnpm --filter @dineflow/web test    # lib/options.test.ts — 7 tests on the option maths
```

## See also

[orders-and-till.md](orders-and-till.md) · [inventory.md](inventory.md) ·
[design-system.md](design-system.md)
