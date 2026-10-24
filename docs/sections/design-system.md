# Design system — `globals.css` and `components/ui`

> Read this before **any** visual change, even a one-line one. These two files are shared by every
> screen in the app; a tweak here lands on fourteen pages at once, which is usually the point and
> occasionally the disaster.

**Files** `app/globals.css` · `components/ui/index.tsx` · `components/ui/flip.tsx` ·
`components/ui/{DataTable,Theme,Ticket,AiButton,PasswordInput,Rail,AnalogClock,Say,Service}.tsx` · `lib/say.ts` · `lib/service.ts`

## What it is

One language: a split-flap clock on a graphite wall. Dark by default (`data-theme="dark"`), with a
light "paper" theme that is a full re-skin, not an inversion, and since 2026-10-18 three more:
**Colourful dark** (`data-theme="colour"`, 0117) — bright hues on deep indigo — **Colourful light**
(`data-theme="paper"` + `data-palette="bright"`, 0118) — bright hues on a light page — and **Royal classic**
(`data-theme="paper"` + `data-palette="royal"`, 0119) — navy, burgundy and gold on ivory, no gradients. All five are
real and **all must be checked** — a colour that reads on graphite can vanish on paper, and a graphite hex left in a rule shows as a
grey patch on indigo.

`globals.css` is written in labelled blocks. Find yours before you add anything:

| Line | Block | Holds |
| --- | --- | --- |
| ~45 | tokens | `--color-*`, `--radius-*`, `--shadow-*`, `--dur-*`, easings |
| 127 | THE FLIP TILE | `.flip`, `.flap`, `.flip-row`, `.flip-label`, `.flip-stat` |
| 204 | THE DECK | `.deck`, `.wall`, the brand mark, the Assist panel |
| ~272 | cards | `.feather`, `.card`, `.feather.picked`, `.feather-lift`, `.spotlight` |
| ~300 | the glance row | `.stat-row`, `.stat-grid`, `.stat`, `.stat-head/-value/-foot` |
| ~353 | buttons & fields | `.btn-*`, `.chip`, inputs, `.segmented`, `.switch` |
| 454 | the receipt | printed-bill materials — warm paper, always light |
| 489 | THE MONTH GRID | `.cal-grid`, `.cal-cell`, `.cal-num`, `.cal-nav` |
| ~630 | STEPPER | `.stepper` > `.less` / `.n` / `.more` — the till's count control, on tiles and ticket lines |
| 527 | TOOLBARS | `.toolbar`, `.toolbar-group`, `.toolbar-end`, `.chip-rail`, `.icon-btn`, `.tap` |
| 602 | TABLES | `.dt-*` for `DataTable` |
| 662 | LOADERS | `.flip.loader`, `.nav-progress` |
| 703 | MOTION | keyframes, reduce-motion |

## Dark and Light, rich and classic (2026-10-20)

The owner: the dark and light colours "feel annoying — use rich and classic colours". The neon system hues are gone
from both; only tokens changed (and the few rules that had the old green written in):

