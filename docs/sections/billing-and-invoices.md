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
