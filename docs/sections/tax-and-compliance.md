# Tax and compliance (India)

**Route** `/tax`
**Files** `app/(app)/tax/page.tsx` · `TaxClient.tsx` · `Guide.tsx` · `TallyTab.tsx` · `actions.ts` · `lib/gstr1.ts` · `lib/tally.ts`
**Reads** `restaurants`, `profiles`, `compliance_filings`, `compliance_docs`, `expenses` (input credit); for the GSTR-1 file
and the Tally credit notes `bills`, `order_items` (+ `menu_items.hsn`), `invoices`, `credit_notes`, `order_channels` (through RLS, pinned for the master)
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

- **GSTR-1 JSON (2026-11-09, "your CA gets one file on the 1st").** Returns has a *GSTR-1 JSON* button beside the CSV
  (`[data-gstr1]`, file `GSTR1-<GSTIN>-<MMYYYY>.json`, the offline tool's import format: `gstin`, `fp`, `version`, `hash`
  "hash", then the sections below). `actions.ts` **gstr1Month(month)** gathers the month — who may ask is whoever may open
  Tax at all (the layout's `modulesFor` test: owner, manager, supervisor) or the master, whose reads are pinned to the
  property (`pinTo`, the lib/scoped.ts pattern); PostgREST answers 1,000 rows a call, so every list is paged (`allRows`).
  **No migration**: bills, invoices, credit notes and order lines are read through their RLS; the figures come from the same
  columns `gst_summary` reads. `lib/gstr1.ts` **buildGstr1(input)** is pure and shapes it (13 tests in `gstr1.test.ts`:
  paisa reconciliation, two-decimal amounts, B2B by ctin, HSN by code + rate, document series, DD-MM-YYYY, IST month edges).
  Under the button a line says where the file goes (*Import in the GST offline tool or the portal → Returns → GSTR-1 →
  Import*) and, when `restaurants.ca_email` is set, **Send to CA** (`[data-send-ca]`, a `mailto:` with the subject and the
  month's figures in the body — the files are attached by hand); without an email it links to Profile & CA. After a
  build, `[data-gstr1-result]` prints the file name and what it holds (B2B count, B2CS value, HSN rows, the 9(5) value kept
  out) so the owner can see it agree with the table above.

  **One date basis per section — the one gst_summary (0146) already uses, so the file and the screen never disagree:**
  - *dining bills* → the business day the bill was **paid** (`paid_at`, IST). A dining bill is the tax invoice and is issued
    when settled; gst_summary's dining rows use the same day.
  - *stay, facility and B2B tax invoices* → the day **issued** (`issued_at`, IST): a tax invoice's date is its time of
    supply (CGST Act s.13(2)); gst_summary's stay and B2B rows use it.
  - *credit notes* → the day issued (`created_at`, IST), as gst_summary's `credit_notes` row.

  **Where each rupee goes:** `b2b` (table 4) every invoice with a buyer GSTIN, grouped by that GSTIN, one `inv` each with
  items per rate — a dining bill that has such an invoice is here and **not again** in b2cs (the screen's dining rows count
  it in both places; the file cannot). `b2cs` (table 7, `INTRA`/`OE`, pos = the property's state) the rest per rate: bills by
  their `tax_lines` (an older bill as one part at its blended rate, exactly as gst_summary) and stay / facility invoices
  without a GSTIN. `cdnr` (9B, `ntty` "C") credit notes whose bill had a B2B invoice (buyer read from `invoice_id`); a
  credit note to a walk-in is **netted in b2cs** at its rate — table 7 is net of notes, and an intra-state B2C note has no
  `cdnur`. `nil` (table 8) anything charged at 0% (composition / unregistered / a 0% dish). `hsn` (table 12, `data[]`):
  dishes by `menu_items.hsn` (996331 when none) and rate, quantities summed, each bill's per-rate taxable value shared
  across its dishes of that rate by price × qty (the paise on the largest), so the HSN table adds up to b2b + b2cs to the
  paisa; `uqc` OTH for a 99… SAC, NOS for goods; a stay's lines by their SAC. `doc_issue` (table 13): `doc_num` 1 holds the
  month's BILL- series and INV- series (from, to, totnum, cancel = voided + gaps, net), `doc_num` 5 the CN- series.
  **Section 9(5)** (Swiggy / Zomato / ONDC, `gst_by_operator`): the operator paid the GST, so the value is **kept out of b2cs
  and hsn** exactly as gst_summary keeps it out, and reported in `summary.eco` for the CA; table 14(b) (`supeco.paytx`) wants
  the operator's GSTIN, which DineFlow does not hold, so that entry is written only when one is supplied (`operatorGstins`).
  Facility invoices (`kind = 'facility'`) are in the file though gst_summary's stay rows read only `kind = 'stay'` — none
  exist yet (no function writes that kind); if one ever does, the screen's total and the file will differ by it.
  Phase-III of the portal (2025) splits table 12 into B2B and B2C tabs; the file writes the single `data` list the offline
  tool has always taken — if an import rejects it, that split is the first thing to add.

- **Input credit card (`[data-gst-itc]`, Returns, 2026-11-09).** `page.tsx` sums `expenses.gst_amount` for the month (0105;
  voided ones out, `pinned` for the master) and the card shows output tax (the month's CGST + SGST less credit notes),
  input GST from expenses, and the net — "Credit carried" when input exceeds output. Labelled *estimate — your CA confirms
  eligibility*: a 5% restaurant has no ITC at all, and blocked credits (s.17(5)) are the CA's call. Purchases (0001/0073)
  record no GST, so there is nothing to add from them. A login whose role cannot read expenses sees no card.

- **Tally: credit notes and charges (2026-11-09).** `tallyDays` reads, beside the RPC, the period's `credit_notes` (with
  the bill number) and the paid bills with `charges > 0`, pinned for the master; `lib/tally.ts` writes one **Credit Note**
  voucher a note (DF-CN-n, on its day: sales, CGST, SGST debited; the refund credited to Cash / UPI / Card / Other by
  `refund_method`; a paisa gap to Round off) and credits the day's packing & delivery `charges` to the **sales** ledger, not
  Other income (they are part of the taxable supply). `tallyVouchers(…, stays, credits)`; 4 more tests (14 in all). The
  day book has a *Credit notes* sheet; the totals tile reads *Stays · credit notes*.

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
pnpm --filter @dineflow/web test      # the shared tax maths; gstr1.test.ts (13) and tally.test.ts (14)
pnpm --filter @dineflow/web typecheck
node diag.mjs "/tax?tab=overview@1194|…"   # all six tabs × 1366/1194/1024/834/412: 0 spill,
                                           # 0 overlapping text, 0 text past its card
```

Then reconcile `gst_summary` for a demo month by hand against the bills for that month.

- **Short copy** (2026-10-23): subtitles and hints cut to a few words.

## See also

[billing-and-invoices.md](billing-and-invoices.md) · [legal.md](legal.md) ·
[reports-and-forecast.md](reports-and-forecast.md)
- **By the rate each bill charged (2026-10-29, 0146).** `gst_summary` reads a bill's `tax_lines` (a bill with 5% and 18%
  dishes shows in both rows; it used to divide the tax by the base and print a blended "9.3%"); older bills as before.
  Swiggy / Zomato / ONDC bills are left out of the taxed rows and given as `eco` (section 9(5): the operator paid the GST —
  GSTR-3B 3.1.1(ii)); credit notes issued in the period as `credit_notes` (GSTR-1 9B). The Returns tab shows both in
  *Credit notes · platform sales* (`[data-gst-adjust]`, only when there are any) and in the CSV for the CA. The B2B rows
  had added the bill's service charge to an invoice value that already held it; they use the invoice's own value now.
- **Shorter copy (2026-10-29, the owner: "maximum 3 or 4 words, try 2 or 3 — clean and neat").** Subtitles, hints, helper
  lines and empty-state hints cut to two–four words, or removed where they said the obvious. Error and refusal messages,
  steps to follow outside the app, printed and exported text, WhatsApp bodies and tooltips were left as they were.
