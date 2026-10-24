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

**Online, per dish** (0132, 2026-10-22). For whoever may switch it (`canSetOnline`: owner, manager, chef, a supervisor with
Online orders) each card carries its own button on the photo's top-right corner — a dark glass circle with a green globe, or
an orange *Not online* pill — beside, not inside, the photo's button (a button cannot nest in a button); the camera hint
steps left of it. The footer stays *Available* + Edit (the first version put a third square there and *Available* read
"Av…"; and a NOT ONLINE tag on the bottom-left sat where *No recipe* lives). On a phone's row: a 44px globe square before the
Sold-out switch, and the status reads *Not online* in orange. Off online is not Sold out: the till and table still sell it.
See online-and-channels.md, *Dishes online*.

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

**Every dish photo is drawn at the size it is shown (2026-10-22, the owner: "a lightweight feel").** A chosen photo is
stored as Wikimedia's 960 px thumbnail (150–400 KB) or, under 640 px, the original file; the till, Menu, the website and the
kiosk drew those into tiles 60–250 px wide. `components/menu/DishImage.tsx` asks for the smallest thumbnail Wikimedia
serves that covers the spot (`photoAt` in `lib/dishPhotos.ts` — steps 250, 330, 500, 960, 1280; 320 and 400 answer 400):
Menu's phone row 250, the till and the website card 330, Menu's card and the kiosk 500. A thumbnail is only ever made
smaller; an original is asked for as a thumbnail too, and if that file does not come (narrower than the step, Wikimedia
answering 429) the image falls back to the stored URL, so a tile never shows a broken picture. The property's own uploads
are 900 px WebP already and are left alone. Measured (`img62.mjs`, phone, 13 real photos, cache off): the till
**2,314 → 472 KB**, Menu **2,312 → 308 KB**; with every smaller thumbnail blocked, all 13 still drew (from the stored file).
A new place that shows a dish photo uses `DishImage`, not a bare `<img src={image_url}>`.
- **The recipe library stays on the server** (2026-10-18). `findStandardRecipe` and its 220 kB library were imported by
  `MenuClient` — most of the screen's JavaScript, ~0.9 s on a first visit. `page.tsx` now finds the plate for each of
  this property's dishes and passes `std: Record<itemId, StandardRecipe>`; the list, the recipes overview and the recipe
  editor read it. Do not import `findStandardRecipe` (or anything from `recipes.ts`) in a client component.
- **"No recipe" is a frosted badge on the photo** (2026-10-20 — the owner marked the amber "⚠ No recipe" pill, which
  sat in a row of its own on some cards only: "the design and the placing are not good"; a first try that turned it into
  a "+ Add recipe" chip row was not what they asked for). It sits on the photo's bottom-left corner (veg mark top-left,
  camera top-right), so it takes no row and every card in a row is the same height: 26px, 11.5px semibold white text, an
  amber dot, dark glass `rgb(10 10 13 / .55)` + `backdrop-blur-md` with a faint white ring — it reads over any photo and
  over the no-photo plate in all five themes. A ✦ sparkle when the library has a standard plate for the dish. It is a
  `<button>` of its own beside the photo button (a wrapper `div.relative` holds both — buttons cannot nest),
  `[data-no-recipe]`, `aria-label="Recipe — dish"` as before, and opens the recipe editor; on touch an invisible
  `::before` (`-inset-[9px]`) makes it a 44px target. Dishes with a recipe show nothing extra. The phone row says the
  same in its meta line: a small amber dot and "No recipe" (the amber mixed a quarter toward the label, so it reads on
  the light themes).
- **The Photo dialog is wide and two columns** (2026-10-20, the owner's "dialog height issue"). `DishPhotoPicker` is an
  `@container`: from 34rem the chosen photo sits left and the found photos, Take a photo / Upload and the note right; the
  photo is never taller than 42dvh. Stacked in the 512px dialog the 4:3 photo alone was 348px, so on an iPad held sideways
  the dialog reached the screen's edge with the found photos and Upload below the fold — it looked cut off. The dish form
  (a narrow dialog) stays stacked. `Sheet`'s body is also `flex-auto` now — see design-system.md.

- **More tools is a panel of five even tiles** (`[data-tools]`, `[data-tool]`, 2026-10-21): icon in its colour, name, one
  line on what it is for (wraps, never cut) — two across on a phone, three on a tablet, five on a desktop. Were five
  outline buttons wrapping into uneven rows. `[data-recipes]` and `[data-find-photos]` are kept on their tiles.
- **Short copy** (2026-10-23): subtitles and hints cut to a few words.
- **More tools fills its last row** (`.fill-tiles`, 2026-10-24): 2 + 2 + Find photos across the row on a phone, 3 + two
  halves from 640px, 5 in a row from 1024px. "Find photos" sat alone beside a hole. See design-system.md.
- **Categories, iPad and desktop (2026-10-24, the owner: "doesn't look good"; the phone is unchanged).** Each row
  (`[data-cat-row]`) has the category's icon (`catIcon`), its dish count, **Rename** (`[data-cat-rename]` → an inline field,
  Enter saves through `saveCategory` with the id, Escape cancels) and Delete. The add form (`[data-cat-add]`) is one joined
  field — a tag icon, the input, Add inside it — under "Add a category", with **Usual ones** chips (Starters, Main course,
  Breads, Rice & biryani, Desserts, Beverages — those not already there; one tap adds). An empty list says so.
- **No dishes yet** is `Empty`'s sm+ form (design-system.md).
