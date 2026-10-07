# Legal pages

**Routes** `/legal/terms` · `/legal/privacy` · `/legal/refunds` · `/legal/contact`
(short aliases: `/terms`, `/privacy`, `/refund-policy`, `/contact`)
**Files** `app/legal/layout.tsx` · `Doc.tsx` · `terms/page.tsx` · `privacy/page.tsx` ·
`refunds/page.tsx` · `contact/page.tsx` · `lib/company.ts` · `components/LegalFooter.tsx`

## What it is

The documents a payment gateway, an app store and Indian law require before DineFlow can be sold:
Terms of Service (2019 words), Privacy Policy (1491), Refunds & Cancellations (955), Contact (360).

## How it works

**`lib/company.ts` is the single source of every legal fact.** No page hard-codes a company name,
an address or an email. It exports `missingFacts()` and `legalPagesReady()`, and `warnOnce()` prints
the missing-facts line once per process rather than on every render.

**Seven fields are still `null` and must be filled by the owner before launch:**

```
legalName · entityType · registrationNo · registeredAddress · gstin · phone · grievanceOfficer
```

Site is `dineflow.cloud`; all addresses are `@dineflow.cloud`.

**Two positions these documents take, which the code must keep true:**

1. **Guest payments run on the property's own gateway keys.** DineFlow is not the merchant of record
   for a guest's meal or stay. See [settings.md](settings.md).
2. **The property is the Data Fiduciary for its guests** under the DPDP Act 2023; DineFlow is the
   Data Processor. See [guests-and-customers.md](guests-and-customers.md).

Also covered: the IT Rules 2021 Grievance Officer, GST/SAC on DineFlow's own subscription, and the
processor list in the Privacy Policy.

## Before you edit

- **These pages are session-free.** They are in both `SESSION_FREE` and `PUBLIC_PREFIX` in
  `middleware.ts`. Keep them there — they are read by people who are not signed in, including a
  gateway's reviewer.
- **Add a processor, update the Privacy Policy in the same commit.** Sentry, for example, is agreed
  but not yet wired, and when it is, it goes on that list.
- **Never hard-code a legal fact in a page.** Add it to `company.ts`.
- **This content has not been reviewed by a lawyer.** It is a careful draft, not advice. Say so if
  anyone asks whether it is final.
- **`warnOnce` is per process.** If you see the missing-facts line four times in a build, something
  re-imported the module — that is the bug, not the warning.

## Verify

```
node legal-shot.mjs      # 18 checks — the four documents render, the aliases resolve,
                         # and none of these paths makes an auth call
```

## See also

[guest-facing.md](guest-facing.md) · [settings.md](settings.md) ·
[admin-and-membership.md](admin-and-membership.md) ·
[guests-and-customers.md](guests-and-customers.md)
