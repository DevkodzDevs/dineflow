# Online orders and OTA channels

**Routes** `/online-orders` · `/online-orders/payouts` · `/channels`
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

**The night calendar** (`RateCalendar`). From `sm` up, a month-style grid: seven columns, Monday first, with
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

**Tabs and room types on a phone.** For a hotel or resort the three tab chips become one segmented
card (`role="tablist"`): equal thirds, icon over a short label — Delivery · OTAs · Rates — 58px tall,
the active third filled with `--color-label`. A restaurant has only Food delivery and keeps its
chip. The room-type chips sit on one `.chip-rail` under a small "Room type" label and swipe instead
of wrapping. From `sm` up both are the original chips. Probes that click "Rates & availability" by
text must click the *visible* button: on a phone it reads "Rates".

**On a phone** (`sm:hidden`) the calendar is replaced by an inset list, one 64px row per night: a
44px date tile (weekday over day; today filled with the tint), the rate over a thin booked bar and
"0/8 booked", and on the right the suggestion chip, *Stop sell*, or "on target". A new month gets a
small header row. The picked range is a tint wash with a 3px tint edge. The phone chip carries
`data-suggested`, **not** `title` — the hidden desktop tiles already answer
`[title^="Suggested:"]`, and a second set would double the b3 suite's count.

**The OTAs are cards, one per channel** (2026-10-13; they were rows of one list, and before that
cards two-up whose buttons wrapped). The owner marked each row's four loose buttons and the bare link
input. `section[data-ota-list]` (`@container`) holds a header — "OTA channels", the count, *Sync now*
and *Add OTA* (an even pair on a phone) — then `ul[aria-label="OTA channels"]`: **one card across
below a 64rem list**, and from 64rem `repeat(auto-fit, minmax(20rem, 1fr))`, so three cards fill one
row and two fill it too. A touch iPad shows the rail, not the 256px sidebar, so **1194 has a 1042px
list and three cards across** (337px each); 834 has 682px and one across; 1080 (an older iPad on its
side) has 928px and one across. Each `li[data-ota]` is a `feather` card read the way an Orders card
reads:

- the 44px initial tinted by kind (`OTA_HUE`, tokens only); the name on one line (`[data-name]`,
  15px, truncates) over "iCal · 15% commission" (`[data-mode]` blue for iCal, orange for API); a
  Live/Draft chip on the right (`[data-live]`, green with a pulsing dot when live, grey for draft);
- `[data-status]`: the sync state (synced / never synced / the error) and their feed, each with its
  own 12px icon so a wrap never strands a "·";
- `[data-cal-link]`: **your calendar as one field** — a calendar icon, "Paste into Booking.com" (from
  `OTA_NAME`; any other kind is "their site"), the link without `https://` with its end kept in view
  (`[data-link]`: two spans, the start truncates and the last 12 characters never do), and **Copy
  inside the field** (`[data-copy]`), "Copied" with a tick for 1.8s on that card only. The clipboard
  gets the full `https://` link. If the clipboard is refused, a `prompt()` hands over the whole link
  to select. The field has `mt-auto`, so the fields line up along a row of unequal cards;
- `[data-actions]`: **the card's footer strip**, edge to edge, four equal sections split by
  hairlines. Sync (`data-act="sync"`) is on a soft green, Push rates and Edit are quiet, and Remove
  is red. This is the Housekeeping and Menu cards' strip, drawn by the shared `CardStrip`
  (`components/ui`, see [design-system.md](design-system.md)). **With four sections, a card under
  26rem puts each section's icon over its word** (56px tall: 1440's 359px cards, 1194's 337px, a
  phone's 380px); from 26rem the icon sits beside the word (44px).

On a card from 48rem (one channel across a wide list) the calendar field sits beside the name,
24rem wide.

