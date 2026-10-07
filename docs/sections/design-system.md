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
| ~272 | cards | `.feather`, `.card`, `.feather-lift`, `.spotlight` |
| ~300 | the glance row | `.stat-row`, `.stat-grid`, `.stat`, `.stat-head/-value/-foot` |
| ~353 | buttons & fields | `.btn-*`, `.chip`, inputs, `.segmented`, `.switch` |
| 454 | the receipt | printed-bill materials — warm paper, always light |
| 489 | THE MONTH GRID | `.cal-grid`, `.cal-cell`, `.cal-num`, `.cal-nav` |
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
`min-height: 44px`, `.tap`/`.tap-square` exist for anything the kit does not cover. An inline text
link is exempt from the *width* rule (WCAG 2.5.5) but not from the height rule.

## Before you edit

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
- **The stat card is stacked: label, number, caption.** It was laid sideways for one commit —
  number left, words right — which suited an 86px flap tile and punished a figure:
  `₹8,85,154.72` came out at 23px beside a three-line caption. A figure is the headline and takes
  the full line (`.stat-fig`: 34px from 14rem of content, 38px from 16rem, else `--fig-narrow`
  from its own length so nothing overflows a 144px phone card). The caption stands beside the
  number when it fits and drops under it when it does not. The tone dot is a corner pip
  (`.stat-pip`), and only when there is a tone.
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
