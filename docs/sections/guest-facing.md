# Guest-facing pages (no sign-in)

**Routes** `/dine` · `/dine/[slug]` · `/dine/track` · `/book/[slug]` · `/queue/[slug]` · `/checkin/[token]` ·
`/pay/[token]` · `/record/[token]` · `/attend/[token]` · `/get` · `/offline`
**Files** `app/dine/**` · `app/book/[slug]` · `app/queue/[slug]` · `app/checkin/[token]` · `app/pay/[token]` ·
`app/record/[token]` · `app/get` · `app/offline`
**Writes** `checkin_view`, `checkin_submit`, `dine_storefront`, `dine_discover`, `dine_order`, `dine_reserve`,
`dine_slots`, `dine_track`, `public_property`, `public_availability`, `public_book`, `queue_join`,
`queue_status`, `queue_leave`, `pay_link`, `pay_link_claim`, `pay_link_review`, `proof_open` (`dine_review` is closed to the API since 0098)

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
| `/attend/[token]` | a labourer, on their own phone | punch in/out by fingerprint or selfie — see [staff-and-labour.md](staff-and-labour.md) |
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
finish screen only asks for the tablet back. Paper theme (`app/checkin/layout.tsx`), like the queue. The form is
three white section cards — About you · Your ID · Your arrival — plus the agreement card: on the bare
paper page a paper field (`#f1f1ec`, 6% border) had no visible edge at all. Fields inside `.ci-form`
get a 16%-ink border and a tint border on focus (`globals.css`). The page is paper whatever the
app's theme cookie says, so dark and paper visitors see the same form.

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

- **A property whose trial or membership has ended takes nothing from the public** (0100): `dine_order`,
  `dine_reserve`, `queue_join`, `public_book`, `dine_storefront`, `dine_discover` and `public_property` test
  `membership_state_for(id) in ('trial','active')`. They read the `membership` column, which nothing ever sets to
  'expired', so a lapsed place kept taking orders its locked-out staff could not see.
