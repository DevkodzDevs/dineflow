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

Coupons are checked at the till by `coupon_check` (see
[billing-and-invoices.md](billing-and-invoices.md)).

## Before you edit

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
