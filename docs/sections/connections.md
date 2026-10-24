# Connections — every outside link in one place

**Route** `/connections`
**Files** `app/(app)/connections/page.tsx` · `ConnectionsClient.tsx` · `actions.ts`
**Reads** `order_channels` (named columns, never `api_key`), `ota_channels`, `room_types`, `payment_gateways` (the owner only —
RLS), `profiles` (who holds the grant; who rides), today's `online_orders`, `ota_sync_log`
**Writes** through the screens it gathers: `saveChannel` / `deleteChannel` / `sendTestOrder` / `pushChannel` (Online orders,
Channels), `saveOta` / `deleteOta` (Channels), `savePayments` (Settings), `setOnlineTaking` (0133); its own `setTracking`
(`restaurants.delivery_tracking`, 0140) and `testGateway` (one read of the Razorpay account with the saved keys)

## What it is

The owner's one page for everything outside the property (2026-10-24, the owner: "all the links — Swiggy, Zomato, the room
sites, Razorpay, the rider's live tracking — in one page, easy, owner only, and the owner gives a manager access"). Six blocks,
each with what to paste where and one button that proves it works:

1. **Food delivery apps** — Swiggy, Zomato, ONDC, the website. A *Connect X* tile for each not yet connected (a kind that
   exists loses its tile; *Another app* stays); each channel a card with its webhook address (`[data-link-field=webhook]`,
   Copy inside), today's orders and takings, and a strip: **Test order** · Push menu · Edit · Remove. The Taking / Not taking
   orders switch sits in the head (`OnlineSwitch`).
2. **Room booking sites** (hotel and resort only) — Booking.com, MakeMyTrip / Goibibo, Agoda, Airbnb, Expedia, any iCal. Each
   card: your calendar link to paste on their extranet (`[data-link-field=cal-link]`), whether theirs is pasted, the sync
   state; **Sync** · Push rates · Edit · Remove; *Sync all* and a link to Rates in the head; the last three sync-log lines.
3. **Payments** — how a guest pays in three steps (the bill's UPI QR, the pay link, the webhook), the Razorpay webhook address
   to paste (`[data-link-field=rzp-webhook]`), and for the **owner** the form (`[data-pay-form]`: UPI ID, payee, Key ID, Key
   secret, Webhook secret — the secrets write-only, as in Settings) with **Test keys** (`[data-test-keys]`, `testGateway`: a
   `GET /payments?count=1` with the saved keys; "Keys work" or Razorpay's refusal). A manager sees the state and *Only the
   owner can change payment keys* (`[data-pay-readonly]`) — the gateway row is owner-only by RLS and the page never gets
   the secrets anyway (booleans only). The state chip: Razorpay ready / Secret missing / not set up (`[data-pay-state]`).
4. **Delivery tracking** — the switch (`[data-tracking-state]`, `setTracking`), the three steps, *See the customer's page*
   (`/track/demo`) and *See the rider's page* (`/ride/demo`), and **Your riders** — the staff whose position is Delivery
   Rider or whose team is delivery (`[data-riders]`). See [online-and-channels.md](online-and-channels.md), *Delivery
   tracking*.
5. **Your public links** — `GoogleLinks` (the storefront's), Join by QR, Table QR codes, Screens & feedback; an amber note
   when the property is not listed publicly.
6. **Who can open this page** (`[data-who]`) — the owner, and each person holding the grant.

The **health strip** on top (`[data-conn-health]`, `.fill-tiles`): Food apps (live of total), Room sites (failing / live),
Payments (ready / secret missing / UPI only / not set up), Delivery tracking (on with N riders / off), Public page (listed /
hidden / no address). A tile scrolls to its block.

## Access (0140)

`profiles.grants text[]` — what the owner has given one person beyond their sections: `'connections'`, `'reports'`.
`_grant_allowed(me, g)`: the owner always; anyone else with the grant. `staff_set_grant(p_user, p_grant, p_on)`: **the owner
only**, for anyone below the owner. `session_bundle` carries `grants`; `hasGrant` / `connectionsAllowed` / `reportsAllowed`
in `lib/auth.ts` say the same. The app layout sends anyone else home with `?locked=connections` (Connections is no module —
no row in `role_modules`, no tick in Access); the menu row (`sections.ts` `grant: "connections"`, `rowsFor`), the phone bar,
Go to and `G X` all follow the same rule. The owner switches it in **Staff → Access** on a manager or a supervisor
(`[data-grant-switch=connections|reports]`, saved at once like Assist).

## Before you edit

- **The forms and actions are the ones Channels, Online orders and Settings use.** A field added to a channel belongs in
  both sheets, or they drift. `keyOf` (both actions files) keeps a saved API key on a blank field.
- **Nothing secret reaches the browser**: `has_api_key`, `hasSecret`, `hasWebhook`. Keep it so.
- **Test keys calls Razorpay from the server** with the owner's keys; it never stores or charges anything.
- **Push menu / Push rates still say nothing was sent** without a certified partner link (0100) — the page repeats the
  route's message, it does not promise more.
- **The demo sandbox ships without Online orders switched on** (`enabled_modules`): a probe nulls it first.

## Verify

```
node pw/conn140.mjs      # 38 checks — a demo restaurant and resort; connect, test order, send out, the rider's and the
                         # customer's pages, Reports' departments and downloads, the grant switch, a manager with and without
pnpm --filter @dineflow/web typecheck
```

## See also

[online-and-channels.md](online-and-channels.md) · [reports-and-forecast.md](reports-and-forecast.md) ·
[staff-and-labour.md](staff-and-labour.md) · [settings.md](settings.md) · [guest-facing.md](guest-facing.md)
