# Menu

**Route** `/menu`
**Files** `app/(app)/menu/page.tsx` · `MenuClient.tsx` · `Options.tsx` · `MenuImport.tsx` · `actions.ts` ·
`lib/menuImport.ts` (the photo import's pure parts)
**Reads** `menu_items`, `categories`, `menu_variants`, `addon_groups`, `addons`,
`menu_item_addon_groups`, `combo_items`, `recipe_items`, `ingredients`
**Writes** `saveMenuItem`, `saveCategory`, `deleteCategory`, `toggleAvailable`, `deleteMenuItem`,
`saveRecipe`, `applyStandardRecipe`, `autoRecipes`, `setCategoryStation`, `suggestDish`, `suggestRecipe`,
`importDishes` (`readMenuPhoto` only reads)

## What it is

The dish list, its categories, and everything a dish can be sold as — sizes, add-on groups, combos —
plus the recipe that makes the pantry move when the dish is cooked.

## How it works

**The head and the chips** (Simple Service, 2026-10-15): `SvcHead` ("Mark sold-out dishes —
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

**From photo — "menu photo to a working POS in two minutes"** (`MenuImport.tsx`, a *More tools* tile; rewritten
2026-11-09, the pure parts in `lib/menuImport.ts`). The owner photographs the whole menu card — **Take a photo**
(`capture`, one page a shot, repeatable) or **Choose photos** (`multiple`: front, back, every page) — and every photo
is read **in parallel**, one `readMenuPhoto` call each (a 2000 px JPEG, under the 2 MB action limit), with a pill per
page: *reading… / N dishes / could not read* (`[data-import-pages] [data-page-status]`). The pages are merged
(`mergePhotos`): the same dish on two pages, or twice on one, is one row by normalised name (`normName` — case,
punctuation, brackets and a veg/non-veg suffix ignored); the **surer reading keeps the price and sizes**, blanks are
filled from the other, and a row the owner has edited counts as sure (confidence 1), so a later page cannot undo a fix.

*What the model returns, per dish* (`menuPhotoSchema`, Zod, enforced by the API — never free text): `name` (English),
`name_local` (as printed when it was in Tamil, Hindi or another script), `category` (the section heading), `prices[]`
(`{label, price}` — one entry a printed price, so Half/Full, Quarter/Half/Full, S/M/L come back as one dish with sizes),
`is_veg`, `packaged_goods` (a sealed product sold as bought), `description` (one line, printed only), `spicy`, `jain`,
`confidence` 0–1. **Tax is not asked of the model.** `taxFor` derives it: everything cooked or poured here stays on the
property's rate (`gst_rate` null, `hsn` null → SAC 996331 at bill time, 0146); on the **regular scheme only**, packaged
water is 18% / HSN 2201 and an aerated drink (Coke, Pepsi, Thums Up, Sprite…) 40% / HSN 2202 — a fresh lime soda or a
masala soda is made here and stays on the property's rate. `pricesToVariants` turns the price list into `price` (the
lowest) + `variants[]`, and `parseVariants` reads a raw price cell ("120/220" → Half/Full; three unlabelled → S/M/L;
"Half ₹90 Full ₹160", "S 80 M 110 L 150", "Qtr 90 / Half 160 / Full 300").

*The tick-and-fix pass* (`[data-import-row]`): tick, veg/non-veg, the name (the printed name and description under
it), the price — or **N sizes · from ₹X** (`[data-sizes]`, tap to edit each size, *+ Sizes* on a single-price dish);
the second line a **section** select (existing categories matched case/space-insensitively by `matchCategory` — "Mains"
→ "Main course", "Rice and Biryani" → "Rice & Biryani" — else the heading proposed *(new)*), **GST** (the property's,
or 0 · 5 · 12 · 18 · 28 · 40 with an HSN box once a rate is chosen), **Spicy** and **Jain**. All boxes are 40px, 44 on
touch; the second line wraps at 412. **A dish already on the menu** (`findExisting`: same normalised name, the same
section when it sits in several) **starts unticked and says *Already on menu at ₹X · skipped*; ticked, it reads
*price will update*** — that is the update-price / skip choice.

*The write* — **Add N dishes · update M** → `importDishes(rows: ImportRow[])`, the only write: `requireSession`, GST
and HSN checked (`gstRateOk`, `hsnOk`), missing sections created first (`newCategories`, `sort_order` 100+), then the
dishes with `menuItemSchema` (prep 15 min, available, `gst_rate`/`hsn` per dish) in one insert, then the sizes into
`menu_variants` (lowest the default) matched back by name. **Idempotent on the server too**: a dish whose normalised
name is on the menu is skipped unless its row says `update` — then only its price and sizes change (`saveVariants`) —
and a name twice in one batch is written once; a re-import of the same photo adds nothing. It answers
`{added, updated, skipped}`. `name_local` is shown in the form but **not stored** — `menu_items` has no column for it
(a migration to add one is the next step).

*After the import* (`[data-import-result]`): what was added / updated / skipped, one button **Attach standard
recipes** (`[data-attach-recipes]` → `autoRecipes()`, the library's plate for every dish it knows, at most 60) with
its answer under it, and *Done*. Food cost exists from day one without a second screen.

*An empty menu* shows a prominent **Photograph your menu card** card (`[data-import-card]`) above *No dishes yet* —
only when the import is available.

*Gating* — a paid call. The tile, the empty-menu card and `readMenuPhoto` all need **`aiEnabled()` (the server's key)
and the property's `ai` add-on (`featureOn(session, "ai")`, 0175)**; `page.tsx` passes `ai` as that conjunction, so the
other AI buttons on Menu (Fill the rest, Propose) follow the add-on as well. Off, the tile is not drawn and the action
answers one sentence ("AI help is not switched on for this property — Master control → Access → Add-ons turns it
on."). **The three-dish sample without a key is gone**: with four tiles the *More tools* panel still fills its rows.

`lib/menuImport.test.ts` (14): sizes from a price cell, the model's price list → price + sizes, category matching and
the new-section list, the merge of pages, *already on the menu*, tax, and the schema refusing an empty price list.

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
- **The AI buttons only appear when `ai` is true** — since 2026-11-09 that is the key **and** the property's `ai`
  add-on (`aiEnabled() && featureOn(session, "ai")` in `page.tsx`). Everything must work without them. *From photo*
  used to be the exception (always shown, a three-dish sample without the key); it is a paid call and is gated like
  the rest now — the tile and the empty-menu card disappear, `readMenuPhoto` answers one sentence.
- **The dish form is uncontrolled** (`defaultValue`). The model fills it by writing onto the inputs —
  the same thing a person would type — so nothing about how the form saves changes.

## Verify

```
node toolbars.mjs        # 24 checks; menu is the hardest rail in the app
node responsive.mjs      # the add-ons dialog at 5 widths
pnpm --filter @dineflow/web test    # lib/options.test.ts — 7 tests on the option maths; lib/menuImport.test.ts — 14 on the photo import
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
  outline buttons wrapping into uneven rows. `[data-recipes]` and `[data-find-photos]` are kept on their tiles. **Four
  tiles when the AI add-on is off** (the *From photo* tile is gated, 2026-11-09) — `toolbars.mjs` counts tiles, so
  check which property it ran on before changing the screen.
- **Short copy** (2026-10-23): subtitles and hints cut to a few words.
- **More tools fills its last row** (`.fill-tiles`, 2026-10-24): 2 + 2 + Find photos across the row on a phone, 3 + two
  halves from 640px, 5 in a row from 1024px. "Find photos" sat alone beside a hole. See design-system.md.
- **Categories, iPad and desktop (2026-10-24, the owner: "doesn't look good"; the phone is unchanged).** Each row
  (`[data-cat-row]`) has the category's icon (`catIcon`), its dish count, **Rename** (`[data-cat-rename]` → an inline field,
  Enter saves through `saveCategory` with the id, Escape cancels) and Delete. The add form (`[data-cat-add]`) is one joined
  field — a tag icon, the input, Add inside it — under "Add a category", with **Usual ones** chips (Starters, Main course,
  Breads, Rice & biryani, Desserts, Beverages — those not already there; one tap adds). An empty list says so.
- **No dishes yet** is `Empty`'s sm+ form (design-system.md).

- **Dish photo addresses are checked by host (2026-10-25 audit).** `setDishPhoto`: https, and the host Wikimedia
  (`upload`/`thumb.wikimedia.org`) or this project's own Supabase storage under `/storage/v1/object/public/menu/` — the old
  `includes(".../menu/")` let a photo come from any site with that text in its path, so every guest's browser would call that
  site from the storefront, the kiosk and the TV. The credit link must be `https://`.
- **List · Cards beside the categories (2026-10-25, the app's ViewSwitch, `[data-view-switch=menu]`).** Nothing chosen,
  the width decides as before (the list on a phone, cards from sm — `useViewPref(..., { wideAt: 640 })`); a tap shows the
  other at any width for this visit, the pin keeps it (`df-view:menu`). The list from sm is two, three, four across; cards
  on a phone are one across. On a phone the category chips take the whole row and the switch sits under them at the
  right (beside them only two chips fit); from sm they share one row.
- **GST and HSN per dish (2026-10-29, 0146).** The editor's row under Category (`[data-dish-tax]`): **GST** — "As the
  property (5%)" (null) or 0 · 5 · 12 · 18 · 28 · 40%; **HSN / SAC** — 4 to 8 digits, for packaged goods (blank = restaurant
  service, SAC 996331). `saveMenuItem` checks both and only writes them when the form sends them (an import or Scan leaves a
  dish's rate alone). The rate is copied onto each order line when it is ordered (billing-and-invoices.md).
- **Shorter copy (2026-10-29, the owner: "maximum 3 or 4 words, try 2 or 3 — clean and neat").** Subtitles, hints, helper
  lines and empty-state hints cut to two–four words, or removed where they said the obvious. Error and refusal messages,
  steps to follow outside the app, printed and exported text, WhatsApp bodies and tooltips were left as they were.
