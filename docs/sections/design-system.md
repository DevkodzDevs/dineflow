# Design system — `globals.css` and `components/ui`

> Read this before **any** visual change, even a one-line one. These two files are shared by every
> screen in the app; a tweak here lands on fourteen pages at once, which is usually the point and
> occasionally the disaster.

**Files** `app/globals.css` (733 lines) · `components/ui/index.tsx` · `components/ui/flip.tsx` ·
`components/ui/{DataTable,Theme,Ticket,AiButton,PasswordInput}.tsx`

## What it is

One language: a split-flap clock on a graphite wall. Dark by default (`data-theme="dark"`), with a
light "paper" theme that is a full re-skin, not an inversion. Both themes are real and **both must
be checked** — a colour that reads on graphite can vanish on paper.

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
  springing open via `@starting-style`. Safari, Firefox and phones keep the native picker.
  Probe: `dropdown.mjs` (open, read, pick, both themes) and `dropdown-dialog.mjs` (inside a Sheet).
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

- **`Sheet` (every dialog) lives in the *visible* viewport, not the layout viewport.** Its frame
  takes `top`/`height` from `window.visualViewport` on resize and scroll, so with an iPad keyboard
  up the dialog shrinks to the space above it instead of losing its title off the top and Save off
  the bottom. The dialog is `max-h-full` of that frame, the header is `shrink-0`, and only
  `.sheet-body` scrolls. The scrim is `fixed` and reaches half a screen past each edge, so a page
  Safari has shifted never shows through undimmed. While open, `html` and `body` are both
  `overflow: hidden`, and both are put back on close. Probe: `dlg.mjs` (8 sizes, including
  1194×420 and 834×560 for the keyboard) and `dialog-audit.mjs` (35 dialogs, 0 with two scrollbars).

- **A utility cannot recolour a kit card.** `.feather`/`.card` set `background` and `box-shadow`
  unlayered, so `bg-[…]` and `ring-…` on the same element silently lose — the till's "selected"
  green ring never rendered for that reason. Add a state class next to the kit rule instead
  (`.feather.picked`, `.feather.filled`) or use an `!important` utility, which does win.

- **Check both themes.** Set the `df-theme` cookie to `paper` and look. Half the colour bugs in this
  app's history only existed in one theme.
- **A grid track must be `minmax(0,1fr)`, not `1fr`.** A grid item defaults to `min-width:auto` and
  refuses to shrink below its content — this pushed the till rail off a phone and overflowed the
  calendar by 258px. Pair it with `min-w-0` on the item.
- **A flex item's `inline-flex` is blockified to `flex`.** Do not detect a button's shape by its
  computed `display`.
- **`mask-image` on a scroller is fine, but scope it.** `.toolbar-group` fades its clip edge only
  when it holds no `input`/`select` and is not `.toolbar-end` — otherwise it fades the right edge of
  a field or of the primary button.
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
- **Container queries: write the at-rule, not the variant.** Tailwind v4 did not generate
  `@[15rem]:` (that is the v3 plugin syntax) and did not generate `@min-[15rem]:` either. The plain
  `@container (min-width: …)` block in this file works. The `@container` *utility* does apply
  `container-type: inline-size` correctly.
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
