# Guest-facing pages (no sign-in)

**Routes** `/dine` · `/dine/[slug]` · `/dine/track` · `/book/[slug]` · `/queue/[slug]` · `/checkin/[token]` ·
`/pay/[token]` · `/record/[token]` · `/attend/[token]` · `/feedback/[slug]` · `/screen/[key]` · `/get` · `/offline`
**Files** `app/dine/**` · `app/book/[slug]` · `app/queue/[slug]` · `app/checkin/[token]` · `app/pay/[token]` ·
`app/record/[token]` · `app/feedback/**` · `app/screen/**` · `app/get` · `app/offline`
**Writes** `checkin_view`, `checkin_submit`, `dine_storefront`, `dine_discover`, `dine_order`, `dine_reserve`,
`dine_slots`, `dine_track`, `public_property`, `public_availability`, `public_book`, `queue_join`,
`queue_status`, `queue_leave`, `pay_link`, `pay_link_claim`, `pay_link_review`, `proof_open`, `dine_call`,
`dine_call_status`, `feedback_place`, `feedback_submit`, `screen_feed` (0103) (`dine_review` is closed to the API since 0098)

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
| `/feedback/[slug]` | a diner (`?t=` from the table card, or the printed feedback QR) | a private 1–5 rating, tags, a note, an optional phone |
| `/screen/[key]` | the TV by the counter | the menu and the parcel tokens (`?show=menu` / `tokens`); dark, no sign-in |
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

- **Batch 1 (0103, 2026-10-17).** On a table-QR visit (`atTable`) the Order tab opens with *Need something at T1?* —
  `TableCalls.tsx`: **Call waiter · Bill please · Water** (84px tiles), each turning orange "… asked for" and then
  green **On the way** once a waiter taps the badge on their floor; it asks `dine_call_status` every 15 s. Its
  messages are inline (`data-call-msg`): **public pages have no `ToastProvider`, so `useToast()` is a silent no-op
  here.** Under it, *How was your meal? Rate us* → `/feedback/[slug]?t=…`. The plain storefront has none of this.
- **`/feedback/[slug]`** (paper): five 64px stars first — one tap is an answer — then tags that follow the score
  (good ones from 4★, problems below), a note, name and phone (optional) and `GuestNotice`. Only the property reads
  it; 3★ or less raises the floor alert. **One visitor, five notes an hour (0109):** the server action
  (`app/feedback/actions.ts`) sends an HMAC-SHA256 of the visitor's address and today's IST date, keyed with
  `RATE_LIMIT_SECRET` (else `SUPABASE_SERVICE_ROLE_KEY`) — the database never holds the address and the hash changes
  daily; `feedback_ip_hits` keeps two days. With neither secret set there is no hash and only the per-place,
  per-table and per-phone limits apply. A script calling the API directly skips the action, so those limits stay. Title is a `div role=heading` (an `h1` takes the display font).
- **The TV polls `GET /api/screen/[key]`** (a route handler, session-free, in both route lists) — it polled a server
  action, whose id changes with every build, so a TV left on across a deploy froze on *Reconnecting…*. Twelve hours
  after loading it reloads itself, only when the server answers, to pick up a new build.
- **`/screen/[key]`** (dark, `h-dvh`, no scroll): menu pages turn every 12 s, tokens refresh every 8 s; a token
  that just became ready glows for 30 s (`.screen-fresh`, still under reduced motion). `lib/screen.ts` packs pages
  by rows — short categories share a page, a long one is cut "1/3" — so a dish is the same size on every page.
  The `main` grid needs `grid-rows-[minmax(0,1fr)]` or a full page runs off the bottom of the TV. A wrong or
  rotated key is a 404; while the page is up and its key stops working it says *Reconnecting…*. The key is a
  secret: it is shown only in Settings → Screens & feedback, never on a guest page.

