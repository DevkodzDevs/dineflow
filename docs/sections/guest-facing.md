# Guest-facing pages (no sign-in)

**Routes** `/dine` · `/dine/[slug]` · `/dine/track` · `/book/[slug]` · `/queue/[slug]` · `/checkin/[token]` ·
`/pay/[token]` · `/record/[token]` · `/get` · `/offline`
**Files** `app/dine/**` · `app/book/[slug]` · `app/queue/[slug]` · `app/checkin/[token]` · `app/pay/[token]` ·
`app/record/[token]` · `app/get` · `app/offline`
**Writes** `checkin_view`, `checkin_submit`, `dine_storefront`, `dine_discover`, `dine_order`, `dine_reserve`, `dine_review`,
`dine_slots`, `dine_track`, `public_property`, `public_availability`, `public_book`, `queue_join`,
`queue_status`, `queue_leave`, `pay_link`, `pay_link_claim`, `pay_link_review`, `proof_open`

## What it is

Everything a member of the public touches. A guest scans a table QR and orders; a traveller books a
room; a walk-in joins the queue; a customer pays a link; a bank opens a business record; a new
owner installs the app.

| Route | Who opens it | What it does |
| --- | --- | --- |
| `/dine/[slug]` | a diner with a table QR | the storefront: menu, order, reserve, review |
| `/dine/track` | the same diner | where their order is |
| `/book/[slug]` | a traveller | the room booking engine |
| `/queue/[slug]` | a walk-in | join the queue, see the wait |
| `/checkin/[token]` | a hotel guest, or the desk's tablet (`?kiosk=1`) | check in online before arriving |
| `/pay/[token]` | a customer | pay one bill by link |
| `/record/[token]` | a bank, a landlord | a sealed business record (see [reports](reports-and-forecast.md)) |
| `/get` | a new owner | install the app |
| `/offline` | anyone | the service-worker fallback |

## How it works

**These pages are session-free, and that is enforced in two places.** `middleware.ts` lists them in
`SESSION_FREE` and returns early **before** any auth work:

```ts
const SESSION_FREE = ["/legal", "/dine", "/book/", "/queue/", "/record/", "/pay/", "/get", "/offline"];
if (SESSION_FREE.some((x) => path === x || path.startsWith(x))) return NextResponse.next({ request: req });
```

They are also in `PUBLIC_PREFIX`, so nothing redirects them to `/login`. Before this, a guest on
restaurant wifi paid an auth round trip to fetch a session nobody read.

**Every read is a `security definer` RPC** that takes a slug or a token and returns only what the
public may see. There is no table access from these pages — RLS would refuse an anonymous caller
anyway, which is the belt to the RPC's braces.

**Tokens are capabilities.** `/pay/[token]` and `/record/[token]` are unguessable and revocable.
`pay_link_claim` is the write; it must be idempotent, because a guest will double-tap.

**Payments run on the property's own gateway keys.** DineFlow is not the merchant of record for a
guest's meal. See [legal.md](legal.md) and [settings.md](settings.md).

**Online check-in** (`/checkin/[token]`, migration 0081). Every booking has a `checkin_token`.
`checkin_view` returns that booking only — dates, room type, the guest's own details, the last four
of their phone — and no internal ids; a wrong token, or a booking already checked in or closed,
returns nothing and the page says the link has expired. `checkin_submit` validates everything
server-side (name, address, one of five ID types, **exactly four characters of the ID — never the
whole number**, optional email and HH:MM arrival, a confirmation tick) and may be sent again. A
nationality other than Indian brings up the Form C note. `?kiosk=1` is the desk's tablet: the
finish screen only asks for the tablet back. Paper theme (`app/checkin/layout.tsx`), like the queue.

**What Google reads.** `/dine/[slug]` renders a `<script type="application/ld+json">` from
`restaurantLd` (`lib/schemaorg.ts`, 3 tests): a schema.org `Restaurant` with only what the page
already shows — cuisine, address, phone, photos, hours, price for two, rating — plus a
`ReserveAction` (`?tab=book`) and an `OrderAction` (`?tab=order`) when those are switched on.
`ldJson` escapes `<`, so a name cannot close the script tag. **Not on a table-QR visit** (`?t=`).

**Kitchen pace on the storefront.** `dine/[slug]/page.tsx` fetches `dine_busy(slug)` and the
Order tab shows a red *Not taking online orders right now. Back at …* or an orange *The kitchen is
busy* banner. Neither shows on a table-QR visit (`tableToken`), because those orders are never
paused. The banner is a courtesy; `dine_order` enforces the pause itself. See
[online-and-channels.md](online-and-channels.md).

## Before you edit

- **Adding a route here means adding it to both `SESSION_FREE` and `PUBLIC_PREFIX`.** Miss the first
  and it works but is slow for the guest; miss the second and it redirects to `/login`.
- **Nothing on these pages may need JavaScript to read the essentials.** A guest on a bad connection
  must still see the menu and the price.
- **Assume the oldest phone in the restaurant.** These are the only screens in the app where that is
  the typical device rather than the edge case.
- **Never render a tenant id, a gateway key or an internal id into these pages.**
- **`/get` and `/offline` are part of the PWA.** Changing the service worker
  (`components/ServiceWorker.tsx`) can strand installed users on a cached build.

## Verify

```
node legal-shot.mjs      # 18 checks — includes that these paths make no auth call
node design-test.mjs     # the phone widths
```

Confirm by hand: `/legal/terms` and `/get` return 200 with **no** auth round trip, while
`/dashboard` still gates.

## See also

[auth-and-session.md](auth-and-session.md) · [settings.md](settings.md) · [legal.md](legal.md) ·
[api-routes.md](api-routes.md)
