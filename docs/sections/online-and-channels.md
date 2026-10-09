# Online orders and OTA channels

**Routes** `/online-orders` · `/channels`
**Files** `app/(app)/online-orders/OnlineClient.tsx` · `app/(app)/channels/ChannelsClient.tsx` ·
both `actions.ts`
**Reads** `online_orders`, `order_channels`, `ota_channels`, `ota_sync_log`, `menu_items`,
`room_types`
**Writes** `accept_online_order`, `push_channel`, `set_rate_inventory`, `set_rates_only`, `availability`
**Related API** `api/webhooks/aggregator/[token]`, `api/ota/sync`, `api/ical/[token]`

## What it is

Two different outside worlds. **Online orders** are food from an aggregator (Swiggy, Zomato) or from
the property's own storefront. **Channels** are room distribution — the OTAs that sell your rooms.

## How it works

**Food in.** An aggregator posts to `api/webhooks/aggregator/[token]` and a row lands in
`online_orders` with status `new`. `/online-orders` is the accept screen: `accept_online_order`
turns it into a real ticket so the kitchen sees it like any other. Commission and payout are
tracked per order so "Today's online sales" and "Commission" are both honest.

**Kitchen pace** (`KitchenPace.tsx`, top of `/online-orders`) is Zomato's rush-hour switch:
*Normal* / *Busy +15* / *Very busy +30* / *Pause 30 min*. It calls `set_rush` (migration 0079), which
sets `restaurants.rush_extra_min` + `rush_until` (an hour) or `online_paused_until` (half an hour);
*Normal* clears both. Both expire on their own — nothing has to remember to switch it back.
`dine_order` adds the extra minutes to the quoted ETA while `rush_until > now()` and refuses a
non-table order while paused (`not taking online orders right now — back at 1:30 pm`). **A table QR
order (`dine_in`) is never paused** — the guest is already sitting there. The storefront reads
`dine_busy(slug)` and shows an orange *kitchen is busy* or red *not taking online orders* banner on
the Order tab. Aggregator webhooks are not paused by this; Swiggy/Zomato have their own switch.

**Rooms out.** `/channels` maps a `room_type` to an OTA listing. `set_rate_inventory` pushes rate
and availability; `push_channel` runs a sync; `ota_sync_log` records what happened so a failed push
is visible rather than silent. `api/ical/[token]` exposes availability as an iCal feed for the
channels that only speak that.

**Suggested rates** (Rates & availability tab). `suggestRate` in `lib/rates.ts` (5 tests) reads
each of the next 14 nights from what is already booked: ≥90% full +25%, ≥75% +15%, ≥60% +8%; within
3 days and under 30% −15%, within a week and under 40% −10%; a Friday or Saturday that is 40% full
+5% more. **Always moved off the room type's base rate, never the current rate**, so accepting twice
does not compound; rounded to ₹50, kept within 70–150% of base; silent under ₹50 or 3%. Each night
shows the suggestion under its rate (green up, orange down); *Use suggested rates* writes them with
`set_rates_only` (0082), which changes the rate and nothing else — `set_rate_inventory` overwrites
stop-sell and resets minimum stay, so it must not be used for this. Push rates still sends them out.

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
