# Billing and invoices

**Routes** `/billing` · `/billing/[orderId]` · `/invoices` · `/invoices/[id]`
**Files** `app/(app)/billing/page.tsx` · `DayClose.tsx` · `[orderId]/BillClient.tsx` ·
`app/(app)/invoices/InvoicesClient.tsx` · `[id]/InvoiceView.tsx` · both `actions.ts`
**Reads** `bills`, `orders`, `bookings`, `day_closes`, `invoices`
**Writes** `generate_bill`, `settle_bill`, `close_day`, `shift_close`, `shift_expected`,
`coupon_check`, `customer_lookup`, `generate_dining_invoice`, `generate_stay_invoice`

## What it is

Money leaving the building. `/billing` turns an open ticket into a bill, takes payment, and closes
the shift and the day. `/invoices` is the GST tax invoice — a different document with legal
requirements, generated from a bill or a stay.

## How it works

**Bill → payment → settle.** `generate_bill` freezes the ticket into a `bills` row with its own
numbering and its GST breakdown. `settle_bill` records one or more payments (`cash`, `card`, `upi`…)
against it. A bill can be part-paid; the till shows what is owed.

**The maths lives in `@dineflow/shared/billing.ts`**, not in the screen, because the mobile app and
the printed receipt must agree with it to the paisa.

**GST** is per-property and per-thing: `gst_rate` for dining, `room_gst_rate` /
`room_gst_rate_high` / `room_gst_threshold` for rooms (India's slab rule), `facility_gst_rate` for
facilities. `service_charge_pct` is separate and is not a tax.

**Shift and day close.** `shift_expected` says what the drawer should hold; `shift_close` records
what it actually held and the difference. `close_day` seals the day — after it, the day's figures
stop moving, which is what the reports and `proof` depend on.

**Invoices** are a separate, numbered series. `/invoices` has a month strip with a bar per month and
a reading pane beside the list; on a phone that pane becomes a sheet.

## Before you edit

- **Never recompute a settled bill.** The GST breakdown on a `bills` row is the legal record of what
  was charged. If a rate changes, it changes for the next bill.
- **Do not invent invoice numbers in the client.** The series is allocated server-side; a gap or a
  duplicate is a compliance problem, not a display bug.
- **The invoices suite is time-dependent.** Demo invoices age out of the default 30-day window; pin
  the suite to `?days=365` rather than "fixing" the screen.
- **A refund is not a negative bill** — check how the existing flow records it before adding one.

## Verify

```
node design-test.mjs     # invoices: month strip + bars, row click fills the pane, totals,
                         # subtotal/GST/total/owed, the next row swaps the pane, the phone sheet
pnpm --filter @dineflow/web test
```

## See also

[orders-and-till.md](orders-and-till.md) · [tax-and-compliance.md](tax-and-compliance.md) ·
[reports-and-forecast.md](reports-and-forecast.md)

- **Printed bills and KOTs escape every value** (`lib/print/html.ts`, `e()`): item names, notes and
  the guest's name reach them from public storefront orders, and the browser-print fallback writes the
  HTML into a same-origin window — unescaped, a note could run script with the staff member's
  session. The pay QR must be an image `data:` URL. Tested in `lib/security.test.ts`.
- **Direct bill/invoice edits are fenced in the database (0084)**: voiding an unpaid bill and the
  invoice's bill-to fields are the only direct updates allowed. See data-and-rls.md.

- **Invoiced by month is a column chart with a readout** (`MonthStrip` in `InvoicesClient.tsx`, every
  width): one series, one hue — bars from a common baseline, the chosen month solid tint and the rest
  32% tint, empty months a 3px stub — and the chosen month's total, invoice count and change on the
  month before in a readout above. It opens on the latest month with invoices; tap, hover or focus a
  bar to read another. No number on every bar; a `sr-only` table carries all six for a screen reader.
  The bar buttons strip the global button chrome (`!border-0 !bg-transparent !p-0`) — without it each
  column drew a heavy rounded box. It used to be a 3×2 grid of thin bars with twelve figures.
- **An invoice's detail (`Detail`, the pane beside the list from 1280 and the dialog below it)** reads
  like an invoice: a headline block washed green when settled or red when not — the number, the
  kind, "Paid in full" or "₹X due", the total in 34px, the issue date and property; then who it is
  billed to (the phone is a tap-to-call link); the charges as a receipt list (description, qty ×
  rate · GST, amount); the sums in order (subtotal, discount, GST with its CGST/SGST split, total,
  paid, balance); and **Open invoice / Print as real buttons** (`btn-filled`, `btn-gray`). Open
  invoice was `btn btn-primary`, a class this app does not have, and rendered as plain text. The
  pane sticks at 92px, under the floating top bar. Probe: `invdlg.mjs`; `design-test`'s invoice
  checks predate this and the month chart (they read a hidden month table as invoice rows).
- **On a phone the filters are two segmented rows** (`sm:hidden`): All · Stay · Dining, and 7 days ·
  30 days · 90 days · 1 yr, each one row, 44px. sm and up keep the chips. Probe: `inv.mjs` (20 checks
  over five widths, with the order header).
