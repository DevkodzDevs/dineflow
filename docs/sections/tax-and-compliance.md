# Tax and compliance (India)

**Route** `/tax`
**Files** `app/(app)/tax/page.tsx` · `TaxClient.tsx` · `Guide.tsx` · `actions.ts`
**Reads** `restaurants`, `profiles`, `compliance_filings`, `compliance_docs`
**Writes** `gst_summary`, `tally_days`, `tally_settings_save` (0105)
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

- **Tally (tab `?tab=tally`, 0105).** No connector: `TallyTab.tsx` asks `tally_days(from, to)` (≤ 92 days, owner
  or manager) and writes Tally import XML in the browser with `lib/tally.ts` (6 tests): one **Sales** voucher a
  business day (DF-S-yyyymmdd) — each payment method debited, sales (taxable), service, CGST, SGST, round-off
  credited, anything else (a promise fee, an over-payment) to *Other income* so every voucher balances to the paisa
  — and one **Payment** voucher an expense (DF-E-…; net + input GST debited, Cash or Bank credited). Tally's sign
  rule: debit = `ISDEEMEDPOSITIVE Yes` and a negative `AMOUNT`. A **Ledgers** file (masters, under their usual
  groups) is imported once; a Day book .xlsx checks it. Ledger and company names are saved on the property
  (`tally_ledgers`, only known keys kept).
  **Stays and facilities (0109/0110):** each stay or facility invoice is a Sales voucher of its own (DF-R-n / DF-F-n, on
  its issue date): room lines (SAC 996311) to *Room revenue*, food served to a room (9963 3x) to *Food sales*, the rest
  to *Guest services*; CGST, SGST, round-off credited; each payment debited by how it was paid (read from its words —
  UPI, card, cash, else Other), what is still owed to *Sundry debtors*, a discount to *Discount allowed*. Dining invoices
  are their bills and stay in the daily voucher. The day book has a *Stays* sheet.

- **Overview → Registration is a `dl` with an `auto` label column and short labels** ("GST rates",
  "CA"). The rates are a wrapping row of chips. As one line in the display face they could not
  break and ran out of the card at every width, 1920 to 412. The month's three figures are tiles
  in `repeat(auto-fit, minmax(8.5rem, 1fr))`, so they reflow rather than crowd.
- **A document's number wraps, never truncates** — it is what an officer asks for at the counter.
- **Wide tables (Returns, Guide) scroll inside `.table-wrap`.** An empty month shows only its
  sentence — no table at all. A header row of eight columns with nothing under it read as broken on
  a phone, and the note in a `colSpan` row before that was cut mid-word.
- **Returns' month on a phone is one stepper bar** (back · month centred · forward, 44px buttons on a
  `--color-fill` bar) with "CSV for your CA" full width under it; from `sm` they share one row with
  the button pushed right. The card titles' notes ("All sales · GSTR-3B…") stack under the title on a
  phone by the global `.card-title:has(> .footnote)` rule. Probe: `five.mjs`.
- **Every filing card and every document card ends in a footer strip** (`CardStrip`, edge to edge,
  2026-10-13 — the owner marked the old small outline button and text links on an iPad). A filing
  card (`FileRow`: `[data-filing]` with `data-state` due / overdue / filed, strip
  `[data-file-actions]`):
  - **due or overdue:** *Mark filed* on a soft green, then *Open portal* (a link, new tab);
  - **while marking:** the date and the ARN open *inside* the card (`[data-marking]`, two equal
    fields) and the strip turns into *Cancel · Save as filed*. There was no way back out before:
    the fields and a Save button simply replaced the actions;
  - **filed:** the ARN is a line in the card (`[data-ack]`), and the strip is *Open portal* plus, on
    the Calendar only (Returns passes no `onUndo`), *Undo filing* (it was "not filed after all").

  A filing card is `rounded-xl border overflow-hidden flex flex-col`, its content in a `p-4 flex-1`
  div, so in a two-up row both strips sit on the row's foot. On the Calendar it is `raised` (the card
  surface and shadow, like the document cards); inside Returns' card it keeps no surface of its own.
  An overdue card keeps its red wash; `CardStrip`'s green is laid over the card colour so it is not
  olive there.

  A document card (`[data-doc]`, strip `[data-doc-actions]`) is `Card` with `!p-0 overflow-hidden
  flex flex-col`. Its strip is *Open copy* on a soft green (only when there is a link), *Edit*, and
  *Remove* in red (it still confirms). The expiry pill stays top right.

  Probe: `taxstrip.mjs`.
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