- **A property whose trial or membership has ended takes nothing from the public** (0100): `dine_order`,
  `dine_reserve`, `queue_join`, `public_book`, `dine_storefront`, `dine_discover` and `public_property` test
  `membership_state_for(id) in ('trial','active')`. They read the `membership` column, which nothing ever sets to
  'expired', so a lapsed place kept taking orders its locked-out staff could not see.
- **The queue page finds its property** (0101 `queue_place(slug)`). It read `restaurants` with the visitor's
  anonymous key, got no row, and told every guest "This place isn't taking a queue right now" — on the live site
  too. A public page never reads a table directly: add an RPC (and grant it to anon on purpose — since 0098 new
  functions are not anon's by default).
- **The forms say who uses the details** (`components/legal/GuestNotice.tsx`; its privacy link is a 44px target by vertical padding with the same negative margin, so the line does not move): the order sheet and the table
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
  link with the message typed and no number), one line per kind of device and the manual. The packaged
  files (.apk, .exe): this device's own on the left, the others under *Other devices* (see the 2026-10-20 bullet
  below, shell-and-nav.md and docs/install-builds.md). The card flips with the theme like the sign-in page — it was dark-only, in fixed
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
- **The service worker never keeps or serves a redirected page** (v17, 2026-10-24, the owner's iPhone: "This site can't be
  reached — /login — ERR_FAILED"). Install used `addAll(SHELL)`, which follows redirects: signed out, `/dashboard`, `/`,
  `/orders`… all redirect to /login, so the login page was stored under each name, marked redirected, and Safari's engine
  (every browser on an iPhone) fails a navigation answered by a worker with a redirected response. Install now keeps a
  page only when it answered itself (`keep`), `put` skips redirected answers, the fallback skips a redirected copy
  (`copy`), and any navigation answer is rebuilt plain (`plain`). v17 deletes the v16 copies. Probe:
  `pw/sw89.mjs [old]` — a proxy that really drops connections (Playwright's `setOffline` in WebKit also cuts the
  worker off from its own cache, so every page "fails" there and it cannot test this). The deploys around the report
  were all READY and the live site answered 200 throughout; the one failure was on the phone's side.
- **A page never ends on the browser's error, the host's error or an endless load** (v18, 2026-10-24, the owner: "never
  show that error or loading issue"). A page load with no line gets its last copy, else the **reconnect page**; the
  host's 502/503/504 and no answer in 25 s get the reconnect page. That page lives inside `sw.js` (`reconnect`), so it
  shows with nothing cached — in the app's language (`df-lang`) and the theme's light or dark look (`df-theme`). It
  asks the free `/api/health` after 2, 3, 5, 8, 13 s and then every 15 s, at once on `online` and when the app comes
  to the front, and reloads the page as soon as the server answers. A page that fails again straight after
  (a real fault, not the line) stops after 4 tries in 2 minutes on "This screen is not answering" with Try again /
  Dashboard. `/login` is kept too. Probe: `pw/sw90.mjs` (9 checks, iPhone engine; screens in `s90/`). The one thing it
  cannot cover is a phone that has never opened DineFlow — there is no worker on it yet, so the browser's own page
  shows.
- **The service worker's install and activate never fail on storage** (`public/sw.js`). When the
  browser could not open its cache ("Failed to execute 'open' on 'CacheStorage'" — low space, private
  mode, a damaged profile) the precache rejected and the whole worker was discarded: no offline copy,
  no notification taps. A failed precache now only means nothing is cached yet. `pwa.mjs` asserts the
  worker reaches `active`.
- **/get shows this device's one way, then the others collapsed (2026-10-20).** The left half is InstallPanel with
  `others="none"`: only this device's way (installPlanFor — the .apk on an Android phone, the .exe on a Windows PC, Add
  to Home Screen on an iPhone/iPad, the browser's install on a Mac or other computer; never another platform's file).
  The right half keeps the QR and the WhatsApp link (SendInstallLink) and an **Other devices** `<details>`
  (`[data-devices]`, closed) with one row per *other* kind — Android (its .apk download, else "Chrome → Install"),
  Windows (its .exe, else "Edge → Install"), iPhone or iPad (Safari → Add to Home Screen), Mac/Chromebook/other (the
  browser's install) — the current device's own kind left out. See shell-and-nav.md for the rule table.
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

- **The queue page has a Back button, and Back never leaves the queue** (2026-10-20, the owner's "add a back option").
  `[data-queue-back]` (44px, top-left, in the page's paper style) goes back on this site when the guest came from it
  (same-origin `document.referrer` and history to go back to), else to the property's storefront `/dine/<slug>` —
  straight from the door QR there is nothing behind them. The place is kept: the device remembers its token in
  `localStorage` (`df-queue:<slug>`, wrapped in try/catch — a private window just loses the convenience), so scanning
  the code or opening `/queue/<slug>` again shows the place, not an empty form; a seated or left place is forgotten.
  Under Leave the queue, `[data-queue-kept]` says so in one muted line. Leave the queue still calls `queue_leave`.

- **The queue page keeps up and says it plainly (2026-10-21, the owner: "Table ready / Seat now show nothing until I
  refresh").** It asked `queue_status` every 20 s; now every 4 s while on screen and at once when the guest comes back
  to it (focus / visibility), never while hidden. A change to called or seated buzzes the phone once. Each state is one
  centred card (`[data-queue-state]`): **waiting** — place and wait on the flaps, then parties waiting · table for, with
  a live dot; **called** — a green card that pulses, a ringing bell, *You're up! Please come to the host stand*;
  **seated** — a green card, a tick, *Your table's ready*, the table on the flaps (centred — it sat at the left), *Show
  this to the host*. Animations `queue-pop`, `queue-ring`, `queue-call` (off under reduced motion). shots39: the page
  went called → seated by itself in 1.2–1.6 s.

- **No wait, no flap of words** (2026-10-21): with `minutes` 0 the estimate flap spelled "any minute" across nine tiles
  and ran off the screen. The estimate is on the flaps only when there is one (its finished word is *now*, which fits);
  with none, the place stands alone, centred, and the card says *Any minute now — stay close* (`[data-queue-soon]`).

- **The storefront's cover (2026-10-23, the owner: "a modern cover, by restaurant, resort or hotel").** `StoreCover.tsx`:
  with a photo (`photos[0]`) the photo drifts slowly (`.cover-drift`); without one, a drawn scene for `d.type`
  (`coverKind`; unknown → hotel if it has rooms, else restaurant) — a restaurant's table under pendant lamps with a
  steaming plate, a hotel tower lit against a city at dusk with the moon, a resort's palms on a setting sun over the sea.
  Sky as a CSS gradient, ground as a 2400-wide SVG anchored bottom (`xMidYMax slice`): a phone sees its middle, 1920 nearly
  all of it, so what matters sits between x 900 and 1500. Its colours are the art's own `--cv-*` (`.store-cover[data-kind]`
  in globals.css), seeded, so server and browser draw the same picture. On top: a glass Back (44px) and a kind pill; at
  the foot the name, tagline and glass chips — rating, cuisines, price for two **in whole rupees**, open now with a live
  dot (`[data-store-facts]`). `.store-cover-shade` darkens the foot and the left for the text. On a phone the page slides
  up over the cover's bottom edge (`main -mt-5 rounded-t-[26px]`). store.mjs: 43 checks, the three kinds × five widths.
- **Table calls, redesigned (2026-10-23).** Three tiles of 118px, each its own hue (waiter green, bill blue, water cyan):
  idle · **Sent · n min** with a ring (`.call-ring`) · **On the way**. A tap buzzes (lib/buzz.ts), sends, and opens a
  dialog (`[data-call-dialog][data-phase=sending|sent|again|done|error]`): what was asked, the table, when, and three steps
  — Request sent ✓, Staff alerted ✓, On the way (live, turns ✓ when a waiter answers). While it is open the page asks every
  5 s (else 15); a request turning done buzzes and says so inline. A second tap while open says *Already on it* and sends
  nothing (`again`). After 5 minutes unanswered: *wave to any of the staff*. calls.mjs: answered from the staff side, the
  dialog turned "on the way" in 0.3–0.9 s with no refresh.
- **Dish cards (2026-10-23; redrawn 2026-10-27 — + only, a drawn plate without a photo: see below).** `DishCard` + `AddControl` in StorefrontClient: the Indian food mark (green square + dot /
  red square + triangle), *Combo* / *Customisable* tags, the name in the body face (a `div role=heading` — `h3` takes the
  condensed display face), the price in whole rupees (`formatINR(…, { whole: true })` — a menu price), two lines of
  description; the photo 128/140px on the right with **ADD** (44px tall) riding its foot, the − n + stepper 44×44 buttons;
  without a photo Add sits under the text. Two columns from `md`. A dish not sold now is dimmed (its photo greyscale).
- **The queue buzzes on every update (2026-10-23, the owner).** Moved up a place → a double pulse and a blue line *You
  moved up — now number n* (*You're next in line* at 1); called → a long triple buzz, the `rush` tone, a green line and the
  tab title *🔔 You're up!*; seated → a double buzz and a chime (`[data-queue-update]`). `[data-queue-alerts]` turns it off
  per device (`localStorage df-queue-buzz`); on a phone not yet touched (reopened from the QR, where the browser blocks
  vibrate) it asks for one tap. **iPhones have no `navigator.vibrate`**: lib/buzz.ts ticks a switch-style checkbox's label
  instead (a haptic since iOS 18 — best effort, iOS may ignore it outside a tap; never on iOS 17 or older), and the chime is
  the dependable signal there. A hidden or locked page asks nothing, so it buzzes when it is opened — only Web Push would
  reach a pocket, and there is none.
- **The chosen party chip lagged (2026-10-23).** `[data-theme="paper"] .chip:hover` outranked `.chip.on`, and a phone keeps
  :hover after a tap, so the size just chosen stayed grey with white ink until the next tap elsewhere. Paper's chip rules
  are `.chip:not(.on)` now (the bright palette met the same trap — design-system.md). calls.mjs checks it with the mouse
  still on the chip.
- **The launch loader** (v19, 2026-10-24, the owner: "after the app is minimised it opens to a black screen — show the
  logo with a loading animation; never a black or blank screen, never a delay feeling"). A page (`bootable`: not a file,
  not /get/) the network has not answered in 0.9 s (`BOOT_AFTER`) is answered at once with `boot()` — emerald, the logo
  with a spinning ring, orbiting dots, a shimmer bar and status lines in the app's language; endless motion on transform
  and opacity only. The request goes on; its answer is held (`waiting`, keyed by URL, kept alive 30 s after it lands by
  `waitUntil`). The loader asks `/__df/ready?u=` (answered by the worker: ok / fail / wait after 20 s / gone) and reloads;
  the reload takes the held answer, so the page is fetched once. Nothing in 40 s → the reconnect page. It marks the launch
  (`df-splash`) so the in-app splash does not play after it. **Navigation preload is off** from v19: Safari's engine
  cancels a preload as soon as the event is answered with something else, so the held answer never landed and the loader
  spun (the first try). Probes: `pw/boot97.mjs` (9 — a proxy that holds pages 3 s: loader in ~1.3 s, the page by itself
  ~0.5 s after the server answers, fetched once; a quick page never sees it; no line → reconnect; the splash) and
  `pw/sw90.mjs` (9 — a silent server now ends on the reconnect page after ~41 s, through the loader).
- **Two more public pages (0140, 2026-10-24):** `/track/<token>` — the customer's delivery tracking — and `/ride/<token>` — the
  rider's page. Both in `PUBLIC_PREFIX` and `SESSION_FREE`, both English like /pay (the translation scan skips `track|ride`),
  both `noindex`. See online-and-channels.md, *Delivery tracking*.
- **A table's order could not be placed (fixed 2026-10-27, 0144).** Every order with an offer failed in `dine_order` with
  "operator does not exist: offer_scope = text" (since 0074) — at a dining offer, a table could never order — and the page
  said nothing: the error went to `useToast()`, which is silent here. Refusals are now said on the page, in red above the
  button (`[data-order-error]`, `[data-book-error]`); a database message nobody should read becomes "please try again, or
  ask a waiter" (`nice`). **The offer is the one the server takes:** a flat % or flat amount, on its `days` (0–6 from
  Sunday, 7 also Sunday) and between `from_time`–`to_time` IST, for this kind of order, the one taking the most off; a
  happy hour or a free item takes nothing off (the sheet showed "−₹20" for one, which the server never gave). GST to the
  paise, the total to the rupee, as the server rounds them — the probe checks the bar, the sheet and the server agree.
- **After ordering at a table the guest stays on the menu (2026-10-27, the owner: "show its status at the top, floating").**
  The basket empties, the sheet closes and `TableOrders.tsx` (`[data-table-orders]`) sticks to the top of the screen: the stage
  as a coloured tile and a headline (Order sent · In the kitchen · Cooking now · Ready — on its way · Served · enjoy! ·
  Couldn't take this order), the number (the order's once accepted, else the reference's tail), dishes, total and a five-step
  bar. It asks `dine_table_orders(slug, table code, ids)` (0144: both the table's code and the order's id are needed; ten ids,
  twelve hours) every 6 s while an order moves and the page is on screen, every 30 s once all are served; a change buzzes and
  opens the card for 9 s (a card the guest opened stays open). The phone keeps its ids in `localStorage`
  `df-table-orders:<slug>:<code>`; a served or refused order can be put away. The stage: no order yet → sent; its dishes —
  any cooking → cooking, all ready or served → ready, all served → served. Anywhere else (delivery, takeaway) the
  confirmation page stays, with its tracking link.
- **The basket survives Back (2026-10-27).** `sessionStorage` `df-basket:<slug>:<code>` keeps the lines (by id, size, add-ons),
  the name, phone, note, address and whether the sheet was open, so the privacy page, the browser's Back or a reload bring the
  guest back to the same basket. **The privacy link carries `?from=`** (GuestNotice is a client component now) and the legal
  pages' Back returns there — see legal.md. The cover's Back to the directory is gone at a table.
- **The storefront redrawn for the table (2026-10-27, the owner's screenshots: "not looking good").** **Dish cards**: the food
  mark (and Combo, and "n in basket"), the name, the description, the price at the foot; a dish with choices says what it asks
  (`[data-dish-options]`, "Choose · 2 sizes · add-ons" — a tap opens the chooser); on the right always a picture — the photo or,
  without one, **`DishArt.tsx`** (`[data-dish-art]`): the dish's kind drawn on a plate (`glyphFor`, as Menu's cards) on a veg-green
  or non-veg-amber wash, garnish dots placed from the name; **+ only** — a 44px round tint key on the picture's corner
  (`[data-dish-add]`, no "ADD"), the − n + stepper centred under it once added; a dish with choices is never added blind.
  **The basket bar** (`[data-basket-bar]`): one 68px capsule in the page's ink — the bag with the count on a badge, the total
  large and "You save ₹n" under it, **View order** as its own tint key; hidden while the sheet is up. **The order sheet**
  (`[data-order-sheet]`): the table as a green card (or Delivery · Takeaway), each line a card with the food mark, price and a
  44×44 stepper (a bin at one), Add more; the bill on its own panel, To pay large with the saving as a chip; Your details
  with icons (`type=tel`, autocomplete); the kitchen note with five one-tap notes (`[data-quick-notes]`); how to pay; and
  **Place order** with the total on it, pinned at the foot by the Sheet's own footer (it must stay the sheet's last child).
- **The call tiles go back to plain (2026-10-27, the owner).** An answered call shows *On the way* on its tile for a minute
  after `done_at`, then the tile is plain and ready for the next ask (`now` ticks every 5 s). Bill and Water ring on the
  floor exactly as the waiter does (they always did: one `service_calls` INSERT, one CallAlert card per kind).
