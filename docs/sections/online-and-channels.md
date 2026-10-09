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

**The night calendar** (`RateCalendar`). A month-style grid: seven columns, Monday first, with
blank cells before the first night so every date sits under its weekday (Fri/Sat headers are bold
— they are the weekend `suggestRate` prices up). One compact tile per night (66px tall on a phone,
78px from `sm`): the date (today in a tint circle, the month beside the first night and each 1st),
booked/total or Full/Stop at the top right, the rate, the suggestion (`title="Suggested: …"`, which
the b3 suite reads; green up, orange down) and a 3px occupancy line along the bottom edge. On a
phone the tiles are ~47px wide, so rupees are shortened to 4.5k (the full figure is in the tile's
`aria-label`). The tiles override two button defaults: `rounded-xl` is 28px in this theme, so they
use `rounded-[14px]`; and a button centres its content vertically, so they are `flex flex-col
justify-start`. The first 14 nights show, with *Show all N nights* for the rest. Tapping a night
sets From/To of the bulk update; tapping a later night extends it; the picked range takes a tint
wash and border (`aria-pressed`). The bulk fields are 2 / 3 / 6 a row.

Each channel carries its own token. A token is a credential: it is never rendered into a page a
guest can see.

## Before you edit

- **Kitchen pace has its own phone markup** (`sm:hidden`); tablets and desktops render the original
  one-row control (`hidden sm:block`), unchanged. The phone card is tinted by the state (green normal,
  amber busy, red paused) with a live dot, "Back to normal" when not normal, the state in 34px display
  type, "N min left" (capped at the hour or the half hour) over a progress bar, and one segmented
  control of big figures, 0 · +15 · +30 · pause, 64px tall (`!min-h-[64px]`: the unlayered button
  floor beats a plain `min-h-*`). Phone segments carry `aria-label`; both versions are in the DOM, so a
  probe must click the visible one (`offsetParent`).

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
