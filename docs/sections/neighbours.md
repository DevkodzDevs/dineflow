# Neighbours (the local network)

**Route** `/neighbours`
**Files** `app/(app)/neighbours/page.tsx` · `NeighboursClient.tsx` · `actions.ts`
**Reads** `neighbours_cache`, `restaurants`, `profiles`, `ingredients`, `labourers`
**Writes** `network_join`, `network_status`, `network_prices`, `network_demand`, `surplus_post`,
`surplus_feed`, `surplus_claim`, `surplus_close`, `standby_offer`, `standby_feed`, `standby_book`

## What it is

Opt-in cooperation between nearby properties on DineFlow: what ingredients cost around here, who
has surplus stock going spare tonight, and which standby staff are free. A property that has not
joined sees an invitation and nothing else.

## How it works

**Joining is explicit** (`network_join`) and reversible (`network_status`). Until then no data about
the property leaves it.

**What is shared is aggregated, not itemised.** `network_prices` returns what the area is paying
for an ingredient; `network_demand` returns how busy the area is. Neither names a property.

**Surplus** is deliberate and named: `surplus_post` offers a specific quantity, `surplus_feed` lists
what is on offer, `surplus_claim` takes it, `surplus_close` ends it. **Standby** is the same shape
for people.

`neighbours_cache` holds the computed neighbourhood so the screen does not recompute a geographic
query on every load. `district`, `pincode` and `network_alias` on the property control the radius
and the name others see.

## Before you edit

- **This is the one screen where a property's data can reach another tenant.** Every RPC here is a
  deliberate hole in the tenant wall and each one must aggregate or anonymise. Adding a field to a
  network RPC is a privacy decision, not a feature.
- **`network_alias` exists so a property can take part without being named.** Never fall back to
  the real name when the alias is set.
- **Leaving must stop the sharing immediately**, including anything cached.
- **The privacy sheet on this screen is what the owner consented to.** If you change what is shared,
  change that copy in the same commit — and check [legal.md](legal.md).

## Verify

```
node dialog-audit.mjs    # "Sharing & privacy" is one of the 35 audited dialogs
node audit-isolation.mjs # tenant isolation — 66 policies, cross-tenant read/write refused
```

## See also

[data-and-rls.md](data-and-rls.md) · [legal.md](legal.md) · [inventory.md](inventory.md)