- **Dark** (`@theme`): surfaces a touch deeper (#15161b / #1d1f26 / #282a33); text warm ivory #f3efe7, stone
  #a8a39a, #75716a; hues are jewel tones a step softer — emerald tint #3fbe7c, ruby #ef7266, sapphire #74a3ec,
  amber #e2a84f, amethyst #b597ee, teal #4fb6c4 (Cleaning's cyan was the loudest thing on the floor). On a card:
  label 14.3, label-2 6.6, label-3 3.4, each hue 5.3–7.8, each hue on its own wash 4.3–5.7.
- **Light** (`[data-theme="paper"]`): warm stone page #efece5, ivory cards #fffdf9, ink #1b1c22; deep emerald tint
  #17794a, ruby #b3302a, sapphire #2356b5, bronze-amber #97580a, amethyst #6c37b3, teal #0d6c7d — all 5.3–7.3 as text
  on a card (the old green was 3.1, which is why paper's pills measured ~2.8 in the table below). **`--color-on-tint`
  is white in paper now**: the main button is emerald with white letters, and the ticked checkbox's mark is drawn in
  `--color-on-tint` (it was a fixed near-black — invisible on royal's navy).
- **Glows follow the theme.** Selection, focus ring, field focus, `.btn-filled`'s shadow, `.btn-tinted`, the loader
  glow, the top progress bar and the wait bars were a fixed `rgb(76 217 100)` / `#4cd964` in every theme; they are
  `color-mix(… var(--color-tint) …)` / `var(--color-tint)` now, so a royal field focuses navy and a colourful one
  magenta. `.flip.live` / `.flip.alert` stay fixed colours (the plates are dark in every theme): #49c785 / #f0786c.
- Theme swatches and the phone bar colour (`Theme.tsx`) follow. The three colourful/royal palettes set their own
  tokens and are unchanged.

## Flap numbers (2026-10-20)

The owner picked six split-flap designs (first shown as loaders) and approved them for the numbers people watch all
day. **`components/ui/Flap.tsx`** builds all six on the app's own tile — `Flip` in `components/ui/flip.tsx`, which gained
`say` (what a screen reader hears), `tile` (the `--tile` height), `bare` (no pins), `fast` (quick turns while shuffling)
and `quiet` (not announced as it changes); there is no second tile. The pure parts are `lib/flap.ts` (5 tests).

| Component | What it does | Where |
| --- | --- | --- |
| `FlapShuffle value` | shuffles each digit 3 + i frames, then settles, left → right, when the value changes | Control room counters; every `StatTile` flap (so Front desk's arrivals / departures / in house / rooms ready); Kitchen column counts; Staff "on duty today"; Pantry's finished / running low / enough; Pulse's free tables; Cleaning's on-it / cleaned counts; My day attendance and messages |
| `FlapSpell text` | letters flick and land | Order board "#14 READY" call (and both board counts shuffle); Pulse "Seat now" table (T4); room numbers on Rooms |
| `FlapPercent value` | counts to the % in 8 steps, a bar filling under it | Control room "% full" (resort); each checklist card; My day checklist tile |
| `FlapClock since / at` | `since`: a ticking age, mm:ss then h:mm, amber at `hurry`, red at `late`; `at`: a fixed time on a 12-hour face | Kitchen ticket age (KOT hurry/late minutes); each Pulse party's wait; Reservations booking times; My day "In since" |
| `FlapMini value` | one or two pinless compact tiles (30px and up) | Till cart count and the dish-photo `.qty`; the More sheet's Help count; My day "n new" work badge |
| `FlapBreathe value` | a shuffle count whose tile glows outward from its own edge while `value > 0` (red with `tone="alert"`) | Pulse parties waiting; Online orders new; Order board preparing; Staff feedback new (owner); Cleaning waiting |

**Sizes (after the first browser pass, the same day).** At 17–26px the board's proportions squeezed a lone digit into
a narrow black capsule and the breathing rings were drawn over the digit. Now every small flap — `size="xs"` or given a
`tile` — wears `.flip.compact` and is never under **30px** (`MIN_TILE`, so digits are ~19px): cards .8em wide, digits 64% of
the tile at 600, a tile at least .8 of its height wide. The breathing glow is a ring outside the tile's border — the
tile's `::after` with a 5px `box-shadow`, swelling from 94% to full size while it fades (`flapGlow` moves only opacity and
transform since 2026-10-22; animating the `box-shadow` itself repainted the page every frame) — never over the digits,
with 6px of room kept round it. Sizes by place: kitchen column counts and both board
counts 40px (34 on a phone), KOT age 34, Pulse glance clamp(32–40px), a waiting party's clock 30, the dish-photo `.qty`
32, Pantry levels clamp(34–48px), Cleaning 34, checklist % 34, booking times 32. **Tab-bar and bell counts stay red
pills** — a flap cannot be read at 18px, and anything bigger would cover the icon.

**Rules.** The server and first paint show the settled value — a shuffle runs only on a change after mount, so no
hydration mismatch and no layout shift; a `since` clock is drawn after mount, with an invisible same-size placeholder
until then (the server cannot know the second). One shared 1-second ticker (`useNow`) serves every clock on a page;
a fixed `at` time never subscribes. A screen reader hears `say` — the settled value — never a shuffle frame, and a
ticking clock is `quiet`. Reduce-motion: values swap without flipping, the rings stand still. Tiles stay the dark plate
in every theme (royal's solid overrides for `.flip` / `.flap-*` still apply; `.flap-bar` and the rings are solid). **Money
is never a flap** — amounts stay figures. A value too long for its place falls back to plain text (Pulse's quoted wait
from 100 minutes, a room number over four characters). CSS: the FLAP NUMBERS block at the end of `globals.css`
(`.flip.fast`, `.flip.warn`, `.flip.bare`, `.flap-bar`, `.flap-ap`, `.flap-breathe`, `.qty.qty-flap`).
**Skipped on purpose:** the till's order-line item counts (text in a 60px rail card), kitchen station names (a filter,
not columns), Front desk's occupancy % (a caption under In house — the Control room carries it), Reports targets
(none exist).

## The colourful theme (2026-10-18)

The owner's "one more theme — colourful". **Built on dark, not on paper**: its text is light on dark surfaces, so
every rule written for the dark theme (fills of `rgb(255 255 255 / .07)`, light-on-dark pills, the Assist panel)
stays right without a single override. What it changes:

- **Tokens** (`[data-theme="colour"]` beside paper's at the top of `globals.css`): `--color-bg` #160f33, `-bg-2`
  #211650 (cards), `-bg-3` #2d2069, bezel #0c0624; label #fbf8ff / label-2 #c9bdf2 / label-3 #9387c9; **tint
  magenta #ff5ca8** (on-tint #2a0019); every hue a step brighter (green #2ee6a0, red #ff5d73, blue #5cb4ff, orange
  #ffb547, violet #c79bff, cyan #2fe1f5). The aliases (saffron, mint, chili, sky) are set explicitly — saffron is the
  magenta tint here, as it is the green tint in dark. Contrast on a card: label 15.6, label-2 9.4, label-3 4.9.
- **The COLOURFUL block at the end of the file**: the frame (`.deck`, `body:has(.deck-card)`) is three soft lights —
  violet, magenta, cyan — on indigo; the screen's card carries the same lights, quieter; the side menu
  (`aside.ink-panel`) is a solid violet-to-plum band (solid, because at tablet width it opens over the page); cards
  get a faint top sheen; **`.btn-filled` and `.svc-btn.go` are a magenta-to-orange gradient** with dark ink (6.4:1 on
  the magenta end); a figure's icon square with no state to show takes violet, cyan, magenta, orange in turn; the flip
  tiles are violet plates; focus ring and selection follow the tint.
- **Every surface rule skips `[data-theme="paper"] *`** — a guest page forces paper on its own box, and a staff
  phone on the colourful theme must not repaint a guest's booking page.
- **`system` never resolves to it** — Follow device is dark or paper; colourful is always a choice. The top-bar
  theme button is now a menu of four (`ThemeButton`, `data-theme-menu`, `data-theme-option`) and Settings shows four
  cards with a swatch each (`ThemePicker`, `data-theme-picker`). The phone's bar colour is #0c0624.
- Measured by `langtheme.mjs`: every section, both property kinds, 1440 / 834 / 412 — no sideways scroll, no text
  under 3:1. Check it when you add a rule with a raw colour: a graphite hex (#1c1d24, #0a0a0d…) is the usual culprit.

## Colourful light (2026-10-18, 0118)

The owner's "one more colourful theme, light-background based". **Worn as paper plus a palette** —
`<html data-theme="paper" data-palette="bright">` — so all of paper's ~75 light-surface rules apply untouched and
nothing is duplicated; `lookFor()` in `lib/themeLook.ts` (3 tests) maps a choice to the two attributes, and
`ThemeKeeper` holds both (React re-applies the server's `<html>` attributes when it rebuilds a page).

- **Tokens** (`html[data-palette="bright"]`, beside the others at the top of `globals.css` — more specific than
  paper's, so they win wherever both apply): page #f6f3ff, cards white, `-bg-3` #efe9fc; ink #1d1537, label-2 #5a5078,
  label-3 #8a80a8; **tint pink #db2777 with white on it (4.6)**; hues deepened for light ground — green #0e9f5e, red
  #e11d48, blue #2563eb, **orange #b45309** (#d97706 measured 2.9:1 on the lavender page), violet #7c3aed, cyan #0891b2.
- **The BRIGHT block at the end of the file**: the frame and the side menu are a jewel-toned band (violet #4c1d95 →
  plum #831843, warm glows) with the menu's white text unchanged; the screen's card is lavender with pink, cyan and
  sunshine lights; cards get a violet hairline; **`.btn-filled` / `.svc-btn.go` are pink → rose → burnt orange with
  white ink** (4.6 / 5.2); every figure tile has a 3px top edge and icon square in its own colour (violet, cyan, pink,
  orange in turn, or its state's); flip tiles are violet plates with white figures; fields, chips and table heads take
  a faint violet.
- **Trap met:** the chip rule outranked `.chip.on` (the chosen chip — label colour, white ink), leaving white text on
  near-white on eight screens; it is `.chip:not(.on)` now. Any rule here that repaints a control must leave its
  chosen/active state alone.
- Surface rules skip `div[data-theme] *` (not `[data-theme="paper"] *` as the dark colourful block does — here
  `<html>` itself is paper): a guest page's own paper box stays plain paper.
- The top-bar menu and Settings have five choices (Dark, Light, Colourful dark, Colourful light, Follow device); the
  menu's icon for this one is Sparkles; the phone's bar colour is #4c1d95.

## Royal classic (2026-10-18, 0119)

The owner's "rich royal colour base with classic feel … don't use multi-gradient … light background based". Worn
like Colourful light — `<html data-theme="paper" data-palette="royal">`, `lookFor()` maps it — so paper's rules apply.

- **Tokens** (`html[data-palette="royal"]`): page ivory #faf6ee, cards #fffdf8, `-bg-3` #f2ebdc; ink navy #1a2340,
  label-2 #4b5069, label-3 #847f70; **tint royal navy #1e3a8a with ivory on it (10.3)**; green emerald #15803d, red
  burgundy #9f1239, blue #1d4ed8, orange #a16207, violet royal purple #6b21a8, cyan #0e7490; **saffron is antique gold
  #9a7417** here.
- **The ROYAL block at the end of the file — every surface one solid colour**: the frame and side menu solid navy
  #14213d (a gold hairline where the menu meets the page, a gold marker on the current section); the screen's card
  ivory ringed in gold; cards with gold hairlines; **`.btn-filled` / `.svc-btn.go` solid navy, ivory ink, a gold inner
  line**; flip tiles solid navy plates with gold pins; a figure tile's solid top edge in navy, burgundy, emerald, gold
  in turn.
- **Classic type without a download**: `h1`–`h3` and `.large-title` in Georgia (then Iowan Old Style, Palatino, Book
  Antiqua, Noto Serif, Times — every platform has one; Tamil and Devanagari serifs follow), the PageHeader accent word
  in gold italic, `.eyebrow` in serif small caps. Numbers and flip tiles keep Oswald: their flaps are measured for it.
- **No gradient anywhere**: the block's last rules lay a solid colour over every gradient the app itself draws — the
  flip plates, the spotlight hover, `.hairline-gold`, the loading shimmer, the top progress bar, the wait bars, a dish
  with no photo, Tailwind `bg-gradient-to-*` (the control room's and Tomorrow's brief cards and their gold icon squares),
  arbitrary `bg-[linear-gradient…]` / `bg-[radial-gradient…]`, inline radial glows, the logo well's checkerboard; and
  the inline single-colour fades in Staff (a department's stripe and header) are tiled at 2 px so they read as one
  even colour without touching that screen's code. The printer-slot shadow on a ticket preview is a printed material
  and keeps its shading. `langtheme.mjs` checks every section: no surface blends two colours.
- The phone bar's chosen-section pill, written as the dark theme's green, takes each colourful theme's own tint.

## Words on screen: short and plain (2026-10-22)

The owner: "too much text — short and sweet, crisp, easy for all categories of people". Every string of 50+ characters
was rewritten (819 of them, in 143 files): a hint, subtitle, empty state or help line is **one plain sentence, aim ≤ 60
characters, never over 90**; a long explanation keeps only what a person must know — numbers, deadlines, money, legal and
tax rules, data-loss warnings, what a button does. Active voice, common words, no "please note"/"simply"/"in order to",
no repeating the heading. Measured: 173,977 → 144,033 characters of on-screen English; the long strings 77,274 → 33,912;
29 screens' visible text −21% (Neighbours −42%, Proof −40%, About −37%, Scan −35%). Left as they were on purpose: AI
prompts and schema descriptions, the bill-of-supply wording printed on receipts, the support page's grievance line,
messages to guests (WhatsApp), and data. **Write new copy the same way.** All 645 changed strings were re-translated
(Tamil, Hindi) and merged; coverage 100%. The old translations stay in the dictionaries (the engine also matches server
text the scan does not see), so don't prune them blindly.

**Second pass, same day** (the owner asked whether it was complete — it was not): staff lines still over 90 characters,
Assist's health-check causes and fixes, server messages, the guest pages (booking, ordering, queue, feedback, pay,
check-in, record, install), Master control and the emails — 190 more strings. Long text left by area: Master control
5,901 → 2,858 characters, guest pages 5,157 → 3,271, emails 706 → 467, Assist/API 16,225 → 13,627 (what remains is the
model's own prompts). Left over 90 on purpose: the tax guide's paragraphs (each holds three or four legal rules), the
legal pages, AI prompts, `.select()` column lists, and theme gradients. 41 more strings re-translated; coverage 100%.

## Motion that never stops runs on the compositor (2026-10-22)

The owner asked for "a lightweight feel". A trace of an idle screen on a phone profile (412, 4× slower CPU — `trace60.mjs`)
found the main thread restyling and repainting **~24 times a second with nobody touching anything**, on every screen: the
Assist mark's idle breathing (`am-breathe`, `am-halo`) animated shapes *inside* an SVG, and the browser cannot hand those
to the compositor. Every tap then waited behind that work. Rule, for anything that loops or ticks on its own:

- **Move only `opacity` and `transform`, and only on a box** — an element, a pseudo-element, or a whole outer `<svg>`.
  Never a `<path>`/`<circle>`/`<g>` inside an SVG, never `box-shadow`, `filter`, `background-position`, colour or size.
- Split an SVG into stacked SVGs when one part must move (the Assist mark at idle: glow box, tile, spark, hinge line —
  `components/assist/Mark.tsx`; the clock: face, second hand, cap — `AnalogClock.tsx`). A ring that pulses is a
  pseudo-element with a fixed `box-shadow` that scales and fades (`flapGlow` on `.flap-breathe`).
- A one-off (a flip, an entrance, a short "thinking" state) may stay as it is; it ends.

Measured after (`trace60.mjs`, idle 4 s, `IDLEAT=/orders`): style/paint passes **~97 → 4**, the same screen with every
animation switched off 0. `idle61.mjs` lists every running animation and repeating timer per screen; anything new marked
FOREVER must follow the rule above.

## The whole app in Tamil or Hindi (2026-10-18)

Two more choices beside English and the second-line languages: **தமிழ் — முழுவதும்** and **हिन्दी — पूरा ऐप**
(`df-lang` = `ta-all` / `hi-all`, `LANGS` in `lib/say.ts`, grouped *Words on the buttons* / *The whole app* in the
top-bar menu and in Settings). Every screen is written in English and **stays that way** — nothing in the sections
changed. Instead:

- **`components/ui/FullLanguage.tsx`** (root layout) walks the page and puts the language over every piece of
  English the dictionary knows — text nodes, and `placeholder` / `title` / `aria-label` / `alt` — then keeps a
  MutationObserver on the body, so whatever React draws next (a new screen, a toast, a live count) is translated
  before it paints. One observer for the whole visit; a navigation only asks whether the page is one that stays
  English. Switching back puts the exact English back (every change is recorded; `revert()`).
- **`lib/i18n/engine.ts`** decides what a piece becomes (8 tests): an exact match (whitespace collapsed); the same
  with a trailing `:`/`.` set aside; a **template** (`"{0} min ago"`, `"Room {0} · {1}"`) whose values are kept, or
  translated when they are known words, and may move where the grammar needs them; month and day names in a date.
  Names, dishes, rooms, zones, amounts are not in the dictionary and stay as written — that is right.
- **The dictionaries** are `public/i18n/{ta,hi}.<content-hash>.json` (~5,200 entries each), fetched only on a
  device set to a whole-app language; `LANG_BOOT` (`lib/i18n/scope.ts`) starts the fetch in `<head>` before the
  app's scripts, sets `<html lang>` and holds the page invisible (`data-lang-pending`) until the first pass, so the
  English never flashes — after 2.5 s it shows regardless. `sw.js` caches `/i18n/` for offline.
- **Left in English on purpose** (`ENGLISH_ONLY` in `scope.ts`, and `[translate=no]`): the guest-facing pages (a
  guest reads them on their own phone), the legal pages (the English is binding), Master control, the landing page,
  printed receipts, and the language menus themselves — each choice is shown in its own script so whoever picked the
  wrong one can read their way back. PDFs and the receipt printer stay English: their fonts have no Tamil or
  Devanagari letters.
- **Fonts and spacing** (`THE WHOLE APP IN TAMIL OR HINDI` at the end of `globals.css`): the app's fonts have no
  Tamil or Devanagari, so the stacks name the device's (Noto, Tamil Sangam / Kohinoor, Nirmala, Latha, Mangal) —
  nothing extra is downloaded. `letter-spacing` is forced to normal (it breaks the joined letters; the Devanagari
  headline bar fell apart) and headings get 1.32 line-height (vowel signs were clipped at 1.05).
- **Adding a screen or a string**: `node scripts/i18n-check.mjs` reports coverage (100% on 2026-10-18: 4,529
  strings + 617 templates); `--missing f.json` lists what is new; translate it by `docs/i18n-brief.md` (rules +
  glossary — the same words everywhere: மேசை, அறை, ஆர்டர், பில் / टेबल, कमरा, ऑर्डर, बिल); `--merge f.json` writes
  new hashed files and repoints `lib/i18n/files.ts`. Text the database sends (Tomorrow's labels, an RPC's message)
  is not in the code — walk the screen in Tamil (`langtheme.mjs` writes what is left in Latin letters per section)
  and add it the same way.

**Traps met building it — read before touching `FullLanguage`:**
- **Hydration (React #418).** On a full load React adopts the server's HTML piece by piece; a piece whose text has
  already changed under it is thrown away and drawn again. So text is changed only once React has adopted its
  element (it carries React's `__reactFiber$…` key); the rest waits in `later` and is picked up every 120 ms, for at
  most 8 s. The first run without this logged #418 on two sections.
- **A template is not a sentence.** `"{0} to {1}"` swallowed *"11 dishes have no recipe … in Menu to place them."*
  and came out half-translated. A template's values must look like values — no sentence punctuation, few words,
  fewer still when the template has little text of its own (`fits()` in the engine).
- **English endings glued on in code.** `arrival{n === 1 ? "" : "s"}` leaves a lone "s" text node after the
  translated word — blanked; `"{0} dish{1}"` — a value right after a letter is an ending and is dropped.
- **Headings drawn in two pieces.** `PageHeader` renders *title* + `<em>`*accent* ("Front" + "desk", "Neigh" +
  "bours"): a heading with an `<em>` is translated as one phrase into its first piece (`doWhole`).
- **A short template can match anything** — one with fewer than two letters of its own ("{0} · {1}") is never used.

## How it works

**Tokens, never raw colour.** `var(--color-tint)`, not `#4cd964`. The paper theme redefines every
token; a hard-coded hex survives the theme switch and looks wrong in one of them.

**Careful: some token names lie.** `--color-saffron` is aliased to `--color-tint` (green) in the
dark theme, and `--color-mint` is the same green. A "saffron" border is green. This cost us a whole
housekeeping board that showed amber *Clean* pills inside green frames. If you want amber, say
`var(--color-orange)`.

**Unlayered beats layered.** Rules in `globals.css` are written outside `@layer`, so they win
against Tailwind utilities. That is why `!important` appears in a few places, and why a plain class
like `.stat-grid { gap: 12px }` will beat a `gap-4` utility on the same element.

**Specificity inside the file is source order.** `.flip-stat .flip` and `.flip.sm` are both
`(0,2,0)`; the later one wins. If you add an override, put it after the rule it overrides and say
so in a comment.

**The split-flap rule.** `StatTile` renders short counts as flaps and longer values as a display
numeral:

```ts
const flappable = (v: string) => v.length <= 4 && /^[0-9]+([%/][0-9]*)?$/.test(v);
```

Four characters is two flaps plus a sign. `₹8,85,154.72` is twelve flaps and no card is that wide,
so money stays a figure. **Flaps count things, the numeral states amounts** — that is a rule, not an
accident. Both sit in the same vertical band so a mixed row lines up.

**No-hole rows.** Two patterns, pick by what you know:
- `.stat-row` — flex, `flex: 1 1 158px`. Use when the tile count is unknown; it never leaves a gap
  until the last line holds exactly one tile.
- `.stat-grid` + a count-aware track string (see `TRACKS` in `dashboard/Overview.tsx`). Use when you
  know the count; it is hole-free at every width.
- `.board-row` — flex, `flex: 1 1 300px`, for full panels that must share a top and a bottom.

**Touch.** Under `@media (pointer: coarse)` the kit grows: `.icon-btn` 36→44, `.btn` gets
`min-height: 44px`, `.stepper` buttons 40→44, `.tap`/`.tap-square` exist for anything the kit does
not cover. An inline text
link is exempt from the *width* rule (WCAG 2.5.5) but not from the height rule.

## Before you edit

- **Simple Service — the Dining screens' language (2026-10-15, the owner's "easy for every employee").** The
  SIMPLE SERVICE block at the end of `globals.css`, used by Orders, the till, Kitchen, Reservations, Pulse,
  Online orders, Menu, Pantry and Customers (Billing was put back to its own design at the owner's request):
  - **One colour = one meaning.** `.st-free` (dashed), `.st-new` ordered (blue), `.st-cook` cooking (amber),
    `.st-ready` food ready (green, ringed on the floor), `.st-eat` eating (neutral), `.st-bill` bill printed
    (violet — new tokens `--color-violet`/`-2`), `.st-late` (red), `.st-hold` reserved (amber, dashed), `.st-clean`
    paid and left, being cleaned (cyan, dashed — `--color-cyan`/`-2`, 0111; `--color-sky` is Ordered's blue). Each sets
    `--st` (hue), `--st-2` (wash), `--st-ink` (the hue as text — darkened toward the ink in paper, where a hue on
    its own wash measured ~3:1) and `--st-on` (text on a solid `--st`). `--color-orange-2` is new too. Where a
    table stands is `orderState()` / `isLate()` in `lib/service.ts` (3 tests): a printed unpaid bill, then food
    at the pass, then the fire, then a new ticket; LATE is a dish still waiting or cooking past
    `kds_target_minutes`.
  - **Pieces:** `.svc-btn` (56px; `.xl` 64, `.sm` 44; `.go` green, `.quiet`, `.ink`, `.st` in the state's hue,
    `.no` red) · `.svc-chip` (state chip with a count `<b>`) · `.svc-head` (the screen's icon square, title,
    one sentence — `SvcHead` in `components/ui/Service.tsx`, which also has `StateChip` and `SVC_ICON`) ·
    `.svc-table` (a floor table) · `.svc-steps`/`.svc-step` (1 · 2 · 3) · `.svc-cat` (a category tab — picture and word, 48px) ·
    `.svc-dish` (a picture card: `.pic` 16:10, `.qty` badge, `.flag`) · `.svc-add` · `.kt*`/`.kcol*` (the
    kitchen's paper ticket — it overrides `--color-steel`, `--color-label`, `--color-chili`… inside itself, because
    the paper is light in both themes and a graphite grey on it measured 2.7:1).
  - **Words in English with Tamil or Hindi under them** (`lib/say.ts` `WORDS`, 4 tests; `components/ui/Say.tsx`) — the
    Dining screens, since 0109 the main buttons and tabs of Expenses, Checklists, Payroll, Outlets and Staff, and since
    0111 / 0113 the Cleaning and Work boards. A
    second line ellipsizes rather than overflow, so pick the short floor word ("ஆள் சேர்", not "பணியாளர் சேர்", for *Add
    staff* in a half-width button at 412) and check it with `limits.mjs`, which measures every second line.
    The device's choice is the `df-lang` cookie (like `df-theme`), read by the app layout into `SayProvider`;
    `<Say w="take_order" />` renders English with a `.say-alt` line under it; `LangButton` in the top bar and
    `LangPicker` in Settings → Appearance set it. Only the Dining screens' button words are translated — the
    translations are short floor words and should be read by someone on the floor. `catIcon(name)` guesses a
    category's picture from its name for the till and the Menu chips (`CatIcon` resolves it on the client).
  - **Three traps met building it.** `.svc-steps` sets `display` unlayered, so a plain `lg:hidden` loses — write
    `lg:!hidden`. `:where(button) { min-height: 40px }` is unlayered too: a `min-h-12` on a button comes out 40px;
    write `!min-h-12` (a `.svc-*` class wins on its own). And `cn` from `components/ui` is a client export — a
    server component that calls it crashes ("Attempted to call cn() from the server"); use `clsx` there.
  - **A big button's label never wraps** (`.svc-btn > span`, the English line of `.say`); give the row room
    instead, or let the second-language line ellipsize.

- **Things arrive quickly, and nothing animates a blur** (`enter` in `lib/motion.ts`, 2026-10-13). A screen
  (`pageV`, `app/(app)/template.tsx`) slides in over 160 ms — opacity and 12px, no scale; a tile or section
  (`Reveal`, so every `StatTile`) rises 8px over 160 ms with its caller's stagger capped at 80 ms; list items
  (`itemV`) are 12 ms apart (35 before — a floor of 28 tables took a second to appear); a kitchen ticket keeps
  its spring but not its blur. The old page spring kept a ready screen semi-transparent for ~330 ms after its
  data had arrived, on every tap; and an animated `filter: blur()` repaints the whole blurred layer every
  frame, the most expensive thing to ask of a budget phone. Sheets, flip tiles and press feedback are
  unchanged. `motioncheck.mjs`: every screen reached by a tap ends at opacity 1 with no transform and nothing
  left faded or blurred — both property kinds, both themes, five widths.
- **`Field` ties its label to its control** (`useId` + `htmlFor`, given to a plain input, select or textarea
  child): 48 of 50 inputs on the till, billing and front desk had no accessible name. **Toasts** sit in a
  `role="status" aria-live="polite"` region, so a screen reader announces them.
- **A write that must change a row** goes through `wrote(result, "what to say when nothing changed")` with
  `.select("id")` on the write (`lib/wrote.ts`): a refused write changes no row and returns no error.
- **`Switch` without `label` returns the bare `button role="switch"`** and takes `name` for its
  `aria-label`. Use it inside a row that is a `<label>` (Storefront, Loyalty): the row does the
  tapping. With `label`, it still wraps itself in a label as before.

- **A field inside a grey panel takes the card colour.** Any element with `bg-[var(--color-fill)]`
  gives its inputs/selects/textareas `--color-bg-2` (white in paper) and a hairline — they used to be
  the panel's own grey and disappeared (Settings → Razorpay, Add a table).

- **A field inside a grey panel takes the card colour.** Any element with `bg-[var(--color-fill)]`
  gives its inputs/selects/textareas `--color-bg-2` (white in paper) and a hairline — they used to be
  the panel's own grey and disappeared (Settings → Razorpay, Add a table).

- **Every `<select>` (58) is styled in the DROPDOWNS block of globals.css, nowhere else.** Closed:
  the field surface with a chevron in a 26px round chip (a background SVG, a darker one in paper).
  Open: under `@supports (appearance: base-select)` (Chrome/Edge 135+) the list is a styled
  `::picker(select)` card — 16px radius, shadow, 40/44px option rows, hover wash, `::checkmark` tick —
  springing open via `@starting-style`. **The list is at least as wide as its field**
  (`min-width: anchor-size(width)`, 2026-10-13) — it was as wide as its longest option. Probe:
  `dropdown.mjs` (open, read, pick, both themes) and `dropdown-dialog.mjs` (inside a Sheet).
- **On a tablet the list is ours, the field's width** (`components/ui/TouchSelect.tsx`, mounted in the
  app and Master control layouts, 2026-10-13). The iPad's native menu is as wide as its longest
  option and floats over the middle of the field — New room → Type was a 370px menu on a 780px
  field — and a page cannot size it.
  - **When it takes over:** the browser cannot style the list (`CSS.supports("appearance:
    base-select")` is false — every iPad browser is WebKit), the pointer is coarse and the screen is
    640px or wider. A *tap* on a select is then caught on `touchend` (capture, `preventDefault`: no
    click, no focus, no native menu, no keyboard). A drag of more than 10px is left alone.
  - **What opens:** a `role="listbox"` (`[data-touch-select]`, `.touch-select` in the DROPDOWNS
    block) in a portal, exactly the field's width, 6px under it — or above it when there is more
    room there — up to 340px tall. It has 44px rows, the chosen one tinted and ticked, and group
    labels. The field wears `select[data-open]`, the open ring.
  - **A pick:** the select's value is set through the native setter and `input` and `change` are
    fired, so a React onChange (Tax's *What is it* drives the form) and a form's FormData both see
    it.
  - **Closing:** a tap outside closes the list only (a backdrop at z-70, above a Sheet's z-50).
    Escape is stopped before the dialog's own handler. A scroll elsewhere or a resize also closes it.
  - **Who keeps the native control:** phones (the wheel), mice, keyboards, `multiple`/`size`
    selects, and any select with `data-native`.
  - **Testing it:** Chrome supports base-select, so `fivefix.mjs` hides it from JS with
    `Page.addScriptToEvaluateOnNewDocument` (`CSS.supports` answers false) and taps with
    `Input.dispatchTouchEvent`. That proves the list, the pick and the close. That the iPad's own
    menu stays shut is the `touchend` rule, which only a real iPad can show.
- **Never use the `background:` shorthand on an input/select/textarea rule.** It resets
  `background-image` and `background-repeat`: the hover and focus rules erased the chevron in dark
  and, re-applied by the paper rule, tiled it across the whole box in paper. `background-color` only.
- **The custom `Select` component** matches: 48px, 14px radius, the green focus ring (it was amber),
  the chevron in the same round chip.

- **`.switch` sets its own `min-height: 31px; min-width: 51px`.** It is a `<button>`, so the control
  floor (40px, 44 on touch) stretched it to 51×44 with the 27px knob riding the top edge. The
  finger-sized target is an invisible `::before` (inset -7px -4px → 59×45). Probe: `swprobe.mjs`.

- **Grid children may shrink: `@layer base { :where(.grid) > * { min-width: 0 } }`.** Without it a
  single-column grid on a phone (a bare `grid`, or `lg:grid-cols-…` below lg) sized its one
  implicit track to the widest child's *content* — a scrolling chip rail, a row of buttons — and
  the page column came out 434px on a 390px phone, cut off on the right (Scan, Storefront, Orders,
  Dashboard at 375). It is in the base layer so a `min-w-*` utility on a child still wins.
- **`hidden` loses to unlayered element styling.** The app styles `input[type=checkbox]` unlayered,
  so `className="hidden"` on a checkbox showed it anyway (Storefront had a second tick beside every
  switch). Use the `hidden` attribute plus `style={{ display: "none" }}`.
- **There is no `.btn-primary`.** The kit has `.btn-filled`; a `Link` given `btn btn-primary`
  renders as plain text.
- **Text links get height, not width**: `.card-title a`, `.legal-links a` and `.tap` are 40/44px
  tall with a negative margin so the line does not move. A text link is exempt from the width rule.
- **A `.card-title` with a `.footnote` child stacks on a phone** (under 640px: column, 4px gap). Beside
  the title the note ran down the right in a narrow column and broke the title over two lines (Tax →
  Returns, "Outward supplies"). It applies everywhere the pair is used; from `sm` they share a row.
- **A track that scrolls sideways gets a `Rail`** (`components/ui/Rail.tsx`, imported directly, not
  from the index). It renders the track (`className`: its flex, gap, padding, mask) inside a
  `relative` wrapper (`wrapClassName`) and, **only while something is hidden past the edge**
  (`scrollWidth > clientWidth`, re-measured on scroll, resize and child changes), a `.rail-arrow` on
  the right: a 34px see-through disc (`--color-bg-2` at 66%, blurred, opacity .8, 1 at hover) in a
  40px button, 44 on touch. A tap scrolls ¾ of the track — or straight to the end when less than
  160px would be left after it, so one tap never stops with the last item half under the arrow
  (2026-10-13). At the end it turns round (`data-end`,
  "Back to the start") and a tap goes back to 0. The arrow lives in the wrapper, not the track, so
  the track's fade mask never fades it; it is centred with `top/bottom: 0; margin: auto`, not a
  translate, because buttons scale on `:active`. A track with `pb-*` passes `arrowClassName="!bottom-2"`
  so the arrow centres on the items. While it overflows the track carries `data-rail-more`, whose
  `::after` is a 36px spacer so the last item scrolls clear of the arrow. With `label` the track is
  `role="group"` with that `aria-label` — probes find a rail by it. Used on Rooms (state chips) and
  the till (Order line, Categories, Goes well with). Probe: `rails.mjs`.
- **Copy and share go through `lib/clipboard.ts`, never `navigator.clipboard` / `navigator.share`
  directly.** `copyText(text)` tries the clipboard, falls back to a hidden textarea + `execCommand`,
  never throws and returns whether it worked; `shareText(data)` returns "shared", "cancelled" (the
  person closed the sheet — not an error) or "unavailable" (no share here: copy instead). Seventeen
  call sites wrote the clipboard bare; a refused write was an uncaught error while the button still
  said "Copied", and closing the iPad share sheet threw (Tomorrow's brief, an invoice's Share).
- **A visually hidden file input needs `sr-only !w-px !h-px !min-w-0 !p-0 !border-0`**: the
  unlayered `input` width beats `sr-only`, and the invisible input stuck out of its dialog (Menu →
  From photo, Inventory → Record purchase), the same thing the logo upload hit.
- **`AnalogClock`** is a 100×100 SVG: a ring (`--color-label`) round a face (`--color-bg-2`), 48 minute
  dots (`--color-label-3`), 12 hour bars (12/3/6/9 longer and thicker), rounded hour and minute hands
  in the ink colour, a red second hand (`--color-red`) with a disc near its tip and a red cap. So the
  face is white with a black ring in paper, graphite with a light ring in dark. Hands rotate about
  `50px 50px` in the view box (`transform-box: view-box`); only the second hand has a transition — a
  small overshoot tick, dropped for the one update a day when its angle resets. **Since 2026-10-22 it is three layers in a
  `span.analog-clock`**: the face and the hour and minute hands (the 60 marks are `FACE`, drawn once, not every second),
  the second hand as its own SVG turned as a box about its centre (so the tick is a compositor transition), and the cap on
  top. A transition on a shape *inside* an SVG ran on the main thread for a fifth of every second. Size it with classes
  on the component (`h-16 w-16 md:h-[76px] md:w-[76px]` on the dashboard).
- **`Ticket` (the KOT paper) has a `top`**: `"tear"` (the torn edge, the default — the kitchen board
  uses only this) or `"slot"` (it comes out of a printer slot: no torn edge, the machine's shadow
  across its top, and one mounted after first paint feeds down 44px from behind the machine). The
  machine is `components/receipt/PrinterHead.tsx` — the bill printer's body, vent, LED, slot and
  teeth (`.printer-*` in globals.css, shared with `PrinterOutput`), one slot inset `mx-3.5`. It is
  dark green in both themes, like the bill's.

- **`Sheet` (every dialog) lives in the *visible* viewport, not the layout viewport.** Its frame
  takes `top`/`height` from `window.visualViewport` on resize and scroll, so with an iPad keyboard
  up the dialog shrinks to the space above it instead of losing its title off the top and Save off
  the bottom. The dialog is `max-h-full` of that frame, the header is `shrink-0`, and only
  `.sheet-body` scrolls. The scrim is `fixed` and reaches half a screen past each edge, so a page
  Safari has shifted never shows through undimmed. While open, `html` and `body` are both
  `overflow: hidden`, and both are put back on close. Probe: `dlg.mjs` (8 sizes, including
  1194×420 and 834×560 for the keyboard) and `dialog-audit.mjs` (35 dialogs, 0 with two scrollbars).
- **On a touch screen nothing in a `Sheet` takes focus by itself** (2026-10-13). A field's `autoFocus`
  raised the keyboard as the dialog opened, and the frame then shrank to the strip above it — on an
  iPad with a keyboard case, above a shortcuts bar Safari reports as ~200px taller than it is:
  "Edit ingredient" opened 344px tall in a 588px window, its first label and last field cut off and
  empty screen under it. `Sheet` now blurs a focused field inside it in a layout effect when the
  pointer is coarse — after the fields' own `autoFocus`, still inside the tap — so the dialog opens
  at its own height (up to the screen less 48px, centred; a bottom sheet on a phone) and the keyboard
  comes when a field is tapped. A mouse keeps the cursor in the first field. Keep `autoFocus` on the
  first field of a form: the laptop wants it, and the touch screen no longer pays for it. Probe:
  `dlg2.mjs` (15 — Edit ingredient, New dish, Record purchase at 1000×588, 1194×834, 834×1112,
  412×915 and 1440×900).

- **A utility cannot recolour a kit card.** `.feather`/`.card` set `background` and `box-shadow`
  unlayered, so `bg-[…]` and `ring-…` on the same element silently lose — the till's "selected"
  green ring never rendered for that reason. Add a state class next to the kit rule instead
  (`.feather.picked`, `.feather.filled`) or use an `!important` utility, which does win.

- **Check all five themes.** Set the `df-theme` cookie to `paper`, then `colour`, `bright` and `royal`, and look. Half the colour bugs
  in this app's history only existed in one theme.
- **A grid track must be `minmax(0,1fr)`, not `1fr`.** A grid item defaults to `min-width:auto` and
  refuses to shrink below its content — this pushed the till rail off a phone and overflowed the
  calendar by 258px. Pair it with `min-w-0` on the item.
- **A flex item's `inline-flex` is blockified to `flex`.** Do not detect a button's shape by its
  computed `display`.
- **`mask-image` on a scroller is fine, but scope it.** `.toolbar-group` fades its clip edge only
  when it holds no `input`/`select` and is not `.toolbar-end` — otherwise it fades the right edge of
  a field or of the primary button.
- **A `StatTile` row with no flap tile is `.stat-flat`.** The figure's `--stat-band` min-height
  exists to line a money figure up beside a split-flap tile; on a row of nothing but figures it
  floats the number in 107px of space (Reports at 834). `.stat-flat` on the row sets the band to 0.
- **A slider is `input[type="range"].range`.** The base range is the 6px track with a 28px knob;
  `.range` makes it 44px tall, fills the track in the tint to `--pct` (the screen sets it from
  min/max/value) and turns off the input hover wash and focus ring that would otherwise paint the
  box. The Notifier's volume slider still uses the bare base control.
- **A checkbox is the global 24px box and a radio the global 22px ring — never sized on the element.**
  Both are `appearance: none` and drawn in `globals.css` (`input[type="checkbox"]`,
  `input[type="radio"]`, the mark as `::after`). A utility on the element breaks them: `!w-auto`
  collapsed the Tomorrow buy list's box to 8px wide — a green capsule on a phone — and `w-4 h-4
  accent-saffron` made a 16px native box elsewhere. Three recipes were in use across 24 inputs
  (2026-10-12); all stripped. Probe `cb.mjs` (20 controls on 12 pages × 2 widths).
- **`.toolbar-end` never shrinks, so count its buttons.** It is `flex: 0 0 auto` above 720px; four
  or more actions are wider than the content column at 834 and the primary ran off the page on Menu.
  A `.toolbar:has(> .toolbar-end > .btn:nth-child(4))` rule stacks such a toolbar from 721 to
  1183px and from 1280 to 1363px (the full sidebar takes 256px of the column there) and wraps its
  actions into full rows. Two- and three-button toolbars are untouched.
- **Never add a chart library.** The gauge and the week curve on the dashboard are hand-drawn SVG
  paths on purpose: the control room is the most-opened screen in the app and should not ship a
  plotting engine to draw five arcs.
- **`.flip`'s `--tile` is a height.** The width follows from the character count, so a three-card
  tile (`6/12`) is half again as wide as a two-card one. That overran a 412px phone by 9px until the
  `@media (max-width: 480px)` rules started sizing the row for its widest tile.
- **The housing hugs its cards; it does not host them.** Letting a captionless tile stretch to the
  card put 86px of flaps in a 226px plate — 38% covered — and looked like an empty tray. That is
  exactly the "bare face" the `.6` min-width floor on `.flip` exists to prevent; the comment there
  says so. Do not try it again.
- **A board tile is not a card tile.** `.flip`'s housing starts at `#1c1d24`, which *is*
  `--color-bg-2`, so on a card its top edge is invisible and the 3px near-black border reads as a
  hole punched in the card. `.flip-stat` overrides the housing, the flap halves and the pins for
  card use. On the graphite wall the original is right — leave it alone there.
- **Container query variants work on the Tailwind we have (4.3).** `@[26rem]:flex-row` and
  `@max-[15rem]:` are generated and fire at the right width. `otacards.mjs` measured a strip
  section's `flex-direction` turn from column to row exactly at a 416px card (2026-10-13), and
  Housekeeping's `@[15rem]:` works the same way. An earlier note here said they were not generated;
  that was an older v4. The plain `@container (min-width: …)` block in this file still works too. The
  `@container` *utility* applies `container-type: inline-size`. Keep the units in **rem**: px and rem
  thresholds are not sorted against each other (see `min-[100rem]` on Orders).
- **A card's actions along its foot are `CardStrip`** (`components/ui/index.tsx`, 2026-10-13). It
  draws a hairline across, a tinted band, and one equal section per action split by hairlines, edge
  to edge — the Menu card's footer, which the owner pointed at. `actions: StripAction[]` takes
  `{ key, label, icon, tone?, onClick?, href?, external?, disabled?, aria? }`, up to four. A section
  is a `<button>`, or an `<a>` when it has `href`; `external` opens a new tab. Tones:
  - `go`: the main move, on a soft green. It is
    `linear-gradient(green-2) over --color-bg-2`, so it stays green on a red overdue card; plain
    `--color-green-2` over the red wash came out olive.
  - `red`: removes.
  - `quiet`: the default.

  `data-*` props pass through to the strip (`data-actions`, `data-doc-actions`), and each section
  carries `data-act={key}`. The strip is its own `@container`: while a section would be under ~104px
  (26rem for four, 19.5rem for three, 13rem for two, 6.5rem for one) its icon sits over its word, 56px
  tall; wider, icon beside word, 44px. The icons are 15px. To use it, make it the card's last child
  on a card with no padding of its own: `!p-0 overflow-hidden flex flex-col`, with the content in a
  padded `flex-1` div. Then the strip sits on the bottom edge however tall the grid row makes the
  card. Used by Channels (OTA cards) and Tax (filing and document cards). Housekeeping keeps its own
  copy (`FOOT`, 40px on an iPad at the owner's request); the Menu card's footer is a band of its own (a row of controls, not equal sections).
- **A container query measures the content box.** A 268px card with `p-5` is a 228px container, so
  a `15rem` (240px) threshold never fires on it. Subtract the padding when you pick the number —
  and check the widest row too: a four-across card at 1920 is 271px, one pixel under 17rem.
- **A background and its foreground must travel together.** `.feather` sets `background` in an
  unlayered rule, so a Tailwind `bg-*` utility on the element loses to it — but the matching
  `text-*` wins, because `.feather` does not set `color`. Writing `bg-ink text-on-label` on a card
  therefore applied *only the text half*: `#0a0a0d` on the `#1c1d24` card, **contrast 1.22** where
  WCAG wants 4.5, on every occupied table on the floor plan. Use `.feather.filled` (or
  `.keycard.occupied`), which declare the pair together in this file.
- **A muted colour on an inverting card must derive from `--color-on-label`,** not be a fixed
  value. Both of those classes flip surface *and* text between themes, so a hard-coded
  `rgb(10 10 13 / .62)` secondary line is right in one theme and invisible in the other. Use
  `color-mix(in srgb, var(--color-on-label) 64%, transparent)` and read it as `--card-muted`.

### Measuring colour — two ways a probe will lie to you

Both of these invented failures that did not exist, and cost real time chasing them:

- **`getComputedStyle().color` is not always `rgb()`.** Tailwind's `/alpha` utilities compute to
  `oklab(…)`, and `color-mix()` computes to `color(srgb r g b / a)` — whose components are **0–1,
  not 0–255**. Parsing those as channels turns white-at-64% into near-black. Convert through a
  throwaway element, and scale by 255 when the string starts with `color(`.
- **Start the surface walk at the element, not its parent.** A leaf that paints its own background
  (the nav avatar, a pill) *is* the surface under its own text. Walking up first reports the dark
  gutter behind it and fails a perfectly legible chip.

`audit-contrast.mjs` in the scratchpad does both correctly: it walks every text node in `main`,
composites translucent colours onto the real surface, and applies WCAG's 3.0/4.5 split by size and
weight. Worth rebuilding when you touch colour.

### Known contrast failures, measured 2026-10-08 — not yet fixed

Audited `/orders`, `/rooms`, `/housekeeping` (247 text nodes). None of these are in the card
surfaces; they are the status colours, and they want a decision about the palette rather than a
patch.

| Where | Theme | Measured | Needs |
| --- | --- | --- | --- |
| **The master-mode banner** — "Master mode", the property name, the note | paper | **1.11 – 1.50** | 4.5 |
| Status pills: "Clean" amber on cream, "ready" green on green-tint | paper | 2.74 – 2.97 | 4.5 |
| Count chips (`num opacity-70`) — amber, green, blue, red on their tints | paper | 2.34 – 3.64 | 4.5 |
| The red notification badge — white on `--color-red` at 10px | both | 3.41 | 4.5 |
| "Out of order" pill, red on red-tint | dark | 3.98 | 4.5 |

The banner is the serious one: in the paper theme its text is **effectively invisible** (1.11), and
it sits on every page while a master is acting as a property. The pills and chips are a systematic
issue — a tinted-background pill using its own hue as the text colour is about 3:1 in the paper
theme across the board, so fixing one means fixing the recipe.
- **The stat card is stacked: label, number, caption.** It was laid sideways for one commit —
  number left, words right — which suited an 86px flap tile and punished a figure:
  `₹8,85,154.72` came out at 23px beside a three-line caption. A figure is the headline and takes
  the full line (`.stat-fig`: 34px from 14rem of content, 38px from 16rem, else `--fig-narrow`
  from its own length so nothing overflows a 144px phone card). The caption stands beside the
  number when it fits and drops under it when it does not. The tone is a status light at the end
  of the label row — a 20px tinted halo around an 8px dot, pulsing when it is an alert — and only
  when there is a tone. (It was an absolute `.stat-pip`; `.pulse-dot`'s `position: relative`,
  declared later, beat it and dropped the alert dot into the flow over the label.)
- **One band for flaps and figures.** `.stat-body { --stat-band }` is the flap tile's height *and*
  the figure's `min-height`, so a counted number and a priced one share a baseline on one row. It
  is the same `cqw` clamp as `.flip-stat .flip { --tile }` — keep the two identical, or point the
  tile at the variable. A container query cannot match the container itself, which is why the
  variable sits on the body inside the card.
- **Stat rows go four-across from `min-[900px]`, not `lg`.** At `md` (768) a 12-character figure
  overflowed a 105px content box by 14px; 900 is the first width where four-up genuinely fits.

## Verify

```
node toolbars.mjs        # 24 checks — chip rails at 4 widths, nothing clipped, no spill
node design-test.mjs     # 21 checks — the till, the invoice pane, the phone sheet
node dialog-audit.mjs    # 35 dialogs, 0 with two scrollbars
pnpm lint && pnpm typecheck && pnpm build
```

Then look at it, in both themes, at 1440 and 412.

## See also

[testing-and-gates.md](testing-and-gates.md) · [shell-and-nav.md](shell-and-nav.md) ·
[dashboard.md](dashboard.md)

- **`.ci-form`** (end of `globals.css`) — the online check-in form's field border, 16% ink, tint on
  focus. Scoped to that page; see [guest-facing.md](guest-facing.md).

- **`PageHeader actionsInline`** keeps one small action on the title's row on a phone too (Settings'
  Sign out). Without it `.page-actions` is full width under the title below 640px, for rows of
  buttons — leave the default for those.

- **Nothing that arrives with the page is invisible in its HTML (`components/FirstPaint.tsx`, root
  layout).** ~58 `motion` elements (every `StatTile` via `Reveal`, page sections, the top bar) start at
  `initial={{ opacity: 0 }}`, which framer-motion server-renders as `style="opacity:0"` — the page was
  blank until the animation library had loaded, ~1.5 s on a first phone visit. `FirstPaint` provides a
  `PresenceContext` with `initial: false` for the first render only, so those elements render in their
  `animate` state; after mount it switches to the same context without `initial`, so screens opened by
  navigation, sheets and toasts still animate. **The context must stay an object** — swapping it for
  `null` makes framer-motion take a different hook path and React throws #311 on every page.
  Corollary: anything that appears after mount now shows as layout shift (it used to be hidden in the
  fade) — render it at full size from the start (the Notifications card renders with default prefs,
  then loads the device's own).

- **A dialog is as tall as what is in it** (2026-10-20). `Sheet`'s `.sheet-body` is `flex-auto min-h-0` (it was
  `flex-1`): its content's height is the starting size, so the dialog hugs short content in every engine and, only when
  the content is taller than the screen, stops at the frame's edge (`max-h-full` of the visual-viewport frame, less
  `sm:p-6`) and scrolls inside. A 0% basis in a column with no set height left that to the engine. Nothing else about the
  frame, the keyboard handling or the phone bottom sheet changed. If a dialog fills the screen, the fix is usually its
  content (Menu's Photo dialog: a full-width 4:3 photo — see menu.md).

- **Entrances are CSS, not motion components (2026-10-20).** `Reveal` (so every `StatTile`) renders a plain `div.df-rise`
  with `--d` for its stagger, the screen template a `div.df-page`, and `Segmented`'s chosen thumb a `span.df-thumb`
  that fades in place (no `LayoutGroup` / `layoutId`). Same distances and timing as `lib/motion.ts` `enter`; reduced
  motion turns them off. Sheets, toasts, flap tiles and the kitchen's tickets keep framer-motion. Probe:
  `motioncheck.mjs` (every screen ends at opacity 1 with no transform).
  - **`df-page` and `df-rise` fill `backwards`, never `both` (2026-10-21).** With `both` the finished animation kept
    applying its end state, and in Chrome that makes the page wrapper a stacking context. Every `Sheet` is rendered
    inside it, so its z-50 counted only inside the page and the app's top bar and phone tab bar were drawn over every
    dialog: its foot cut off under the tab bar, its top under the bar (the owner's screenshot, the labourer dialog). The
    end state is the element's own, so `backwards` loses nothing. shots38 puts `both` back on `.df-page` and shows the
    dialog's foot covered, then the fix. **Do not give anything that wraps a page an animation with a forwards fill.**
- **Every dialog's footer stays in view (2026-10-21, the owner: "fixed header and footer for all dialogs").** The header
  was already outside the scrolling body. `Sheet` now finds the footer itself (`markSheetFoot` in
  `components/ui/index.tsx`): from `.sheet-body`'s last element down through last children, the first that is a
  button / link-button or a row made only of them, inside a box at least half the content's height. It is marked
  `data-sheet-foot` (again whenever the content changes, a `MutationObserver`), and `globals.css` makes it sticky at the
  foot. **The bar, second version (2026-10-22, the owner: "the dialog footer is not good looking"):** a `::before` behind
  the row (the row itself, one button or several, is not restyled) — frosted `--color-bg-2` at 86% with a 16px blur, a
  hairline and a soft shadow on top, 14px above the row, out to both edges (`--sheet-sx`, the body's side padding) and
  down to the dialog's foot (`--sheet-foot-b`); a 22px margin above the row keeps the bar 8px clear of the last field
  at rest. **`bottom: 0`, not the padding**: a sticky inset is measured inside the scroller's padding, so the first
  version's `bottom: 20px` on top of the body's 20px bottom padding lifted the row 20px into the content at rest (Dishes
  online with one dish: its price cut in half under the bar) and left 40px under it when scrolled — now 20px. The first
  version's box-shadow band also reached 10px above a row that some dialogs put only 4px below their content. Probe
  `dialog57.mjs` (28: seven dialogs × 1440/412 × dark/paper — clear at rest, inside scrolled both ways, 20px under the
  row). **Drag down to close, without stealing the scroll (2026-10-22, the owner).** The whole dialog used to be framer's
  drag handle, so on a phone a swipe meant to scroll a list moved the dialog. Now `drag="y"` has `dragListener={false}`
  and starts only from the grabber (`[data-sheet-grab]`, `touch-none`) and the header (not its buttons); the body scrolls
  as a body; and when the body is already at its top, a downward, mostly vertical pull (touch events — the browser cancels
  pointer events once it pans — on a non-passive listener) moves a pull layer around the dialog (`pullY`) and closes past
  110px or a quick flick, else springs back. A touch inside an inner list that is scrolled, an upward swipe, or a sideways
  swipe (a chip rail) leave the scroll alone. The pull layer is as tall as the frame (the dialog's max height still
  measures against the screen) and `pointer-events: none`, so a click outside still reaches the scrim. Probe `drag58.mjs`
  (real `Input.dispatchTouchEvent` at 412). A dialog that ends with something else (a photo picker, a hint) keeps its buttons in the flow, so
  **end a dialog with its buttons** — the labourer dialog's QR moved above Save · Deactivate for this. shots38: 32
  dialogs (both property kinds, 412 and 1440) on top and whole, header kept at the end of the scroll, 30 with a footer
  that holds (the two without are Menu's photo dialogs).


- **`CardStrip` passes `onClick` to a link action too** (2026-10-21) — a WhatsApp *Send* on a purchase order is an `href`
  that also marks the draft sent.

## Lists that switch between cards and a grid, and how many across (2026-10-23)

`components/ui/ViewSwitch.tsx`: `useViewPref(key, valid)` keeps what is chosen now and this device's default
(`localStorage df-view:<key>`, read after mount); `ViewSwitch` is round segments in a soft track (the shown one raised) and,
with `onKeep`, a **pin** that makes the shown choice the default (filled when it is). A screen whose default is cards on a
phone and the grid from md decides that with CSS (`md:hidden` / `hidden md:block`) until a choice exists — the first paint is
right at every width. Used by Customers (cards/table), Pantry (cards/table, pin), Attendance and OTA channels (1 · 2 · 3
across, pin; three by default). Staff keeps its own switch (StaffClient). 40px with a mouse, 44 on touch.

- **A long choice in a select is cut before the arrow** (2026-10-23 — "Engineering & maintenance" ran under the chip). In the
  `appearance: base-select` mode the select is a flex box: its text does not shrink, ellipsis does not apply, and
  `overflow: hidden` clips only at the padding edge. `overflow: clip; overflow-clip-margin: content-box` clips at the content
  box, which ends where the 50px arrow room begins (tested in Chrome before it went in).
- **Back is an icon only** (2026-10-23) — shell-and-nav.md.
- **Short copy** (2026-10-23): the theme picker's hints cut to a few words (Theme.tsx).

- **A one-button dialog footer kept its colour** (2026-10-23, the owner: Done on *Sign-in details* was a pale, washed
  green). When `markSheetFoot` pins a single button (not a row), the button is the sticky element and so its own stacking
  context: the bar's `::before` (z -1) painted over its fill and under its words. `.sheet-body [data-sheet-foot]:is(button,
  a)::after` repaints the fill above the bar with `background: inherit` — variant, hover and theme follow by themselves.
- **`ChipRail`** (`components/ui/ChipRail.tsx`, 2026-10-23): a sideways chip row that fades at an edge it continues past
  and puts a round arrow there (36px, 44px on touch) — the Staff department rail's arrows as a shared piece. Brings the
  `aria-pressed` chip into view on `watch`; `wrapClassName="lg:flex-wrap"` lets a wide screen wrap instead. First used
  by Positions → Level (`[data-level-rail]`).
- **Short copy** (2026-10-23, the owner: "short and sweet, crisp, easy for everyone — the whole app"): page subtitles,
  hints and helper lines cut to a few words across the app; warnings, tax/legal rules and confirm text kept. New strings
  are in the dictionaries (one merge).
- **A fixed set of tiles never leaves a hole in its last row** (`.fill-tiles` in globals.css; 2026-10-24, the owner: "the
  bottom card must fill the empty space — just examples"). Two across on a phone with an odd last tile spanning the row;
  from 640px six tracks, two per tile, so a last row of two is halves and a last row of one spans it; from 1024px five
  across (`.fill-3` stops at three, for a grid in a narrow column). Used by Menu → More tools, Chain's totals, Work
  records' figures and the notification settings' devices (`[data-stations]`, Settings and My profile); Master
  control's figures do the same in `AdminToolbar.module.css`. **Only for fixed sets** — a list that grows with the data
  (rooms, tables, the expense categories) keeps even tiles and a short last row: a room card twice as wide reads as a
  different thing. `pw/gaps96.mjs <restaurant|resort>` signs in a demo, walks every screen the navigation links to at
  412 and 834 and lists every grid of cards whose last row leaves a hole; after this change it lists only those lists.

- **Empty states (2026-10-24, the owner: "these empty sections don't look good").** `components/ui/EmptyState.tsx` (its own
  file — `index.tsx`'s `Empty` stays for the screens not yet moved): a dashed panel washed in the section's hue
  (`hue` tint · blue · orange · violet · cyan · red, tokens only), the section's icon on a tile inside a slowly turning dotted
  ring (still under reduced motion), a bold line, one line on what fills it, and the action that fills it. `size="sm"` is
  the 76px row for a list inside a column. Used on Front desk (Arrivals, Upcoming, In house), the control room's On now,
  Rooms, Facilities and Payroll's month. Pass the Lucide component as `icon` from a client screen. design24.mjs: 146 checks.
- **`Empty` from sm up, and "phone untouched" (2026-10-24, the owner on an iPad: "these marked sections don't look good —
  ultra modern; desktop to iPad only, don't disturb the mobile version").** `index.tsx`'s `Empty` (36 screens) keeps its
  phone form exactly — the card, the ◌ tile, the title and hint. From `sm` the same card draws the section's icon on a tile
  inside a slowly turning dotted ring, a wash of the section's hue with a dot grid fading from the top, and a 23px title.
  `icon` is a **name** (`EmptyIcon`: dish, pantry, invoice, expense, labour, people, orders, qr, …) so a server page can pass
  it; left out, `emptyIconFor(title)` picks one from the title's words, and the hue comes with it. `data-empty` says which.
  `EmptyState` takes `from="sm"`: its root is `hidden sm:flex`, so a screen keeps its old phone line beside it
  (`sm:hidden`). That pair is the pattern for "iPad and desktop only": render the phone's element with `sm:hidden` and the
  new one with `hidden sm:…`, or prefix every new class with `sm:` / `lg:` on one element. **A field's font, width, padding
  and border need `!`** — the global `input, select, textarea` rule is unlayered and beats any plain utility
  (`font: inherit` wins over `font-bold`, `width: 100%` over `w-…`). `cn` is `clsx`, not tailwind-merge: two display
  classes on one element both stay, so swap them in code (as `from` does) rather than overriding with `className`.
  Probe: `pw/design141.mjs` (testing-and-gates.md).
