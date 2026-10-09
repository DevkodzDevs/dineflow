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

The hint rail (`.chip-rail`) lets the person narrow it down — **Auto**, *Vegetable / product*,
*Dish*, *Room*, *Labour / ID* — and the room hint only appears when the property has rooms.

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

- **The viewfinder is `--color-bezel`, dark in both themes.** It was `bg-ink`, which is near-white
  in the dark theme, so "Ready to scan" printed white on white.
- **On a phone the type-a-code field takes its own full-width line** under Open camera / Upload.

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
node toolbars.mjs        # the hint rail
```

Camera paths need a real device; the headless suites cannot cover them.

## See also

[inventory.md](inventory.md) · [staff-and-labour.md](staff-and-labour.md) ·
[api-routes.md](api-routes.md)
