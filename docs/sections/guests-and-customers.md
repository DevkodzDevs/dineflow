# Guests and customers

**Routes** `/guests` (hotel side) · `/customers` (dining side)
**Files** `app/(app)/guests/page.tsx` · `GuestsClient.tsx` · `app/(app)/customers/CustomersClient.tsx`
· both `actions.ts`
**Reads** `guests`, `customers`, `loyalty_ledger`, `bills`
**Writes** `customer_upsert`, `customers_overview`, `loyalty_adjust`

## What it is

Two registers for two kinds of person. A **guest** stays in a room and has a stay history. A
**customer** eats, has a phone number, and earns loyalty points. A property can have both.

## How it works

**`/guests`** lists everyone who has ever stayed. A row click opens a `Sheet` with the person's
details and their stays; each stay links through to its folio. On a phone the stay rows wrap:

```tsx
<Link className="flex flex-wrap items-center gap-x-3 gap-y-1.5 …">
  <span className="min-w-[12rem] flex-1">…</span>
  <span className="flex items-center gap-3 ml-auto shrink-0">…</span>
```

A VIP carries a star; `preferences` is free text the front desk reads at check-in.

**`/customers`** is the dining register. `customers_overview` returns the aggregate — spend, visits,
last seen — in one call rather than per row. `loyalty_ledger` is append-only: points in, points
spent, each with a reason. `loyalty_adjust` writes a manual correction with a note; it never
overwrites a balance.

**Ideas from your sales** (`customers/MarketingIdeas.tsx`, above the filter chips). *Get ideas*
calls `marketingIdeas()`: the last 30 days of order lines (cancelled orders left out) become
`salesFacts` — orders, average ticket, top and slow dishes, quietest and busiest day, a slow daypart
in IST — plus how many customers are lapsed, new, regulars or can redeem points. With
`ANTHROPIC_API_KEY` the model writes up to four campaigns from those facts in the house `VOICE`;
without it (or if the call fails) `readyIdeas` writes them from the same facts and the card says
*from your numbers*. Every idea names an audience that is one of this screen's filter chips
(`inAudience` uses the same rules), so *Send to N · Not seen lately* opens a sheet listing those
people, each with a WhatsApp link carrying the message and their first name. **Nothing is sent and
nothing is written** — the owner presses send in WhatsApp, one at a time. `lib/marketing.ts`, 4
tests.

An idea's offer and timing are wrapping tags, not `Pill`s — a pill is one line, and "A free dessert
with any Meen kuzhambu on Tuesdays" ran out of its card at 834.

Coupons are checked at the till by `coupon_check` (see
[billing-and-invoices.md](billing-and-invoices.md)).

## Before you edit

- **Feedback is a chip on Customers** (`?tab=feedback`, 0103): the last chip, its count the unread notes. It
  swaps the cards for `FeedbackBoard.tsx` — the 30-day average and a 5→1★ spread, *All · Unread · 3★ or less*,
  then one card per note (red edge at 3★ or less, green above), tags, the note, Call / WhatsApp when there is a
  phone and **Mark read** (`feedback_seen`). The search box searches the notes; CSV hides. From `xl` the chip rail
  does not shrink or fade (`xl:shrink-0 xl:![mask-image:none]`) — with six chips the last one was clipped at 1440.

- **Customers is Simple Service (2026-10-15).** `SvcHead` ("People who come back — call or WhatsApp them in one
  tap") with **Add customer** · the occasions card · a 56px search (`placeholder="Name or phone"`, the `/` key) and
  chips with counts — All, Regulars, New, Not seen, Can redeem (when loyalty is on) — and CSV · one card per guest
  (`[data-customer]`): a coloured initial (one of the board's hues, by name), the name (a button,
  `data-open-customer`, opens their record) with *Regular* from three visits, the phone as "98401 22334", three
  boxes — Visits, Spent, Last ("2 days ago", "3 wks ago", red past 60 days) — points when loyalty is on, then
  **Call** and **WhatsApp**. Sixty at a time with *Show more* (up to 1,000 are fetched). The four stat tiles and
  Ideas from your sales sit under the cards now.

- **The loyalty ledger is append-only.** A balance is the sum of the ledger, never a stored number
  somebody can edit.
- **Guests and customers are separate tables on purpose.** Do not merge them; the hotel side needs
  ID and address fields the dining side must not collect.
- **Under India's DPDP Act the property — not DineFlow — is the Data Fiduciary for these people.**
  Adding a field here adds an obligation for every property. See [legal.md](legal.md).
- **`guests-test.mjs` edits a real guest and puts it back.** Any test you add here must restore what
  it touches.

## Verify

```
node guests-test.mjs     # 17 checks, ending with
                         # 'put back: "Arjun Prakash" restored to how it was found'
```

## See also

[front-desk.md](front-desk.md) · [legal.md](legal.md) ·
[billing-and-invoices.md](billing-and-invoices.md)

- **CSV exports neutralise formulas** (`lib/csv.ts`, `csvCell`): a cell starting = + - @ gets a leading
  apostrophe (numbers, negative ones too, are left alone). Customer names arrive from public orders.
  Tax's GST export uses the same helper.

- **Give or take points is a tidy form** (2026-10-20, the owner: "alignment and spacing not good"). `[data-points-form]`:
  a title row (gift icon, one line of why, the balance now as a pill); a **Give / Take back** segmented choice
  (`[data-points-mode]`, `[data-points-mode-pick]`) so nobody types a minus sign — the action still gets the same signed
  number (`loyalty_adjust`); the amount as digits only with a "pts" suffix (`[data-points-amount]`) and quick picks
  +50 / +100 / +200 / +500 (`[data-points-quick]`); **Why** full width (`[data-points-why]`); "Balance after: N points"
  (red under zero) beside the Apply button (`[data-points-apply]`, green "Give N points" / red "Take back N points",
  full width on a phone). The loyalty-off notice is an info row (`[data-loyalty-off]`); no movements is a small empty
  state (`[data-points-empty]`). **Fixed on the way:** after Apply the list reset to `null` and `load()` — which only
  fetches when the list is empty in its own stale closure — never fetched again, so the history stayed a shimmer; it
  now refetches directly.

## Customers as cards or a grid (2026-10-23)

As Staff: a Cards · Table switch beside the search (`df-view:customers`, a pick is kept); the grid from md and the cards on a
phone until one is picked. `CustomersGrid.tsx` (`[data-customers-grid]`): Name (initial, a star for a regular, tags), Phone,
Visits, Spent, Last visit (red past 60 days), Points (with loyalty on), First visit, Birthday — by the grid's own width;
every column sorts; Call and WhatsApp are round keys at the row's end. **A row opens the customer's own sheet** (details, bills,
points) — the same dialog the card's name opens. The cards are untouched.
