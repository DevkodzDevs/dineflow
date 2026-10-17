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

**The head and the chips** (Simple Service, 2026-10-15): `SvcHead` ("Switch a dish off when it runs out —
waiters see it at once") with **More tools** and **New dish**; More tools unfolds Categories, Add-ons, From
photo, Recipes and Find photos (`data-tools`) — the owner's weekly tools, kept off the service screen. Under it
the categories as a `Rail` of chips with their picture (`catIcon`) and dish count, and **Sold out** last in red
when any dish is off (`data-cat="soldout"`, a filter).

**Options** (`Options.tsx`) holds three editors: `OptionsEditor` (a dish's sizes and which add-on
groups it offers), `GroupsManager` (the groups themselves, shared across dishes) and `ComboParts`.
A dish card shows what it has as small pills — `combo · 3`, `Half / Full`, `2 add-ons`.

**The dishes** (`MenuClient.tsx`, `data-dish`; 2026-10-15, after the owner marked the first cards "not looking
good"). **On a phone a list** (`[data-dish-list]`, `sm:hidden`): one row per dish — a 64px photo (tap to change it)
with the veg chip on its corner, the name, the price with *Available* / *Sold out*, "15 min · N ingredients" (or
*No recipe* in amber), and the `Switch` at the end of the row; a tap on the name opens the dish. **From `sm` a card** (`[data-dish-grid]`, `repeat(auto-fill, minmax(15rem, 1fr))`; the third pass — the owner
marked the first two "not looking good"): an inset photo, 4:3 with rounded corners inside the card's 8px padding
(a camera disc on hover, always on touch); with no photo a soft neutral plate — the dish's drawing (`glyphFor`) in a
glass circle and "Add a photo" — instead of `DishGlyph`'s green or red block; `VegBadge` — the printed square on a
white chip — top left; when off, the photo darkens under a red **SOLD OUT** label. Under it the name (one line,
whole in its title; a `div role=heading`, since an `h3` takes the display font from the global heading rule) and
the price in whole rupees on the same line, "Starters · 15 min", an amber **No recipe** chip only when the dish
moves no stock (opens the recipe), and one footer: the **Available / Sold out** pill — a dot, the word, the
toggle, the whole pill a `<label>` (`data-available`), red when off — and a square pencil for Edit. Sizes,
add-ons and the recipe open from Edit. The dish editor now opens with **Sizes & add-ons** and **Recipe** (`data-dish-more`), the way
in from a phone. Probe: `svcflow2.mjs` flips a dish off and back.

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

- **Toggles and deletes report a refusal** (`lib/wrote.ts`): availability, add-ons, deleting a dish (a dish on
  past orders says to switch it off instead), clearing a combo or a recipe. With the role walls a refused write
  changes nothing and returns no error — the switch used to flip anyway.
- **The menu is written from Menu** (0098). Restrictive policies on `categories`, `menu_variants`,
  `addon_groups`, `addons`, `menu_item_addon_groups`, `combo_items`, `recipe_items` need the Menu
  module; `menu_items` has `guard_menu_item_write`: Menu writes anything, Scan may add a dish (every
  role has Scan), Online orders may change only `external_refs` (mapping an aggregator's dish). A
  housekeeping or waiter login could reprice the menu through the API before. RPCs are not affected.
- **Recipes** (toolbar, `[data-recipes]`) opens the overview — every active dish by category with a
  state (`[data-recipe-row][data-state=mapped|ready|none]`): mapped dishes show their plate in cook's
  units (`fmtQty`: 0.18 kg → "180 g", 0.015 l → "15 ml"), dishes the library knows show the library's
  plate greyed with *Use the library plate*, the rest say *map by hand*. **Set up N dishes from the
  library** (`[data-setup-recipes]` → `autoRecipes()`) applies `apply_standard_recipe` to every active
  dish without a recipe that `findStandardRecipe` knows, at most 60 a press, and the pantry gains any
  ingredient it lacked. The owner asked which foods take how much oil and flour; the answer had been
  spread over one sheet per dish.
- **The library is 282 dishes, 193 ingredients** (`packages/shared/src/recipes.ts`; it was 102/156).
  Raw weights per plate, at yield (200 g of chicken raw → ~150 g plated; curry cut ~90%, boneless
  ~60%) — the trade's costing convention, not a nutrition serving. `apps/web/lib/recipes.test.ts`
  (7) checks every line names a vocabulary ingredient in its unit, amounts are plate-sized (protein
  30 g–1 kg, oil ≤ 60 ml, rice ≤ 250 g), no dish repeats, and the matcher: a library key left with
  only style words ("Veg biryani" → "biryani") answers only a name as bare as itself — it used to hand
  "Hyderabadi chicken dum biryani" a *veg* biryani — and a bare half-match must agree on the kind of
  dish ("Mango juice" is not a mango lassi). Size words (family pack, large) are ignored. Add a dish:
  one entry, vocabulary names only; run the test.
- **The toolbar has six actions now**, so it stacks everywhere below 1482px (`:nth-child(6)` rule in
  `globals.css`); see [design-system.md](design-system.md).


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

## Dish photos (0088, 2026-10-12)

Every dish can carry a photo (`menu_items.image_url`, `image_credit`, `image_source`). Three ways in:

- **The dish form** — a *Photo* field under the description (`components/menu/DishPhotoPicker.tsx`).
  As the name is typed (650 ms after the last key, 3+ letters) it searches; on a new dish, or one
  without a photo, the best match is chosen by itself when it is a confident one (score ≥ 6) and a tap
  on any of the others changes it. *Take a photo* opens the phone or tablet's own camera (`capture="environment"`, a real tap is needed — a scripted click is refused by the browser); on a laptop, which has no camera app to hand to, a live preview takes the photo's place at the top of the picker with *Capture* and *Cancel*, and the camera is released after the shot. *Upload* and the camera both shrink to 900 px WebP in the browser and stores
  it in the public `menu` bucket under the property's folder (`uploadDishPhoto`). The ✕ removes it.
  The choice rides in three hidden inputs and `saveMenuItem` validates it (`photoSchema`: a Wikimedia
  file or this project's own `menu` bucket — nothing else).
- **A card** — the photo is a small square beside the name (64px, 72 from `sm`, rounded), the veg mark,
  name and price beside it and the description under the name; a tap opens *Photo · dish*, which saves
  the moment one is picked (`setDishPhoto`). With none, the square shows an **outline drawing of the
  kind of dish** (`components/menu/DishGlyph.tsx` — `glyphFor(name, category)`: cup for coffee/tea,
  bowl for curries, bread for naan/appam, fish, drumstick, rice, dessert…; a plate when nothing
  matches) on a soft veg/non-veg tint, with a small + badge. It was a dashed square saying *Photo*,
  and before that a full-width 16:10 banner — too big for a working menu list.
- **Find photos** (toolbar) — `autoPhotos()`: every active dish without a photo gets the best one
  found, only when it is confident; three at a time (Wikipedia throttles a burst — 25 at once came
  back as fallbacks only) and at most 40 a press. It says how many were added and how many are left to
  choose by hand. **It also runs by itself** the first time Menu opens in a browser session with any
  dish missing a photo (`sessionStorage` `dineflow.autoPhotos`), then refreshes the page if it saved
  some — the owner saw a whole menu of empty squares because nobody had pressed the button. There is
  no AI image generator wired in; photos are real, freely licensed Wikimedia pictures or the
  property's own.

**Where the photos come from** — `lib/dishPhotos.ts`, no key and no account: Wikipedia search
(`generator=search`, `prop=pageimages|description`, free licences only) with three queries — the
name, the name + "dish"/"drink"/"dessert" by its category, the name + "food" — scored by
`scoreArticle()`: shared words (menu spellings normalised — briyani → biryani, tacos → taco), the
description saying it is a dish/drink/dessert (+5), equipment ("Filter used to brew coffee", −4),
films/festivals/places/lists (−10). Then Wikimedia Commons file search for more choices, scored by
`scoreFile()` (a file named for every word of the dish → 7). Each photo's licence is read from
Commons (`extmetadata`); anything non-free (an enwiki "fair use" file) is dropped. The credit
("Photo: author · CC BY-SA 4.0 · Wikimedia Commons") is stored with the photo, shown under it in the
picker, as the card photo's tooltip, and links to its source. Measured on 25 dishes from Tamil,
North Indian, Thai, Italian, French, Japanese, Mexican and bar menus: 21 had the right dish first
(Masala dosa, Pongal, Kuzhambu, Idli, Medu vada, Indian filter coffee, Curd rice, Gulab jamun, Pad
thai, Sushi, Mojito, Tiramisu…), every one had 4–8 choices. `findPhotos` is limited to 60 searches
per person per 10 minutes.

**The till** already showed `image_url` (photo-first tiles once half the menu has photos); the guest
storefront now does too — see guest-facing.md.