- **The queue page finds its property** (0101 `queue_place(slug)`). It read `restaurants` with the visitor's
  anonymous key, got no row, and told every guest "This place isn't taking a queue right now" — on the live site
  too. A public page never reads a table directly: add an RPC (and grant it to anon on purpose — since 0098 new
  functions are not anon's by default).
- **The forms say who uses the details** (`components/legal/GuestNotice.tsx`): the order sheet and the table
  booking on the storefront, `/book`, `/queue` and `/checkin` — "<Property> uses your details for this order.
  DineFlow runs this page for them — how your details are looked after" (→ /legal/privacy).
- **Library dish photos are credited** on the storefront: `dine_storefront` sends `image_credit`; the photo
  carries "Illustrative · <author> · <licence> · Wikimedia Commons" (CC BY / BY-SA require it) and the full text
  as its title.
- **Limits on the public writes** (0098, 2026-10-13 — see [data-and-rls.md](data-and-rls.md)). An order
  needs a phone number with at least eight digits; ten orders an hour per number and 300 an hour per
  place, at most 100 lines and 99 of a dish. A table booking: five a day per number, 60 an hour per
  place. The queue: three joins an hour per number, 150 an hour per place. A room booking: a name and a
  phone, three a day per number, twenty an hour per property, up to 30 nights starting within two
  years, and never on dates the page shows as stop-sell or sold out. Track: ten misses an hour for a
  number and it stops answering (reservation numbers count up from 1). Each refusal says what to do —
  usually "please call". Text is cut to length (name 80, phone 20, note 500, address 300).
- **`/book/[slug]` takes bookings again** (0098): `public_book` raised "no restaurant context for
  next_number" for every guest since the counter needed a signed-in property.
- **There is no review form on the storefront**, and `dine_review` is closed to the API (0098): it took
  unlimited unverified reviews for any listed place. A guest reviews after paying, by the bill's link
  (`pay_link_review`, one per order).
- **A card payment settles the bill only once Razorpay has captured it** (`/api/pay/[token]/verify`):
  an *authorized* payment is captured there first; if it stays authorized the guest is told it will
  show as paid in a minute (the `payment.captured` webhook settles it).
- **On a phone the address and phone are one contact card** (`sm:hidden`): a row with a map pin, the
  address on up to two lines and "Directions" (Google Maps search for the name and address), and a row
  with the number and a Call pill, each at least 60px tall. Side by side they both wrapped mid-line.
  From `sm` the original single line returns (`hidden sm:flex`).
- **Party-size chips are at least 44px wide** (`min-w-11`) — "1" was 34px. **The phone number under
  the address is a 44px target** (`py-3 -my-3`), the row's height unchanged; it was 20px tall.

- **Adding a route here means adding it to both `SESSION_FREE` and `PUBLIC_PREFIX`.** Miss the first
  and it works but is slow for the guest; miss the second and it redirects to `/login`.
- **Nothing on these pages may need JavaScript to read the essentials.** A guest on a bad connection
  must still see the menu and the price.
- **Assume the oldest phone in the restaurant.** These are the only screens in the app where that is
  the typical device rather than the edge case.
- **Never render a tenant id, a gateway key or an internal id into these pages.**
- **Installing needs nothing published.** `/get` is the link to hand anybody. Its left half is
  `InstallPanel` (see [shell-and-nav.md](shell-and-nav.md) — the same as the in-app sheet): the browser's
  one-tap button where it has offered it, its menu's taps where it has not, **one tap to Edge** (Windows) or
  **to Chrome** (Android, from inside Instagram or Facebook too) from a browser that cannot install, and the
  drawn Share → Add to Home Screen steps on an iPhone or iPad. Its right half is for whoever sets up the
  other devices: a QR for the next phone, **Share / WhatsApp / Copy link** (`SendInstallLink` — a `wa.me`
  link with the message typed and no number), one line per kind of device, the packaged files when hosted
  (Windows .exe, Android .apk — underneath, never the headline: the exe raises an unsigned-installer
  warning) and the manual. The card flips with the theme like the sign-in page — it was dark-only, in fixed
  hex colours — one column on a phone, two from `lg`.
- **The manifest and the apple-* tags are written into `<head>` by the root layout**, not through
  `metadata`: Next 15 streams metadata into `<body>` for an ordinary browser on a dynamic page, and
  Chrome (manifest) and Safari (apple-touch-icon, apple-mobile-web-app-*) only read `<head>`. Chrome's
  installability check said `no-manifest` on `/get` itself until this moved. The manifest has an
  `id`, `standalone`, a maskable icon, four shortcuts (New order, Kitchen, Front desk, Billing), a
  description for restaurants *and* hotels, **six screenshots** (`public/screenshots/`: three wide 1440×900 —
  control room, till, front desk — and three narrow 824×1830 — control room, till, kitchen; Chrome shows them
  in its richer install dialog on a computer and on a phone) and `related_applications` (`webapp`, so Chrome
  on Android can answer `getInstalledRelatedApps()`). `prefer_related_applications` is false — true would
  stop Chrome offering the install at all. The screenshots are throwaway demo properties in the dark theme
  (`manifest-shots.mjs`, which deletes them after); retake them when those screens change, and only ever of
  a demo — they are public. Probes: `install-probe.mjs`, `pwa.mjs`.
- **An installed app belongs to one address.** dineflow.cloud answers with a 308 to www.dineflow.cloud, so
  installs happen on www. Swapping which name redirects to which later would leave every installed app
  opening a redirect — settle the main address before customers install.
- **The service worker never touches Next.js page data** (`?_rsc=`, the `RSC` /
  `Next-Router-State-Tree` headers), v16, 2026-10-12. Served stale-while-revalidate it showed live
  screens the previous answer and, after a deploy, handed the new build the old build's page data —
  Next.js answers that with a full reload, so every open tab "refreshed itself" within a minute of
  each update. Bump `V` whenever what the worker caches changes, so old entries are dropped.
- **The service worker's install and activate never fail on storage** (`public/sw.js`). When the
  browser could not open its cache ("Failed to execute 'open' on 'CacheStorage'" — low space, private
  mode, a damaged profile) the precache rejected and the whole worker was discarded: no offline copy,
  no notification taps. A failed precache now only means nothing is cached yet. `pwa.mjs` asserts the
  worker reaches `active`.
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

- **`/book/[slug]` loads the Supabase client on demand** (a dynamic import inside `sb()`), not at the
  top of `BookClient` — both calls run after paint, and the static import put ~63 kB of auth and
  realtime code in front of the first paint of a page guests open on their phones (217 → ~150 kB).

- **Dish photos on the storefront (0088).** `dine_storefront` sends `image_url` per dish. A dish with a
  photo shows it on the right (112px, 128 from `sm`, rounded) with *Add* / the − n + stepper riding its
  bottom edge, the way delivery apps lay it out; a dish without one keeps the old row. Photos are lazy
  loaded. See menu.md for where they come from and how they are credited.
