# Tax and compliance (India)

**Route** `/tax`
**Files** `app/(app)/tax/page.tsx` · `TaxClient.tsx` · `Guide.tsx` · `actions.ts`
**Reads** `restaurants`, `profiles`, `compliance_filings`, `compliance_docs`
**Writes** `gst_summary`
**Shared** `packages/shared/src/tax.ts`

## What it is

The GST position for one property, the filing calendar, and a plain-language guide for an owner who
is not an accountant. `Guide.tsx` is the explainer; `TaxClient.tsx` is the working screen.

## How it works

**`gst_summary`** computes the period's output tax from the bills, split the way a GSTR return wants
it. The rates come from the property: `gst_rate` (dining), `room_gst_rate` /
`room_gst_rate_high` / `room_gst_threshold` (India's room-tariff slab), `facility_gst_rate`.

**`gst_scheme`** on the property decides the shape — regular vs composition — and `gst_monthly`
whether returns are monthly or quarterly. `gst_state_code` drives CGST+SGST vs IGST.

**`compliance_filings`** is the calendar: what is due, when, and whether it is done.
**`compliance_docs`** is where the filing paperwork is meant to live.

The property's CA can be recorded (`ca_name`, `ca_firm`, `ca_membership_no`, `ca_email`,
`ca_phone`) so the screen can hand them a pack.

## Before you edit

- **Overview → Registration is a `dl` with an `auto` label column and short labels** ("GST rates",
  "CA"). The rates are a wrapping row of chips. As one line in the display face they could not
  break and ran out of the card at every width, 1920 to 412. The month's three figures are tiles
  in `repeat(auto-fit, minmax(8.5rem, 1fr))`, so they reflow rather than crowd.
- **A document's number wraps, never truncates** — it is what an officer asks for at the counter.
- **Wide tables (Returns, Guide) scroll inside `.table-wrap`.** An empty month's note goes under
  the table, not in a `colSpan` row — centred across eight columns it was cut mid-word on a phone.
- **The tab rail fades only where it scrolls** (`rail-fade` plus `sm:![mask-image:none]`). Without
  the `!` the unlayered `.rail-fade` rule wins and "Guide" looks faded on a screen where it fits.

- **GST maths lives in `packages/shared/src/tax.ts` and in the RPC**, so the web app, the mobile app
  and the printed invoice cannot disagree. Do not add a second calculation in a client component.
- **A tax figure on a settled bill is frozen.** `gst_summary` reads what was charged; it does not
  re-rate.
- **The room slab is a threshold, not a bracket.** Check `room_gst_threshold` semantics in
  `tax.ts` before changing it — getting this wrong misstates a return.
- **This is not tax advice and the screen must not read like it is.** `Guide.tsx` explains; it does
  not instruct.
- **Known gap:** filing documents are not yet stored in-app, and there is no .docx/PDF export. There
  is no storage bucket and no document library in the project yet.

## Verify

```
pnpm --filter @dineflow/web test      # the shared tax maths
pnpm --filter @dineflow/web typecheck
node diag.mjs "/tax?tab=overview@1194|…"   # all six tabs × 1366/1194/1024/834/412: 0 spill,
                                           # 0 overlapping text, 0 text past its card
```

Then reconcile `gst_summary` for a demo month by hand against the bills for that month.

## See also

[billing-and-invoices.md](billing-and-invoices.md) · [legal.md](legal.md) ·
[reports-and-forecast.md](reports-and-forecast.md)
