# Scan

**Route** `/scan`
**Files** `app/(app)/scan/page.tsx` · `ScanClient.tsx` · `actions.ts`
**Reads** `ingredients`, `menu_items`, `categories`, `rooms`, `bookings`, `housekeeping_tasks`,
`labourers`, `stock_ledger`, `scan_log`
**Writes** `labour_punch`, `next_labour_code`
**Related API** `api/scan/route.ts`

## What it is

One camera that does several jobs. Point it at a thing and the app works out what the thing is: a
vegetable going into the pantry, a dish, a room, a labourer's ID card.

## How it works

The mode dock (`.scan-modes`, since 2026-11-11 — it was a `.chip-rail`) lets the person narrow it down — **Auto**,
*Vegetable / product*, *Dish*, *Room*, *Labour / ID* — and the room mode only appears when the property has rooms. The
chosen mode slides a thumb under itself (`layoutId`) and sets the screen's hue.

A recognised loose product offers `QUICK_QTY` from `@dineflow/shared` — the unit-appropriate quick
picks (100 g, ½ kg, 1 kg…) — so a receipt can be booked in without typing.

**A bill's own QR reopens the bill.** `lookupCode` first checks for a `/pay/<token>` URL (the QR
printed on every bill) and answers `{ kind: "bill" }` from `bills.pay_token`; the result card shows
paid/unpaid, the date, `Bill #N · ₹total` and *Open bill* → `/billing/<order_id>`. Typing the URL in
the code field does the same, so a torn or faded QR still works.

`scan_log` records every scan. That is both the audit trail and the training signal for what the
recogniser gets wrong.

Barcode reading uses `@zxing/browser`.

## Before you edit

- **Photos are two add-ons (0175, 2026-11-09).** *Photo recognition* (`scan-vision`, with *AI help*) is what `aiEnabled` means
  to `ScanClient` now — without it the page is sample mode and `/api/scan` answers 403. *ID card reading* (`scan-id`, **off by
  default**: it sends an Aadhaar or voter ID to the model and keeps a name, phone and address) shows the *Labour / ID* chip
  (`idScan`); without it the route turns a "labour" hint into "auto" and a person or document the model still recognises
  comes back as `unknown` — nothing personal is logged or shown. The route asks the database (`effective_features()`), so the
  phone app is held to the same switch. Barcodes, QR punches and the bill QR need no model and no add-on.
- **The console look (2026-11-11, the owner: "ultra modern … unique").** Everything on the screen reads one custom property,
  `--hue`, set inline from a token by kind — violet Auto, orange product, green dish, blue room, cyan labour / staff, the
  tint for a bill (`HUE` in `ScanClient`): the dock's thumb, the stage's corner brackets, radial glow and sweep, the code
  field's focus ring, the *Where it lands* lanes, the *Recent scans* log and a thin line on the top edge of a result card.
  While scanning the hue is the chosen mode's; once there is a result it is the recognised kind's. The CSS is the SCAN
  block at the end of `globals.css` (`.scan-modes/-mode/-stage/-view/-hud/-tag/-frame/-sweep/-dim/-idle/-orb/-dock/-code/
  -lanes/-lane/-ico/-log`). The stage carries `data-mode` (idle / camera / result) and `data-photo`: a result typed or
  read from a code has no photo, so the stage shrinks to a band (2:1, 3:1 from md) naming what was found. Royal loses the
  glow and grid (no gradients). Reduced motion: the global rule stops the brackets' breathing, the orb's rings and the sweep.
- **The stage (`.scan-view`, inside `.scan-stage`) is `--color-bezel`, dark in every theme — so its words are fixed light,
  like `.wall`'s.** It was `bg-ink`, which is near-white in the dark theme, so "Ready to scan" printed white on white. The
  idle brackets sit `clamp(54px, 16%, 90px)` from the top so the HUD tags (mode, *Sample mode*) never cover them.
- **On a phone the type-a-code field takes its own full-width line** under Open camera / Upload; from `sm` it shrinks to
  200–300px so Capture / Close / Upload / the field share one row. The input inside `.scan-code` draws nothing of its own
  (`!important`, because every theme restyles inputs — royal and colour drew a second box inside the field).

- **The camera is a permission and it can be refused.** Every path must have a typed fallback.
- **A scan must never write without a confirmation step.** The recogniser is a suggestion; the
  person presses the button.
- **`/scan` writes to `stock_ledger`** through the same path as [inventory.md](inventory.md). Do not
  add a second way to move stock.
- **A labour punch from a card is an attendance record** — see
  [staff-and-labour.md](staff-and-labour.md) for why a labourer is not a user.

## Verify

```
pnpm --filter @dineflow/web typecheck
node scan84.mjs          # 80 checks (2026-11-11): both kinds, five themes, five widths — see testing-and-gates.md
```

Camera paths need a real device; the headless suites cannot cover them.

- **Short copy** (2026-10-23): subtitles and hints cut to a few words.

## See also

[inventory.md](inventory.md) · [staff-and-labour.md](staff-and-labour.md) ·
[api-routes.md](api-routes.md)
- **Shorter copy (2026-10-29, the owner: "maximum 3 or 4 words, try 2 or 3 — clean and neat").** Subtitles, hints, helper
  lines and empty-state hints cut to two–four words, or removed where they said the obvious. Error and refusal messages,
  steps to follow outside the app, printed and exported text, WhatsApp bodies and tooltips were left as they were.