**Sync no longer reloads the page.** It spins on the pressed section ("Syncing…"; *Sync now* spins
too) and every Sync is disabled while one runs. It then says what happened in a toast — "Synced · 2
new bookings", "Synced · nothing new", "Nothing to read yet — add their calendar link with Edit"
(`syncSaid`, from the route's `report`) or the route's error — and calls `router.refresh()`. It used
to `location.reload()` (a white flash, back to the top) and say "Sync finished" even with no feed.
Push rates spins ("Pushing…") and answers in a toast. Without `SUPABASE_SERVICE_ROLE_KEY` (as on a
local server) the toast is the route's "Channel sync is not available on this server." Probe:
`otacards.mjs`.

Each channel carries its own token. A token is a credential: it is never rendered into a page a
guest can see.

**A partner API key never leaves the server** (0098, 2026-10-13). The Channels page selects named
columns — not `*` — and reads `has_api_key` (a generated column) to say *Saved*; the key field is
write-only, and on an edit a blank field keeps the saved key (`keyOf` in both actions files — it used
to erase it on every save). Online orders reads only `id, kind, label, is_live` of its channels.
Migration 0121 (2026-10-19) takes `api_key` out of SELECT for every API role. Writing a channel needs the Channels module (a restrictive policy); `push_channel`
and the OTA sync read the key as owner / service role. The OTA sync also resolves a feed's host and
refuses one that resolves to a private address (`lib/netguard.ts` — `10.0.0.5.nip.io` passed the old
text-only check).

**Dishes online** (0132, 2026-10-22 — the owner: "set which dishes are available online, by the chef, the manager and the
online-orders supervisors"). `menu_items.online_available` (default true) is separate from `is_available` (Sold out):
off online, Swiggy, Zomato and the website stop selling a dish; the till and the table QR still do. Sold out still stops it
everywhere. `OnlineDishes.tsx` is a card under Kitchen pace ("Dishes online · N off online · M sold out", `[data-online-dishes]`)
opening a sheet: search, All / Off online / Sold out chips, every dish under its category with a switch
(`[data-online-dish]`, `data-online="true|false|sold"`; sold-out rows are shown, not switched — "turn on in Menu"), and
*Turn all on*. Writes go through `set_online_available(ids, on)` (security definer, checks the caller): **the owner, a
manager, a chef, or a supervisor of either rank holding Online orders** — `canSetOnline` (lib/online.ts, tested against the
migration's text) decides whether the screen shows switches; anyone else (a cashier) sees the list read-only with the
reason (`[data-online-locked]`). A chef, who does not hold Online orders, switches it from Menu (menu.md). The website:
`dine_storefront` carries `online` per dish; for delivery and takeaway an off-online dish shows *not online* with no Add
(`[data-not-sold="online"]`) and leaves the basket on switching mode; `dine_order` skips it except `dine_in`. An aggregator
keeps its own menu and can still send one: a new order's card says *Off online: X. Reject, or accept if you can make it.*
(`[data-off-online]`). Probe `online56.mjs` (16), dry run `dry132.cjs` (12).

## Before you edit

- **Payouts (`/online-orders/payouts`, 0105; owner or manager — a *Payouts* button in the header).** Pick the
  channel (website channels are left out: they are paid directly) and the period — last Monday to Sunday by
  default, how Swiggy and Zomato settle. `settlement_expected` adds up that channel's orders (not new, rejected or
  cancelled — 0108 left out never-accepted ones) by IST placed date: count, value, commission, *should pay*. Type what reached the bank plus any TDS /
  TCS and other cuts on the statement; the gap shows before saving (green within ₹1, red short, amber over).
  `settlement_add` stores the expected figures as they were, so a later edit to an order does not move an old gap.
  The payout per order is only as good as what the channel sent; the gap is the question to ask them.

- **Online orders is Simple Service (2026-10-15).** `SvcHead`, Kitchen pace (unchanged), then three tabs —
  **New** (a red count; a new order brings this tab forward with the sound), **Cooking**, **Ready** — and one card
  per order (`[data-online]`): a 60px band in the channel's own colour (`BAND`) with its label, number and how long
  it has waited; the customer with *Paid online* (green) or *Collect cash* (amber); the dishes with their counts in
  discs (unmatched ones in red, Map now); **Total** big with "payout ₹x after ₹y" under it; and one big button —
  **Accept** + **No** (the reject reasons) → **Food ready** → **Picked up**, with the kitchen order's link beside
  it. Today's online money is one line under the cards; the four stat tiles are gone.

- **Reject asks for a reason in a dialog** (`ReasonDialog`, chips: item unavailable, kitchen too busy,
  closing soon, too far). The browser prompt it replaced rejected the order on Cancel, and the action wrote
  `raw = { reason }` over the aggregator's payload (the guest's note, the fee, the discount); now the reason is
  added to it. Status changes and dish mapping report a refusal; a kitchen ticket that fails to print says so.
- **"Push rates" / "Push menu" say nothing was sent** (0100 `push_channel`): "Not sent — DineFlow does not
  connect to <channel> directly yet…". With a key saved they used to say "pushed … to Booking.com" — DineFlow
  makes no such call. The iCal copy states the real schedule: nightly at 2:30 am (the Vercel cron, which needs
  `CRON_SECRET`) and on Sync now — it said every 15 minutes.
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

- **Send test order posts to this server's own webhook** — the address comes from the request's host,
  not from the browser (it used to take `base` from the caller, which let anyone make the server fetch
  any URL), and the token must be one of the caller's own channels.
- **Sync now (OTA)** needs a signed-in user and runs only that property's feeds; see api-routes.md
  for the cron secret and the feed-URL rules.
- **The Swiggy band's ink is dark** (2026-10-18): white on Swiggy's orange (#fc8019) measured 2.55:1 in every theme;
  `#1f0f00` on it reads 7.5:1 and the band is still Swiggy's colour. Zomato's white on #e23744 is 4.3:1 and stays.

- **Flap numbers (2026-10-20)** — design-system.md, *Flap numbers*. Online orders: the New tab's count breathes (red) while orders wait to be accepted (`[data-new-count]`).

- **Delivery channel cards, redesigned (2026-10-21 — the owner: "messy").** Each order channel (`[data-oc]`) is now built
  like an OTA card: its initial in the platform's colour (`OC_HUE`: Swiggy orange, Zomato red, ONDC violet, website
  tint), name, commission · prep minutes · auto-accept, a Live / Draft badge; the webhook as one field (`[data-webhook]`)
  with Copy inside it and the address's end kept in view; last order or *No orders received yet*; and the footer strip
  (`CardStrip`: **Test order** · Push menu · Edit · Remove). Were outline buttons wrapping under a read-only input.

- **A dish the channel sent that is not on the menu is a callout** (`[data-unmatched]`, 2026-10-21): an icon tile, *n
  dish(es) not on your menu*, why it matters, and a red **Map now** pill (`[data-map-now]`) — was one wrapped line of
  red text with an underlined link.
