# Online orders and OTA channels

**Routes** `/online-orders` · `/channels`
**Files** `app/(app)/online-orders/OnlineClient.tsx` · `app/(app)/channels/ChannelsClient.tsx` ·
both `actions.ts`
**Reads** `online_orders`, `order_channels`, `ota_channels`, `ota_sync_log`, `menu_items`,
`room_types`
**Writes** `accept_online_order`, `push_channel`, `set_rate_inventory`, `availability`
**Related API** `api/webhooks/aggregator/[token]`, `api/ota/sync`, `api/ical/[token]`

## What it is

Two different outside worlds. **Online orders** are food from an aggregator (Swiggy, Zomato) or from
the property's own storefront. **Channels** are room distribution — the OTAs that sell your rooms.

## How it works

**Food in.** An aggregator posts to `api/webhooks/aggregator/[token]` and a row lands in
`online_orders` with status `new`. `/online-orders` is the accept screen: `accept_online_order`
turns it into a real ticket so the kitchen sees it like any other. Commission and payout are
tracked per order so "Today's online sales" and "Commission" are both honest.

**Rooms out.** `/channels` maps a `room_type` to an OTA listing. `set_rate_inventory` pushes rate
and availability; `push_channel` runs a sync; `ota_sync_log` records what happened so a failed push
is visible rather than silent. `api/ical/[token]` exposes availability as an iCal feed for the
channels that only speak that.

Each channel carries its own token. A token is a credential: it is never rendered into a page a
guest can see.

## Before you edit

- **A webhook endpoint is public and unauthenticated by design** — it is listed in
  `PUBLIC_PREFIX` in `middleware.ts`. Its only protection is the token in the path, so treat every
  field in the payload as hostile and validate before writing.
- **Never trust a price from an aggregator payload** without comparing it to the menu.
- **Overbooking is a real risk.** `availability` must be the single answer used by `/channels`, the
  booking page and the front desk. Do not compute availability a second way.
- **A sync failure must be loud.** Write it to `ota_sync_log`; do not swallow it.

## Verify

```
pnpm --filter @dineflow/web typecheck
node dashcheck.mjs       # the online tab on the control room's live panel
```

Post a fake aggregator payload to the webhook on a demo property and confirm it appears, accepts,
and reaches the kitchen.

## See also

[orders-and-till.md](orders-and-till.md) · [api-routes.md](api-routes.md) ·
[guest-facing.md](guest-facing.md)
