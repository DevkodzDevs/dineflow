# DineFlow — Setup Guide

Hospitality SaaS for restaurants, hotels and resorts: pantry, kitchen, orders, billing, rooms, front desk, housekeeping, facilities, one live control room per property — and a Master control for you over every client.
Web app for owners/managers/cashiers/front desk · native Android + iOS app for waiters, kitchen, housekeeping, owner.

> Rule for this repo: **every change is recorded in the Changelog at the bottom of this file.**

---

## 1. What's inside

```
dineflow/
├── apps/web/            Next.js 15 admin + POS + kitchen display (desktop, tablet, mobile web)
├── apps/mobile/         Expo (React Native) app — Android & iOS
├── packages/shared/     Roles, statuses, bill maths, zod schemas (used by both apps)
├── packages/db/         Drizzle schema (types + migrations tooling)
└── supabase/migrations/ 0001 core · 0002 hotel + master + membership · 0003 scan + labour + invoices · 0004 offline + printers + channels
└── design/             rendered UI mockups (v1 + v2)
```

One backend (Supabase) serves both apps. A waiter's order placed on a phone appears on the kitchen screen the same second (Supabase Realtime).

---

## 2. Create the Supabase project (10 min)

1. https://supabase.com → **New project**. Pick region **Mumbai (ap-south-1)** for Tamil Nadu latency.
2. Left menu → **SQL Editor** → New query → paste the full contents of `supabase/migrations/0001_init.sql` → **Run**.
   It creates every table, row-level security, per-restaurant numbering, stock auto-deduction and realtime.
3. **Authentication → Providers → Email**: keep enabled.
   For development, turn **off** "Confirm email" so sign-ups log in instantly. Turn it back on before launch.
4. **Project Settings → API**: copy `Project URL` and `anon public` key. You'll paste them into both apps.

### How the data is protected
- Every table has a `restaurant_id`. A Postgres policy (`tenant_all`) lets a user see only rows for the restaurant in their profile. There is no way to read another restaurant's data from a client.
- Money-critical operations (`place_order`, `generate_bill`, `settle_bill`, `close_day`) are Postgres functions, so the maths is identical whether an order comes from web or mobile.
- Selling a dish inserts negative rows in `stock_ledger` for each recipe ingredient (trigger `consume_recipe`). Cancelling an item reverses it. `ingredients.current_stock` is always the sum of the ledger.

---

## 3. Run the web app

Requires Node 20+ and pnpm 9 (`npm i -g pnpm`).

```bash
pnpm install
cp apps/web/.env.local.example apps/web/.env.local   # paste URL + anon key
pnpm dev:web                                          # http://localhost:3000
```

First run:
1. Open http://localhost:3000/signup → enter your name, restaurant name, email, password.
   You become **Owner**. 5 categories and 8 tables (T1–T8) are created for you.
2. **Menu** → add dishes. Tap the flask icon on a dish to map its recipe (ingredient + qty per plate).
3. **Pantry** → add ingredients, then **Record purchase** (or an opening balance via the adjust icon).
4. **Staff** → Invite staff → pick a role → share the 8-letter code. Staff open `/join` (web) or the mobile app and enter it.
5. **Settings** → GSTIN, address, GST rate (default 5%), service charge, more tables/zones.

Daily flow: **Orders** (tap a table → POS → Send to kitchen) → **Kitchen** (Start cooking → All ready) → **Billing** (Generate bill → take payment, split allowed) → end of day **Close day**.

### Roles
| Role | Web pages | Mobile tabs |
|---|---|---|
| owner | everything the property type has | Control, Rooms*, Orders, Kitchen, Pantry |
| manager | everything except Settings | same |
| cashier | Orders, Billing, Reports, Front desk | Orders |
| waiter | Orders | Orders |
| chef | Kitchen | Kitchen |
| store | Pantry | Pantry |
| frontdesk* | Front desk, Rooms, Guests, Facilities, Housekeeping | Rooms |
| housekeeping* | Housekeeping, Rooms | Rooms |

\* hotel / resort only. Modules per property type live in `MODULES_BY_TYPE`, roles in `ROLE_ACCESS` (`packages/shared/src/constants.ts`); `modulesFor(type, role)` drives the sidebar and the mobile tabs.

### Three levels of control
1. **Master control** (`/admin`, you) — every client property, trial/membership state, sales, users; extend trial, activate, suspend, issue keys, audit log. Access = your user id in `platform_admins`.
2. **Property control** (client owner) — control room + all modules of their property type; invites staff; enters the membership key.
3. **Staff** — role-limited screens on web and mobile.

### Trial → membership (two-stage login)
- Sign-up creates the property with `membership = 'trial'` and `trial_ends_at = now() + 7 days`.
- `membership_state()` (Postgres) returns `trial | active | expired | suspended`; the web layout and mobile gate call it on every load. Expired/suspended → `/membership` (web) or the lock screen (mobile). Nothing is deleted.
- Owner redeems a key (`redeem_membership`) → `active` for 30/365 days; keys are issued only by master admins (`admin_issue_key`) and can be locked to one property.
- Razorpay auto-renewal is the planned next step; the schema already has `membership_plan / membership_ends_at`.

### Hotel & resort flow
Booking (`create_booking`, blocks double-booking by date) → `check_in` (room → occupied, guest visits +1) → charges land on the **folio** (`booking_charges`): room nights + room GST computed by `folio_totals`, restaurant orders via `post_order_to_room` (with dining GST), facilities via trigger, extras/discounts by hand → `check_out` (needs balance paid; room → cleaning; housekeeping task created) → housekeeping marks done → room → available.

### Deploy web
Vercel: import the repo, set **Root Directory** = `apps/web`, add the two env vars. Build command is auto-detected (`next build`). Any Node host works too (`pnpm build && pnpm --filter @dineflow/web start`).

---

## 4. Run the mobile app (Android + iOS)

```bash
cp apps/mobile/.env.example apps/mobile/.env          # paste URL + anon key (EXPO_PUBLIC_*)
pnpm dev:mobile                                       # starts Expo
```
- Scan the QR with **Expo Go** (Play Store / App Store) on the same Wi‑Fi — instant preview on a real phone.
- Sign in with the owner account or join with an invite code.

### Build installable apps
```bash
npm i -g eas-cli && eas login
cd apps/mobile
eas build:configure
eas build -p android --profile preview     # → .apk you can share on WhatsApp
eas build -p ios --profile preview         # needs an Apple Developer account
eas build -p android --profile production  # .aab for Play Store
```
Bundle ids are `in.dineflow.app` (change in `app.json` before the first store build).
Icons in `assets/` are solid placeholders — replace `icon.png` (1024×1024) and `splash.png`.

### Tablet as kitchen display
Sign in as a **chef** on an Android/iPad tablet; the Kitchen tab switches to a 3-column layout at ≥768 px. Keep the screen awake in device settings.

---

## 5. Design system (for future changes)

Tokens live in `apps/web/app/globals.css` (`@theme`) and `apps/mobile/lib/theme.ts` — keep them identical.

| Token | Value | Use |
|---|---|---|
| porcelain | `#f7f8f6` | page background |
| ink | `#14261f` | text, sidebar, occupied tables |
| saffron | `#e8a33d` | primary action, "cooking" |
| mint | `#8fd3b6` | ready / healthy |
| chili | `#d6453a` | late tickets, low stock, wastage |
| steel | `#6b7a75` | secondary text |

Type: **Fraunces** (headings, big numbers) · **Manrope** (UI) · **JetBrains Mono** (money, ticket numbers, receipts).
Signature elements: the **KOT ticket** with a perforated top edge (`.ticket`) and the **key card** for rooms (`.keycard`, dark when occupied). v2 adds glass surfaces (`.glass` top bar), an ambient aurora behind each page title (`.aurora`), grouped sidebar (Hotel / Dining / Manage) and italic champagne accents in headings (`<em>`).
Motion: one staggered reveal per page, spring sheets, tickets animate between kitchen columns. `prefers-reduced-motion` is respected.

Breakpoints (web): phone < 768 (bottom nav, sheets slide up, POS cart as bottom bar) · tablet 768–1279 (sidebar, 2-col grids) · desktop ≥ 1280 (3-col grids, POS side cart).

---

## 6. Common problems

| Symptom | Fix |
|---|---|
| "not signed in" from an RPC | Session cookie missing — sign out/in. On mobile check `.env` keys start with `EXPO_PUBLIC_`. |
| Kitchen doesn't update live | Database → Publications → `supabase_realtime` must include `orders, order_items, kots, dining_tables, ingredients, bills`. The SQL does this; re-run that block if the project was created before. |
| Stock didn't drop after a sale | The dish has no recipe mapped (Menu → flask icon). |
| Bill total differs from expectation | GST is applied on (subtotal − discount + service charge). Change rates in Settings. |
| Expo: "Unable to resolve @dineflow/shared" | Run `pnpm install` at the repo root (not inside apps/mobile). `metro.config.js` already watches the monorepo. |
| Email confirmation loop | Disable "Confirm email" in Supabase Auth for dev. |

---

## 7. Roadmap (not in v1.0)
- Razorpay subscription per restaurant (plan column already exists on `restaurants`)
- Bluetooth/USB thermal printer for KOT + receipt (web has print-ready receipt CSS)
- Offline order queue on mobile (retry `place_order` when back online)
- Dish photos (Supabase Storage → `menu_items.image_url`)
- WhatsApp bill to customer, customer-facing QR menu

---

## Changelog

### v15.0.0 — the storefront: table booking and online ordering
- **Public pages** (no login, anon RPCs): `/dine` discovery searching names, cuisines *and dish names*, with mode filter, offer chips, rating and price for two. `/dine/[slug]` storefront with photos, offers, **Book a table** and **Order online** tabs, menu with veg marks, reviews with owner replies. `/dine/track` looks up an order or booking by reference + phone.
- **Table booking**: `dine_slots` builds slots from opening hours, counts seats already taken in the surrounding window, hides past times, marks full ones and attaches any offer active then — so a happy hour shows as a badge on those slots. `dine_reserve` re-checks capacity before writing.
- **Online ordering**: `dine_order` validates against the live menu, enforces the minimum, applies the best eligible offer, adds delivery/packing and GST, and writes into the existing **Online orders** screen via the `website` channel, so Accept & print, KOT and stock deduction work unchanged.
- **Property side**: new **Reservations** screen (arriving / at the table, seat-at-a-table which occupies the floor table, phone bookings, no-show, review replies) and **Settings → Storefront & offers** (listing switches, cuisines, photos, hours and slot length, delivery economics, offers, QR of the public link).
- `offers`, `reservations`, `reviews` (+ trigger keeping `restaurants.rating` current). `seed_storefront()` lists the six sample properties with cuisines, offers and reviews.
- SQL `0015_dining_storefront.sql`. Build: 55 routes, `/dine` 167 kB first load.


### v14.0.0 — sample estate: six properties with their own logins
- `install_sample_estate()` creates two restaurants, two hotels and two resorts, each with an auth user (`demo_user`) and owner profile, all in one district with Neighbours sharing on — six contributors, exactly the k-anonymity minimum, so the price index and area signal show real figures.
- `seed_property(rid, days)` fills one property: menu with recipes, pantry with weekly **priced** purchases (varied per property so the median is meaningful), tables, 60 days of back-dated orders/KOTs/items/bills/payments with weekday seasonality, two live kitchen orders, a waiting online order with an unmapped line, labour with a month of attendance and a payment, printer, channels; hotels/resorts also get rooms, rates, past stays, one in-house guest, one arrival, a cleaning and a maintenance room; resorts get facilities. Ends by sealing closed months so Proof of business is verified.
- Master control gains **Sample estate** and **New property**; the empty state explains itself instead of sitting blank.
- `SAMPLE-LOGINS.md` lists every credential plus the SQL to delete them before going live. TEST-GUIDE Part 0 rewritten around the estate.
- SQL `0014_sample_properties.sql`.


### v13.0.0 — Master control can create a property; TEST-GUIDE added
- `admin_create_property(name, type, demo)` — Master control creates a property, sets itself acting on it, and optionally seeds demo data. A fresh install is no longer a dead end: the empty Master table now explains itself and offers **Create a property**.
- `TEST-GUIDE.md` — a 60-minute checklist with a "you should see" line per step, covering load, the restaurant cycle, the hotel cycle, offline, printing, online orders, scanning, the three signature features, the phone app, and memberships, plus a failure triage table.
- SQL `0013_master_create_property.sql`.


### v12.2.0 — both apps verified side by side
- **Mobile checked for the first time**: Expo deps installed, `tsc` 2 → 0 errors, Metro bundle for Android succeeds (2,978 modules → 6.4 MB Hermes bytecode). A real APK still needs the Android toolchain or EAS (launcher → 5).
- Fixes the first run would have hit: `@expo/metro-runtime` added (expo-router peer); `@zxing/library` added (zxing/browser peer); `segments[1]` tuple typing in the auth gate; `act()` accepts PromiseLike so Supabase builders type-check.
- **Monorepo layout**: `.npmrc` with `shamefully-hoist=true` — flat root `node_modules` so Metro finds transitive helpers, while each app keeps its own React (web 19, mobile 18) and pins its own React *typings* via `tsconfig` `paths`. Web builds (51 routes) and mobile bundles under this one layout.
- Web smoke test after the change: /login 200, /signup 200, /offline 200, /dashboard → 307 to login, all under 130 ms cold.


### v12.1.0 — installed, built, and made fast
First release where the web app has been **installed and production-built end to end** (`pnpm install` → `tsc --noEmit` 0 errors → `next build` 47 routes → `next start` answering in 4–25 ms).

Fixes found by the build: cookie adapter typings in the Supabase server client and middleware; `daysLeft` moved to `lib/format` so client components stop importing `next/headers`; Web Bluetooth/WebUSB typings (`types/web-hardware.d.ts`) and ArrayBuffer conversions in the print transports; `notes` field on bill items; missing kitchen imports; admin sheet union; demo-data result typing; `recordPurchase` restored to the purchases+ledger flow with `unit_cost` carried onto the ledger by the trigger.

Speed:
- **Fonts self-hosted** (`public/fonts`, `next/font/local`) — no Google Fonts fetch at build or run time; the Box builds with no internet; no font swap on first paint.
- `lib/useLive` — one coalesced realtime hook (≤1 refresh per 400 ms, paused when hidden, refresh on return) replaces every ad-hoc subscription.
- **Optimistic kitchen**: tickets move columns the instant you tap.
- `app/(app)/loading.tsx` skeleton so every navigation paints immediately.
- `next.config`: `optimizePackageImports`, compression, immutable font cache, security headers.
- `0012_performance_indexes.sql`: 30 indexes covering every screen's load query plus the tenant lookup behind every RLS check.
- Bundle: 103 kB shared, most screens 140–240 kB first load; only Reports (charts) is 265 kB.


### v12.0.0 — "Cupertino warm": Apple HIG structure, DineFlow palette
- **Tokens** rebuilt on HIG semantics (`--color-bg/-2/-3`, `fill`, `label/-2/-3`, `separator`, `tint`, system green/red/blue) with automatic **dark mode**; every legacy name aliased so no screen breaks. System font stack (SF on Apple devices, Manrope elsewhere), Fraunces kept for titles, SF Mono/JetBrains for numbers.
- **Materials**: `.material` / `.material-thick` / `.material-bar` frosted glass; `.card` grouped secondary; `.group` + `.row` iOS inset grouped list with hairline separators.
- **Controls**: HIG buttons (filled, ink, tinted, gray, plain, danger) with spring press and haptic tick (Vibration API on touch devices); every native `input/select/textarea` restyled as inset fields with a tinted focus halo and a custom chevron; iOS checkbox and slider thumb; **Segmented** control with a sliding thumb (`layoutId`); **Switch** with spring; **Select** — a real popover listbox with search, arrow-key navigation, Enter/Escape, check mark and spring open/close; **Group/Row**; **ToastProvider/useToast** frosted pills; **Skeleton**.
- **Sheet** is now a bottom sheet on phones (grabber, drag-to-dismiss with velocity) and a centred material card on desktop; scrim blurs.
- **Motion**: one spring (420/34) for presses and thumbs, one iOS curve (.32,.72,0,1) for pushes and sheets; `app/(app)/template.tsx` slides every screen in 14 px with a blur that clears; CSS View Transitions cross-fade route changes in supporting browsers; full `prefers-reduced-motion` support.
- **Shell**: macOS-style translucent sidebar with a 10 px-radius active pill; mobile tab bar is a floating frosted pill with tinted active icon; top bar is a material bar.
- **Phone app**: `lib/theme.ts` HIG palette and system font; `components/ui.tsx` reanimated spring buttons with expo-haptics, `Group/Row`, `Segmented`, `Switch`, `Material` (expo-blur), `LargeTitle`; floating frosted tab bar with tinted active state.
- Mockups 24 (controls), 25 (iPhone), 26 (desktop).


### v11.0.0 — built-in Master login
- `0011_master_login.sql` seeds `master@dineflow.in` / `DineFlow@Master2026` directly into `auth.users` + `auth.identities` (bcrypt via pgcrypto; works on Supabase cloud and on a Box), and registers it in `platform_admins`.
- `admin_context` + `admin_act_as / admin_stop_acting / admin_acting_as`: a platform admin with no profile resolves `auth_restaurant_id()` to the property it chose and `auth_role()` to `owner`, so every RLS policy, trigger and RPC works unchanged — the master reads and writes any property as its owner, and the audit log records `act_as`.
- Web: `requireSession` builds a virtual owner session while acting and never redirects the master to `/membership`; `/admin` gains **Open** per property, a dark "Master · viewing X" banner with **Back to Master control**, and **Change master password** (`master_set_password`). Mobile auth resolves the same context.
- Sign-up, login, trials, invite codes and memberships are untouched.


### v10.0.0 — Hybrid: with and without internet
One deployment. The Box is the source of truth for the building; the cloud copy faces the world; a bridge keeps them in step.

- `0010_hybrid_sync.sql` (applied on both sides). Shared row ids across Box and cloud with idempotent upserts, `origin` columns (`local` | `cloud`) so each side only pushes what it authored, and `sync_state` cursors.
- **Cloud**: `box_push(token, payload)` upserts menu, categories, room types, rooms, rate inventory, local bookings (+ guests), online-order status, sealed periods (never overwritten), proof links, priced purchases, daily covers (as synthetic orders so `network_demand()` works), surplus and standby, network settings. `box_pull(token, since)` returns online orders and OTA/direct bookings authored in the cloud, membership, `network_status/prices/demand`, other properties' surplus and standby, proof views, order channels — impersonating the property's owner via `request.jwt.claims` so the Neighbours functions run with the right tenant.
- **Box**: `box_export(since)` assembles the push; `box_apply(payload)` applies the pull — online orders land as `new`, cloud bookings take the cloud's room or the first free room of that type (overbooking logged to `ota_sync_log`), membership mirrored, `neighbours_cache` refreshed.
- `scripts/box-agent.mjs` now runs push→pull every 60 s when the cloud pings, and logs transitions between online and offline. Nightly backups unchanged.
- App on a Box: Neighbours reads `neighbours_cache` (merging its own live listings), Proof/Channels/Booking-page links use `NEXT_PUBLIC_CLOUD_URL`, top bar shows "Box · in step with cloud / cloud out of reach" from the pull cursor. `Dockerfile` accepts the public URL as a build arg.
- Known limits stated in the guide: the Box needs its own logins; online bookings that arrive during an outage are placed on reconnect.


### v9.0.0 — the Box: fully offline, on-premise
- `docker-compose.box.yml` runs self-hosted Supabase (postgres, GoTrue with autoconfirm, PostgREST, Realtime, postgres-meta, Kong gateway) plus the DineFlow web app on one machine. No code change: the app is pointed at `http://<lan-ip>:8000` and `:3000`.
- Launcher → **9** mints the JWT secret and anon/service keys itself (HS256), writes `.env`, brings the stack up, runs migrations against the local Postgres (SSL off), writes the phone app's env to the Box, and prints the LAN address. **10** restores a backup. `box-admin` grants Master admin locally.
- `scripts/box-agent.mjs` (container): nightly `pg_dump` to `./backups` (keeps 14) and to a USB path; hourly phone-home to `/api/box/sync` when internet exists.
- `0009_box_sync.sql`: `box_issue_token` (owner/master), `box_sync` (anon + token) stores a report and returns the cloud's membership decision so gating works offline; `admin_box_status` shows last-seen per property in Master control; Settings gains "Runs on a Box".
- Cloud offline improved too: `OfflineProvider` warms an IndexedDB cache of menu, categories, tables and rooms every ten minutes and pre-fetches the key routes into the service worker, so screens never opened on a device still work when the connection drops. SW shell list widened.
- Honest boundary documented: Swiggy/Zomato, OTA sync, booking page, Neighbours and Proof links need internet by nature; everything else runs air-gapped.


### v8.0.1
- BEGINNER-GUIDE rewritten end to end as a single ordered document: day one (install → first login → demo tour), week one (every module), going live, keys, routine, troubleshooting, file map, and an honest not-yet list.


### v8.0.0 — Proof of Business
Turns the app's own records into an asset the owner can spend, and makes leaving expensive.

- `business_periods` — one sealed row per closed month: rooms/dining/delivery revenue, GST collected, supplier and wage outflow, covers, invoices, room-nights sold vs available, occupancy, average ticket, days traded.
- `period_figures(month)` reads the ledgers directly (bookings checked out, paid bills, accepted online orders, priced purchases, labour payments) and is deliberately re-runnable, so verification recomputes rather than trusting the stored row. Orders charged to a room never create a bill, so rooms and dining cannot double-count.
- **Hash chain**: `period_hash` = sha256 over the previous month's hash plus this month's canonical figures. `seal_period` refuses the current month and never rewrites a sealed one. `verify_chain` recomputes every month and reports which one broke and why.
- `proof_links` — expiring, revocable share links scoped to a month range, with a `show_costs` switch (lenders see margin, suppliers don't). `proof_views` logs every open and shows the owner.
- `proof_open(token)` is granted to `anon`: no login for the reader, verification done from the reader's side, and the record itself states plainly what it is not (not audited, not a score, cash outside the system absent).
- UI `/proof` for the owner and a public `/record/[token]` reader; both print to PDF.
- SQL `0008_proof_of_business.sql`. Mockups 22 and 23.


### v7.0.0 — Neighbours, the private district network
The structural advantage: one Master control means one database for a whole district. No single-property POS or PMS can build this.

- `network_settings` — four independent opt-in streams per property, radius, alias. Off by default; reading a stream requires contributing to it (`network_shares`).
- `network_peers(stream)` — properties sharing that stream within radius (haversine via `km_between`), falling back to district match when coordinates are absent. Never returns names.
- **k-anonymity throughout**: `network_min_contributors()` = 5. `network_prices` drops any row with fewer contributors; `network_demand` returns `available:false` with a reason rather than a misleading figure.
- `network_prices(days)` — pools *purchase* prices only (`stock_ledger.reason = 'purchase'`, new `unit_cost` column, written by the new `record_purchase` RPC). Returns my price, area median and 10th/90th percentiles, contributor and sample counts, percentage delta and weekly excess. Menu prices are never pooled, by design.
- `surplus_listings` + `surplus_post/feed/claim/close` — expiring stock offered to neighbours; sellers anonymous until claimed, then contact numbers are exchanged both ways.
- `labour_standby` + `standby_offer/feed/book` — workers marked free for a day; first name and skill only until booked, with a verified badge derived from whether an ID is on file and a 30-day attendance count.
- `network_demand()` — area covers last comparable weekday against the area's own 8-week baseline. `forecast_area_factor` folds it into `forecast_day` at half weight, clamped to 0.85–1.20, and the brief explains the nudge in words. The two flagship features now compound.
- UI `/neighbours` with four tabs, a privacy sheet that states plainly what each stream gives and takes, locked-stream and too-few-neighbours states, and a signal card linking back to Tomorrow.
- SQL `0007_neighbours_network.sql`. Mockups 20 and 21.


### v6.0.0 — the Tomorrow brief
The feature no single-purpose competitor can copy: it needs rooms, kitchen and pantry in one database.

- `forecast_day(date)` — takes the same weekday over the last 8 weeks, scales the average cover count by how full the rooms are tomorrow versus those days (bounded 0.55–1.6 so a full house never produces a wild number), then derives each dish's share of historical covers, applies the prep buffer, expands recipes into ingredient demand and subtracts current stock to produce a market list with costs. Returns a plain-language `basis` string and a confidence built from sample count and variance.
- Cold start is explicit: with no history it predicts only what bookings guarantee and says so on screen at 15% confidence.
- `save_forecast` freezes tonight's numbers; `grade_forecasts` fills in actual covers and sales the next day; `forecast_scorecard` reports average accuracy, how often reality landed inside the low–high band, and the last 14 days predicted-vs-actual. The owner can judge the tool before trusting it.
- `buy_purchase_list` turns ticked shortfalls into real `stock_ledger` purchases in one press. `record_chef_notes` captures what was actually cooked.
- UI `/tomorrow`: the number with its reasoning, four driver tiles, an owner override slider plus Quiet/Normal/Busy/Festival presets that recalculate prep and purchases live, a printable ESC/POS prep sheet with "made: ____" lines and a signature line, a WhatsApp-ready share, and the accuracy panel.
- Evening prompt card on the Control room after 5 pm. Settings gain `prep_buffer_pct` and `brief_whatsapp`.
- SQL `0006_tomorrow_brief.sql`. Mockup 19.


### v5.0.0 — "warm machine" visual language
- **The bill now prints.** The machine and the sheet share one centre line: the slot is exactly as wide as the paper, the body adds a fixed 22 px bezel on each side, and the sheet is clipped inside the slot while it feeds so no torn edge shows above the teeth. 58 mm rolls scale their type down so nothing wraps. The sheet is a wrapper holding a torn strip, the printed area and a second torn strip, so both edges are part of the measured height and survive the printer clip. The foot carries what a real Indian bill carries: total in words, payment lines, "you saved", a rate-wise CGST/SGST tax summary, FSSAI licence, copy label, a QR for the digital copy, the barcode with bill number, and the powered-by line. `components/receipt/Receipt.tsx` renders real thermal paper: torn perforated edges top and bottom, fibre texture, warm paper tone, uneven thermal ink, mono columns, barcode strip. `components/receipt/PrinterOutput.tsx` wraps it in a printer body (vents, blinking status LED, recessed slot with tear teeth) and feeds the paper out in 26 stepper-motor steps with sub-pixel jitter, a shadow at the slot mouth and a curl at the bottom, ending with a "Tear off" action. Used on the bill screen; the folio and KOT tickets use the same paper surface.
- **Tokens refreshed**: deeper ink, warmer saffron, calmer line greys, `--color-paper`. Every shadow is now three layers (contact + ambient + spread) plus an inset top highlight, so surfaces sit on the page instead of floating.
- **Materials**: `.feather` (card), `.glass` (floating bars), `.ink-panel` (sidebar, now with a radial light and faint scanlines), `.paper` (tickets, bills, folios), `.edge-lit` (light-catching top hairline), `.spotlight` (cursor-following glow on tiles).
- Buttons are gradient-bodied with an inset highlight and a coloured contact glow; they lift 1px on hover and compress on press. Inputs gained an inner shadow and a 4px focus halo. Page headers are larger with a champagne rule in the eyebrow and a hairline under the block. Sidebar active state is a gradient pill with a glowing saffron spine. Motion runs on one easing curve throughout, with a blur-in reveal; the printer is the single deliberately mechanical animation.
- Whole-app paper grain at 2.8% opacity; full `prefers-reduced-motion` support.
- New mockups: 16 billing with the printer, 17 the print animation frame by frame, 18 design system v5.

### v4.1.0 — runs with no external accounts
- Webhooks, iCal feeds and the OTA importer no longer need `SUPABASE_SERVICE_ROLE_KEY`: `ingest_online_order`, `ical_feed`, `ical_channels`, `ota_log` and `ingest_ota_booking` are SECURITY DEFINER functions granted to `anon`, authenticated by the per-channel token itself
- `/api/scan` without `ANTHROPIC_API_KEY` returns a labelled sample result per hint, so the scan → confirm → create flow is fully testable; barcode/QR stays real
- `push_channel(id, 'menu' | 'ari')` simulates a partner push and writes to the sync log when no credentials exist, and sends for real once `api_key` + `is_live` are set. Buttons on the Channels page; **Send test order** posts a real order to your own webhook
- `seed_demo_data()` / `clear_demo_data()` — one-click realistic dataset (menu with recipes, pantry with barcodes, tables, live orders, rooms with rates and bookings, housekeeping states, facilities, labourers with attendance, printers, demo channels and online orders). Buttons in Settings
- Kitchen reprint button; mobile order screen queues offline through `lib/queue.ts`; Drizzle schema updated for v3 and v4 tables; env examples carry working dummy values
- SQL `0005_demo_and_public_endpoints.sql`

### v4.0.0 — offline, thermal printing, delivery aggregators, OTA channel manager
- **Offline-first POS.** IndexedDB outbox (`lib/offline/`) + service worker app-shell cache + PWA manifest. Orders, payments, stock moves and punches queue on the device and replay in order. Server RPCs (`place_order`, `settle_bill`) take a `client_id` with unique indexes, so replays can never double-post. Status bar shows offline / syncing / synced; failed jobs retry 5 times then surface an error instead of blocking the queue.
- **Thermal printing.** `lib/print/escpos.ts` builds real ESC/POS bytes (bill + KOT layouts, 58/80 mm, QR, cut, drawer kick). Transports: Web Bluetooth, WebUSB, LAN via `scripts/print-bridge.mjs` (port 9100), browser dialog fallback. Printer registry per property with kind (bill/KOT/both), kitchen-station routing, copies, footer. KOTs auto-print on send, bills on payment, both offline-safe. `print_jobs` table + trigger for future server-side spooling.
- **Delivery channels.** `order_channels` with per-channel webhook token; `/api/webhooks/aggregator/[token]` normalises UrbanPiper-style, Zomato-style and DineFlow-native payloads, maps lines to dishes by partner id then name, records commission and payout. Online orders screen: accept & print, reject, ready/picked-up, unmatched-line mapping that teaches `menu_items.external_refs`. `accept_online_order` turns it into a normal order + KOT with recipe stock deduction.
- **OTA channel manager.** `ota_channels` in iCal or API mode. iCal export feed per channel (`/api/ical/[token].ics`) and importer (`/api/ota/sync`, Vercel cron every 15 min) creating blocking bookings through `ingest_ota_booking` with overbooking protection. `rate_inventory` + `availability()` + `set_rate_inventory()` drive a rates/stop-sell/min-nights calendar.
- **Direct booking engine.** Public `/book/[slug]` page (anon RPCs `public_property`, `public_availability`, `public_book`), settings screen with slug, tagline, policies and a shareable QR. 0% commission.
- SQL `0004_offline_print_channels.sql`. New env: `SUPABASE_SERVICE_ROLE_KEY` (webhooks, iCal, booking page), optional `CRON_SECRET`.

### v3.0.0 — smart scan, labour, final invoices
- **Scan** module (web + phone): live barcode/QR reading (@zxing/browser, expo-camera), photo capture/upload → `/api/scan` (Claude vision, `ANTHROPIC_API_KEY`) → typed `ScanResult` → confirm card. Vegetables/packets → new Pantry product with unit, category, brand, barcode, pack qty, cost; quick quantities 100 g … 5 kg; "just bought" adds stock. Known barcode/QR → add stock or wastage in one tap. Dish photo → Menu item. Room door/QR → room actions. ID card/worker → Labourer. Labour badge → punch in/out.
- **Labour** module: labourers (badge code, skill, daily wage, ID type + last 4 only), attendance (punch via QR or Mark present), monthly wages, payments, balance; printable QR label sheets for rooms, products and badges.
- **Invoices** module: numbered GST tax invoices. `generate_stay_invoice` builds one final invoice at check-out (room nights + room GST, restaurant orders + dining GST, facilities, extras, discounts, advance, payments, balance). `generate_dining_invoice` from any paid bill (with optional customer GSTIN). List with GST collected; print & share.
- Pantry: barcode, category, brand, pack qty fields. Check-out now returns the invoice id and opens it.
- SQL `0003_scan_labour_invoices.sql`; launcher asks for `ANTHROPIC_API_KEY` and sets `EXPO_PUBLIC_WEB_URL` for the phone automatically.

### v2.1.1
- Added BEGINNER-GUIDE.md — click-by-click startup guide (Node → Supabase → launcher → first flows → phone → live → onboarding clients)

### v2.1.0 — one-click launcher
- `launcher.mjs` menu (Windows `.bat`, Mac `.command`, Linux `start.sh`): configure keys, install, run migrations automatically over DATABASE_URL (`scripts/migrate.mjs`, tracks applied files), add master admin, open web, start Expo, deploy to Vercel, Docker on own server, EAS app builds
- `apps/web/Dockerfile` + `docker-compose.yml`, `apps/web/vercel.json`, `QUICK-START.md`

### v2.0.0 — hospitality + master control
- Property types: restaurant / hotel / resort chosen at sign-up (or in Settings); modules unlock per type
- Hotel: room types & rates, rooms by floor (key-card grid), front desk (arrivals/departures/in-house, bookings, check-in), guest folio (room nights + GST, extras, discounts, restaurant orders posted to room, facility bookings), check-out with split payment, housekeeping board, guest book
- Resort: facilities (spa / activities / venues) with schedule and folio posting
- Dining: room-service order type, "Charge to room" on the bill screen
- Master control (`/admin`): all properties, membership state, sales, users; extend trial / activate / suspend; issue monthly-yearly keys (open or locked to a property); audit log
- Two-stage login: 7-day temporary trial → membership login page (`/membership`) with key redemption; mobile lock screen
- UI v2: ultra-modern refresh — glass top bar with trial countdown, aurora page heroes, champagne accents, grouped sidebar with glowing active state, key cards, gold tiles on the control room; new mockups 06–09 in `design/`
- Mobile: property-aware tabs, Rooms tab (occupancy, arrivals check-in, housekeeping quick actions), membership lock
- SQL: `0002_hospitality.sql` (run after 0001)


### v1.0.1
- Added START-GUIDE.md (local → live, Vercel + Supabase prod + EAS store builds, go-live checklist, costs)
- Added design/ — rendered UI mockups (desktop, tablet, mobile, design system)
- Responsive fixes: scrollable bottom nav, table overflow on phones, kitchen column heights, no flicker on live updates (mobile)

### v1.0.0 — initial build
- Monorepo (pnpm + turbo): web, mobile, shared, db
- Database: 18 tables, RLS per restaurant, numbering, invite codes, `place_order` / `generate_bill` / `settle_bill` / `close_day` RPCs, recipe-based stock deduction, realtime
- Web: auth (signup / login / join), control-room dashboard (live), menu + recipes, pantry (stock, purchases, wastage, ledger), table floor + POS + order detail (live KOTs), kitchen display (3 columns, late alerts), billing (discounts, GST split, split payments, printable receipt, void), day close, reports (sales by day, top dishes, consumption & wastage, day closes), staff & invites, settings (tax, tables/zones). Responsive desktop / tablet / mobile with bottom navigation.
- Mobile (Expo, Android + iOS): login / join, role-based tabs, owner control screen, table floor + POS with review sheet, order detail, kitchen display (tablet 3-column), pantry quick update; haptics + spring animations

### v15.1 — the migrations were executed for the first time

Everything before this was verified by reading and by type-checking. In this pass all fifteen
migrations were run against a real PostgreSQL 18 engine, then every RPC was called end to end and
the results checked against what they should be. That found fifteen bugs no amount of reading had:

**Would have stopped `supabase db push` dead**
- `0002` defined `create_restaurant` and `admin_overview` *above* the `rooms` / `bookings` tables they read. Postgres validates SQL-language functions at creation, so the whole migration failed. The table block now comes first.
- `menu_items` never had `is_active`, though later migrations, indexes and app code all used it. Added to `0001` and back-filled idempotently in `0002`.
- `0010` `box_push` used a record variable `r` that collided with table aliases; `box_export` had a CTE named `r` making every bare `id` ambiguous. Both rewritten with distinct names and fully qualified columns.

**Would have broken at runtime, silently or loudly**
- Two `next_number` overloads existed at once, so `next_number('order')` was ambiguous — this broke order creation, bills, bookings and invoices. The 1-argument version is now explicitly dropped.
- `insert into orders(... note ...)` and three `order_items` inserts used `note`; the column is `notes`. Every offline-sync and channel order would have failed.
- `0004` called `consume_recipe(...)` as a normal function, but it is a trigger function — and the `trg_consume_recipe` trigger already deducts stock. The bogus calls are gone.
- `settle_bill` inserted `created_by` into `payments`, which has no such column. Payment always failed. Removed, and `client_id` is now properly added to `payments`.
- `forecast_day` was marked `stable` but creates a temp table; Postgres refuses. Now volatile.
- `network_prices` shadowed its own `RETURNS TABLE` column names inside its CTEs, and rounded a `double precision` that `round(x, 2)` does not accept. Qualified and cast.
- Loop variables named `d` collided with query aliases named `d` in the sample-estate seeder and in `period_figures`.

**A security hole in Proof of Business**
`verify_chain` recomputed each month's figures from the order and bill ledgers and compared that to
the stored fingerprint. But `proof_open` shows the reader the *stored* row. So anyone who edited a
sealed row in `business_periods` directly changed what the banker sees while verification still
reported "intact". The chain now hashes the stored row itself, and separately re-derives from the
ledgers, so it distinguishes two different frauds: **the sealed figures have been edited**, and
**the underlying orders or bills changed after this month was sealed**. This is now proven by test:
editing a sealed month is detected.

**What the run proves.** Six sample properties seed with ~3,600 orders and 12 sealed months. Tenants
stay separated. A sale deducts the right ingredient. GST maths and the even CGST/SGST split are
correct. A room cannot be double-booked. The proof chain detects tampering. Neighbours compares 13
items across 5 peers and goes blank at 3, as k-anonymity requires. Storefront booking fills exactly
56 seats and then refuses. An offer takes ₹144 off ₹1,440.

Still untested, and honestly so: real thermal printer hardware, a real Supabase project under load,
an APK on a physical phone, and real staff on a real service.

### v13 — "Flip": the design system, rebuilt around a split-flap board

The whole product now looks like a flip clock on a graphite wall, and every screen is a card in
a deck. The brief was two photographs: a split-flap clock (the look) and an app switcher with
rounded pages side by side (how pages change). This release is those two ideas, applied everywhere.

**The look.** Graphite `#17171c` wall, paper-white numerals in dark tiles with a hinge and side
pins, Oswald for every number, title and label, Manrope for anything you read. One colour,
signal green `#4cd964`, means *live / go*: the confirm button, a ready ticket, the active tab.
Red is reserved for things running late. Dark is the default. Guest pages (`/dine`, `/book`,
`/record`) switch to a bright "paper" theme with `data-theme="paper"`, because a menu on a phone
in daylight should be bright while the kitchen board at 9 pm should not.

**The flip tile** (`<Flip value label size tone />` on web and phone) turns its face over when
the number changes. It is used only for the numbers that matter: the three on the control room
board, the minute count on every kitchen ticket, item quantities on the order pad, and a live clock
on the login wall.

**The deck.** Web: the main column is a rounded card on a bezel-black gutter and every route
slides in from the right with a settle. Phone: every tab is a card; drag it left or right and the
next section slides in (`<Deck tabs>` in `components/ui.tsx`, gesture-handler + reanimated); the
chevron-down handle (`<DeckHandle />`) drops a pushed page back into the deck.

**Accessibility floor.** Inputs are 48 px, tap targets 44 px, body text 15–16 px, paper-on-graphite
contrast above 14:1, ash labels above 4.5:1, focus rings visible, reduced-motion respected, and
every flip tile announces changes with `aria-live`.

**Under the hood.** Oswald ships inside both apps (`apps/web/public/fonts`, `apps/mobile/assets/fonts`),
so the Box and a phone with no signal render it. Fraunces is retired. Metro now resolves `react`
to the real package regardless of the tsconfig typing alias (`apps/mobile/metro.config.js`), which
fixed an Android bundle failure. Web: 55 routes build clean. Android: 2,958 modules bundle.

Design references: `design/30-flip-login.png`, `design/31-flip-control-room.png` (both are
screenshots of the real app), `design/32-flip-deck-phone.png`.

### v13.1 — spacing rhythm and the full screen set

A single spacing scale (4 · 8 · 12 · 16 · 24 · 32 · 48) now runs through every screen: card
padding 24, section gaps 32, grouped rows 56 tall with an 18 px inset rule, page column capped at
1280 px so wide monitors don't stretch the board, sidebar rows 42 tall. `.card-title`, `.section`
and `.stack` classes carry the rhythm so new screens inherit it.

Every operator screen was rendered through the real CSS and components and saved to
`design/flip/01…18` — control room, tables, order pad, kitchen, billing, rooms, front desk,
housekeeping, pantry, menu, tomorrow, neighbours, proof of business, reservations, labour,
reports, settings and master control.

### v13.2 — dark and light, your choice

**Settings → Appearance** offers three options: **Dark** (the board), **Light** (a bright room)
and **Follow device**. The sun/moon button in the top bar flips between the first two in one tap.

- **Web.** The choice lives in a `df-theme` cookie so the server renders the right theme on the
  first byte, and a two-line boot script resolves *Follow device* before paint, so there is no
  flash of the wrong colour. Guest pages (`/dine`, `/book`, `/record`) are always bright.
- **Phone.** The choice is stored with AsyncStorage and read before the splash screen lifts.
  The sun/moon button sits on the home screen beside the property name; hold it to follow the
  phone's own setting (a green dot shows when it does). Switching re-keys the tree so every
  screen repaints at once.
- **What stays the same in both.** The flip tiles are always a dark split-flap — they are the
  brand. The sidebar and the deck gutter stay graphite, so in light mode you get bright cards on a
  dark deck, exactly the app-switcher feel of the reference. Green and red are darkened in light
  mode (`#2fb84d`, `#e5322d`) so text on them keeps passing contrast.

Files: `apps/web/components/ui/Theme.tsx`, `apps/web/app/layout.tsx`, `apps/mobile/lib/theme.ts`,
`apps/mobile/app/_layout.tsx`. Screenshots: `design/33-login-dark.png`, `design/33-login-light.png`.

### v14 — Pulse: honest wait times and a walk-in queue

Nobody at a restaurant door knows how long the wait really is; they guess, and the guess is
what makes people leave. Pulse gives the host a number with a reason behind it.

**How it works.** Every occupied table has a *stage* read straight from its ticket — ordered,
eating, served, bill out — and the restaurant's own history says how long a sitting takes here,
by table size and by lunch versus dinner (`dwell_minutes`, median of the last 90 days, falling
back to 45 minutes until a week of history exists). From those two, `table_pulse` says when
each table frees up. `quote_wait(party)` walks the tables big enough for the party in the order
they free up, gives one to each party of that size already waiting, and returns what is left.
That is the number the host quotes, and it moves the moment a bill prints or a ticket is served.

**The queue.** Walk-ins go on a list with name, party and the minute they were quoted. Call,
Seat (picks a free table big enough), or Left. Or print the QR: guests open `/queue/<slug>` on
their own phone, put their name down, and watch their place move up — no SMS, no app. When
they're seated, their page shows the table number.

**Verified on real Postgres:** dwell learned from history; stages read from tickets; a billed
table frees soonest; the quote lengthens as parties of the same size join; a guest's place moves
up when someone ahead is seated; a party of 40 is refused; the queue caps at 60.

Files: `supabase/migrations/0016_pulse.sql`, `apps/web/app/(app)/pulse/`, `apps/web/app/queue/[slug]/`.
Module key `pulse` (owners, managers, cashiers, waiters). Screenshots `design/34-pulse.png`,
`design/35-queue-guest.png`.

**Still on the list — the two other ideas from the same sitting:** *Leak finder* (recipe-theoretical
stock vs counted stock per ingredient since the last count) and *Shift close in 60 seconds*
(expected vs counted cash, UPI totals, one WhatsApp-ready summary).

### v15 — Leak finder and Shift close; Pulse on the phone

**Leak finder** (`0017`, Pantry → Leak finder). A stock count writes an `adjustment` ledger row
tagged `count`, so after counting, stock *is* what was counted and the ledger stays the single truth.
`leak_report` then compares, per ingredient since its last count: purchases − recipe sales − logged
wastage against the shelf. Negative gaps are ranked by rupees lost; positive gaps flag recipes that
may be over-stated. Verified: a 3 kg shortfall on rice is named as the worst leak at its cost price.

**Shift close** (`0017`, Billing → Close shift, replacing the plain day close). `shift_expected`
sums every payment by method since the last close (or 06:00 IST); `shift_close` takes the counted
cash and float, stores expected vs counted with the variance, and writes one paragraph in plain
words. The old `day_closes` row is still written so Reports stay in step. Verified: ₹50 short is
reported as ₹50 short and the next shift starts from zero.

**Pulse on the phone.** A Pulse tab with the waiting count, next-free minutes, a quote for the
chosen party, and Call / Seat / Left per party.

**Seeder fix.** Sample payments were stamped with the seed time instead of their bill time, which
made a fresh install's till look like sixty days of cash arrived today. `0014` now stamps them with
the bill's `paid_at`.

Migrations 0001–0017 all apply on real Postgres; four test harnesses (migrations, workflows,
correctness, Pulse) and a fifth for v15 pass in full.

### v16 — Assist: one assistant on every screen

A small mark sits in the corner of every operator screen (⌘J / Ctrl+J opens it anywhere). It
already knows which screen you're on, offers three questions worth asking there, and answers from
that screen's own numbers in plain words: a figure, a name, the next thing to tap.

**What it reads.** `POST /api/assist` gathers facts for the current section only — kitchen tickets
with their ages; pantry low stock and the leak report; Pulse tables and the queue; the till on
Billing; tomorrow's brief; the price index on Neighbours; the chain on Proof; arrivals and folios on
the front desk; sales by dish on Menu; attendance on Labour; and a day summary on the control room.
Every branch is a read. **It never writes.** Anything it suggests is something the person then does
on the screen, which is how a helper should behave in a place that handles other people's money.

**Without a key.** If `ANTHROPIC_API_KEY` is not set, Assist still opens and shows the facts it can
see, and says plainly that answering in words needs the key. Nothing else in the app changes.

**The mark.** A flip tile — the product's own shape — with a four-point spark where the numeral
would be and the hinge line running through it: the board, thinking. It stays dark in both themes
like every tile. Panel: right-hand card on desktop, bottom sheet on phones; a new screen starts a
new conversation so an answer about the kitchen never bleeds into the pantry.

Files: `apps/web/app/api/assist/route.ts`, `apps/web/components/assist/`. Screenshots
`design/36-assist-mark.png`, `design/37-assist-panel.png`, `design/38-assist-phone.png`.

### v16.1 — Assist thinks ahead

Four upgrades to the assistant, and a mark that shows what it is doing.

- **It notices before you ask.** On every screen, and every 90 s, a set of plain rules reads the
  whole house and produces up to four *Right now* cards: a ticket over 15 minutes, a party waiting
  too long, a bill printed and unpaid, stock below reorder, an arrival whose room isn't ready. The
  button shows a count and the mark goes to its alert state until the panel is opened. No model is
  needed for this, so it works with or without a key.
- **It sees the whole house.** Every answer gets the current screen's facts *and* a light snapshot
  of everything else — sales, kitchen load, queue, unpaid bills, rooms to turn — so it can say
  "call the next party, but send a runner first: two tickets are ready and nobody has carried
  them out."
- **It answers as it thinks.** Replies stream word by word; the mark turns on its hinge while it
  does.
- **It can act, after your tap.** A reply may end with one proposed action from a short whitelist —
  page a waiting party, draft the supplier's reorder message, jump to a screen. It appears as a
  Confirm button and runs only when tapped, through `/api/assist/act`, which knows those three
  things and nothing else. The panel never claims something happened before it did.
- **It listens.** A mic button appears where the browser supports speech; the question is sent
  when you stop talking.

**The mark's three states.** Idle: the spark breathes. Thinking: the tile flips on its hinge, the
way a digit changes on the board. Alert: the spark goes ember and a ring pulses three times.
Respects *reduce motion*.

Files: `apps/web/app/api/assist/route.ts` (insights, house snapshot, streaming), `apps/web/app/api/assist/act/route.ts`,
`apps/web/components/assist/`. Screenshots `design/36`–`39`.

### v16.2 — one motion vocabulary

Motion was scattered across thirty-seven files with its own numbers each time. It is now four
springs in `apps/web/lib/motion.ts`, and everything is built from them, so a sheet, a page and a
flip tile feel like the same machine.

- **snap** (520/32) — a control answering a finger. Every button, chip and card press.
- **glide** (300/30) — things arriving: cards, rows, panels, staggered 35 ms down a list.
- **settle** (220/28) — heavy things: sheets, pushed pages, the deck.
- **flip** — a curve, not a spring (`.42s`, `cubic-bezier(.32,.72,0,1)`), because a flap is
  mechanical and shouldn't bounce.

**The flip tile now actually flips.** The old version cross-faded. The face is a 3D stage with the
new digit falling in from 90° as the old one folds away, so a changing number reads the way the
board on the wall does. It works for text too ("T7") and for padded numbers.

**Where motion now means something.** Kitchen tickets keep their identity across columns, so a
ticket *travels* from Cooking to Ready instead of vanishing and reappearing. Live lists (kitchen,
Pulse tables, queue) stagger in and animate out when something is served. Sheets follow the thumb
on phones and let go past 110 px or a flick.

**Reduce motion is honoured globally** — one media query cuts every animation and transition to
0.01 ms, including the Assist mark and view transitions, so the person who asked their system for
stillness gets the ends of every animation and none of the journeys. Verified in a
reduced-motion browser: the mark's spark reports a `0s` duration.

Screenshots: `design/40-motion.png`, `design/41-motion-sheet.png`.

### v17 — offline everywhere, and a lighter app

**The outbox now covers a whole shift, not two actions.** Before, only placing an order and settling
a bill survived a dropped line. Now: kitchen tickets advancing, single items marked ready, walk-ins
added / called / seated / gone, stock counts, housekeeping and table status. Every one paints on
screen at once and waits in the queue.

**The queue got tougher.**
- Exponential backoff (1s, 2s, 4s… capped at a minute) instead of hammering a dead line.
- Permanent failures are told apart from connection failures: bad data (`duplicate`, `violates`,
  `not found`) is dropped with a message; a bad line retries six times. Previously *any* failure
  broke the loop and stalled everything queued behind it.
- A quiet `/api/health` ping catches a connection that came back without the browser noticing.
- Background Sync, so the browser can wake and send the outbox after the tab is closed.

**Reads work offline too.** `useCached` (web) and `useLiveCached` / `cacheGet` (phone) paint a screen
instantly from the last good answer and replace it quietly when a fresh one lands. The warm cache
now carries ingredients and labourers as well as menu, tables and rooms.

**On return you are told.** When the queue drains, the banner reads *"Back online · 7 sent"* on both
apps, and every cached screen revalidates.

**Replay safety is proven, not asserted** (`scripts/sqltest/offline.mjs`). Sending the same job
twice — the exact thing an outbox does when a reply is lost — creates **one** order, not two;
does not double its items or its stock movement; takes a payment **once**; and still lets a
genuinely new order through.

**Service worker**, three strategies: cache-first for content-hashed build files, network-first for
pages, stale-while-revalidate for the rest. Writes are never touched — they go through IndexedDB so
they survive a reload. **Fixed:** it only registered *after* login, so a first visit or a logged-out
reload had no offline shell at all. It now registers at the root. Verified in a real browser with
the network cut: a page is served with status 200 and the outbox survives reloads intact.

**Performance.**
- `/reports` fell from **268 kB to 168 kB** — the charting library now loads only when that screen
  is opened, behind a skeleton.
- Mobile realtime coalesces bursts of changes into one refresh and **stops when the app is
  backgrounded**, so a phone in a waiter's pocket is not holding a socket open or waking the radio.
- Home and Tables on the phone open from cache, so there is no empty screen while the network answers.

**Known limit.** Persistence, the offline shell and replay safety are all proven here. The *drain*
itself — jobs leaving the queue against a live server — needs a real Supabase project and a signed-in
session, so that one still waits for your deployment.

### v17.1 — alignment, fixed at the source

The master control toolbar was one wrapping flex row with `ml-auto` on the buttons. The moment it
ran out of width the buttons dropped to a second line and were pushed hard right, stranded in the
middle of the page with nothing under them. Seven other screens had the same shape.

**The fix is a pattern, not a patch.** A toolbar is now always two groups — *what you are looking
at* on the left, *what you can do* on the right (`.toolbar`, `.toolbar-group`, `.toolbar-end`).
They sit on one line when there is room and stack, each still tidy, when there isn't. Converted:
master control, pantry, menu, labour, rooms, and the order and invoice detail headers.

**Every control in a toolbar is now exactly 40 px**, so a chip, a search field, a select and a
button never sit a few pixels proud of each other. Measured in the browser at three widths rather
than eyeballed: `control heights: [40]` at 1440, 900 and 390 px, with zero horizontal overflow.

**On a phone**, actions become full width and equal (all four measured at 302 px), the filter select
no longer sits alone and narrow on its own line, and list rows stack — the name gets its own line
with the badge and the figure beneath, instead of three things fighting over 340 px.

**Also fixed:** anything given `flex-1` in a row now also gets `min-width: 0`, so a long property
name shrinks instead of shoving the pill and the number out of alignment; and page headers keep the
title from being crushed by their action buttons.

Screenshots: `design/43-toolbar-desktop.png`, `design/43-toolbar-phone.png`.

### v18 — the phone app, designed for a phone; and a flap that really turns

**The flip animation.** It was a whole-face cross-fade. It is now a split-flap: each character is its
own flap, and when a character changes the top half of the old one folds down onto the hinge and the
bottom half of the new one drops in with a small overshoot. 19 → 20 turns two flaps with a 70 ms
stagger; 21 → 22 turns only the units. Verified frame by frame on the web (`design/45-flap-frames.png`);
built identically on the phone with Reanimated (two clipped halves, perspective, eased landing).
A two-digit tile is now guaranteed to fit inside its own width, so three tiles always fit a phone
edge to edge — on the app and on mobile web (`--tile` sizes itself from `100vw`).

**The phone app was the web layout made narrower. It is now built to iOS conventions.**
A kit in `components/ui.tsx`: `Screen` (large title, pull-to-refresh, safe areas), `Inset` (grouped list
with inset hairlines, header and footer text), `Cell` (leading · title/detail · trailing · chevron, 52 pt),
`Sheet` (bottom sheet that follows the thumb, dismisses past 120 px or a flick), `Chips`, `IconButton`.
Four screens rebuilt from it:
- **Home** — money first at 48 pt; three flip tiles sized from the screen width; *Needs a hand* shows
  only what is late, ready, waiting or short; then *Go to*.
- **Kitchen** — one column at a time picked with chips that carry their counts; full-width paper
  tickets; a 44 pt flip tile for the minutes that turns red at fifteen; actions at the foot of the card.
- **Pulse** — the three door numbers full width; the queue as an inset list; call / seat / left in a
  sheet; adding a party in a sheet so the keyboard never shoves the list about.
- **More** — the Settings-app shape for Rooms, Pantry, Scan, appearance and sign-out.

**Five tabs instead of seven** — Control · Orders · Kitchen · Pulse · More — in the order a shift
happens. Haptics on every action. Every write works with no signal through the outbox.

**Not yet rebuilt in the kit:** Tables, Rooms, Pantry and Scan still use the older layout. They run and
bundle; they are the next four to move over. Render: `design/44-phone-screens.png`.

### v19 — the master decides what each owner can open

**Three rules, enforced on the server.**
1. **The master's credentials open Master control and nothing else.** Sign-in checks `is_master()`
   and lands on `/admin`; a signed-in master hitting `/` or `/login` is sent there too. The master has
   no property of its own and opens one only by **Act as** from a property's row. The "Open property"
   link is gone from the master header.
2. **Nobody but the master can reach Master control.** `/admin` requires a `platform_admins` row;
   anyone else is bounced to their own dashboard. (This was already true; it is now the only door.)
3. **Master control → Access, per property.** A sheet of grouped switches — Front of house, Hotel,
   Kitchen & stock, Money, People & network — writes `restaurants.enabled_modules` through
   `master_set_modules` (master only, logged to `admin_log`). *Everything* (NULL) is the default.
   **Control room** and **Settings** can never be switched off, so an owner always has somewhere to
   land and a way to sign out.

**How it is enforced.** `modulesFor(type, role, enabled)` is now the property type's modules ∩ the
role's modules ∩ the master's set. The `(app)` layout reads the request path (middleware passes it as
`x-pathname`) and redirects any route whose module is off to `/dashboard?locked=<module>`, which shows
the owner a plain note. So a module that is off leaves the sidebar, the phone's tab bar, *and* cannot
be reached by typing its URL. The phone reads the same column and applies the same rule.

**Proven on real Postgres** (`scripts/sqltest/access.mjs`): the master is recognised; the master
limits an owner to five modules; the change is logged; an owner is not the master and cannot change
access; NULL restores everything. Render: `design/46-master-access.png`.

**Also fixed in this pass.** Shift close's window began at 06:00 *today*; between midnight and 06:00 that
was in the future, so a restaurant open past midnight would find the night's takings outside the till.
The harness caught it at 01:26 IST. The window now rolls back to yesterday's 06:00 after midnight.

### v20 — the owner decides what each employee can open

The straight version: **three layers, each looking only down.**

| Who | Sets | Where | Stored in |
|---|---|---|---|
| Master | what a **property** has | Master control → Access | `restaurants.enabled_modules` (v19) |
| Owner | what each **employee** has | Staff → Access | `profiles.allowed_modules` (this) |
| Employee | nothing | — | sees only their set |

An employee's set = property type ∩ their role ∩ the master's set ∩ the owner's ticks.
`modulesFor(type, role, enabled, allowed)` is that one rule, used by the sidebar, the phone's tab bar
and the server-side route gate, so what is off is off everywhere.

**On Staff, every person gets an Access button.** Pick a role — it sets a sensible default — then
untick anything that person shouldn't see. Only sections the master allowed *and* the role may ever
have are shown, so an owner cannot grant more than they hold. Owners always have everything;
Control room can never be unticked. The old inline role dropdown and Deactivate link are gone: every
change now goes through `owner_set_access`, which is the only path.

**Guard rails, all proven on real Postgres** (`scripts/sqltest/staff.mjs`):
an owner limits a waiter to two sections · NULL restores the role's default · nobody can change their
own role or deactivate themselves · with two owners one may demote the other · the last owner cannot be
demoted · a manager cannot touch an owner or make one · a manager can set a waiter's access · an
employee cannot set anyone's · nobody can reach into another property.

Render: `design/47-owner-access.png`.

### v20.1 — every link checked

A static audit of both apps (`scripts/check-links.py`): 47 distinct link targets on the web against
46 routes and 11 API routes — every one resolves; 15 push targets on the phone against 13 screens —
every one resolves. Every one of the 92 database functions the buttons call, and all 45 tables and
views the screens read, exist in the migrations. A live crawl of the built site followed every link
reachable without signing in: 13 pages, no broken links, no JavaScript errors. The two 404s in the
crawl were `/dine/<slug>` and `/book/<slug>` for a slug that does not exist in an empty database —
the correct answer for an unknown property, not a broken route.

### v20.2 — loading, in the product's own language

Every wait in the app now looks like the board searching for its number: three flaps hunting through
digits with a 90 ms stagger, built from the same `Flap` the tiles use, so a loader is not a spinner
borrowed from somewhere else. It can be told the answer (`settle="142"`) and the flaps land on it —
the moment a count arrives, the loader *becomes* the number.

- **`Loader`** — `xs` inside a button (the digits stay light whatever the button colour), `sm` in a
  card, `md` on a page; `tone="alert"` when the wait is a problem.
- **`PageLoader`** — the board in the middle of the screen with a line that changes every 1.6 s
  ("Setting the board", "Reading the tickets"…) so a long wait never looks stuck.
- **Route `loading.tsx`** for the app, admin, storefront and queue: the *shape* of the coming screen —
  the board where the tiles will be, skeleton rows where the rows will be — not a blank.
- **`NavProgress`** — a two-pixel signal-green hairline at the very top that fills while the next page
  is on its way and vanishes on arrival.
- **Buttons** show the small board while pending; **Assist** thinks with it instead of three dots.
- **Phone**: the same `Loader` and `PageLoader` in Reanimated; the app opens on the board
  ("Opening DineFlow") while fonts and the theme load, never on a blank screen; `Button` takes
  `loading`.
- Honours *reduce motion*: the board stands still. Verified frame by frame that the digits cycle and
  that a settle lands and stays. Renders: `design/48-loaders.png`, `design/49-loader-frames.png`.

### v20.3 — waits with a length

A wait whose length is known is not a spinner; it is a clock. Two new pieces, both apps.

- **`Countdown`** — minutes and seconds ticking down on flaps, a signal-green track emptying beneath.
  Hand it a fresh `seconds` (a new quote) and it re-syncs without a jump. At zero it says its
  `doneLabel` and the track flashes full. `tone="alert"` turns it red for a wait that is a problem.
- **`Waiting`** (web) — for a wait whose length is only *expected*: the track fills over `expect`
  seconds, then creeps and says *a little longer than usual*, never claiming done before the work
  is. Shows elapsed time; a tick on completion.

**Where they went.**
- **The guest's queue page** — "about 12 min" is now a live `11:20` counting down to **now**, with the
  label becoming *your table*. It re-syncs every 20 s from the real quote.
- **Pulse on the phone** — the quote for the chosen party counts down in its slot.
- **The offline bar** — when a send is backing off, it says *retrying in 00:04* rather than just waiting.
- **Master control → Sample estate** — the minute-long build shows *Building six properties and sixty
  days of history* with elapsed time and a filling track.

Verified frame by frame: a countdown reaches zero and lands on *now*; the timed wait passes its
expected length and says so; the tick appears on done. Renders `design/50-timed-waits.png`,
`design/51-countdown-frames.png`.

### v20.4 — the flap, done properly: two plates per digit

At rest the digit used to read as one piece with a line drawn across it. A real split-flap is two
separate plates per character with a gap at the hinge, and the fold happens on the top plate alone.
That is what it is now, on both apps.

- Each character is **two plates** — a lighter top plate with a highlight along its upper edge, a
  darker bottom plate — separated by a **2 px hinge gap**, each with its own rounded corners. The
  tile is a dark well the plates sit in; the line that used to cross the whole tile is gone.
- The turn: the **old top plate folds down** onto the hinge (280 ms, easing in) and darkens as it
  goes; then the **new bottom plate falls** the rest of the way (320 ms, a little overshoot) and
  catches light as it lands. Mid-turn the board shows the classic state — top plates already reading
  the new number, bottom plates still reading the old.
- Same geometry and timing in Reanimated on the phone, with the shading driven off the rotation.
- Verified frame by frame at 260 px (`design/53-flap-closeup.png`); at rest, every size from a
  button loader to the board (`design/52-flap-plates.png`).

### v20.5 — measured, not eyeballed: sticky sidebar, responsiveness, performance

Every fix here was found by mounting the real shell and measuring it at five widths (360, 390, 768,
1024, 1440) rather than by looking at one screen.

- **The sidebar scrolled away.** Two causes stacked: the `<aside>` carried both `relative` and
  `sticky`, and `.ink-panel` set `position: relative` in un-layered CSS, which beats Tailwind's
  `.sticky` whatever the order. Both removed; `self-start` added. Measured after a 1,200 px scroll:
  sidebar top **0** at every width that shows it.
- **Words and numbers broke mid-way** ("₹48,7 20", "3 order s") because of an `overflow-wrap:
  anywhere` rule added in v17.1. Removed; numbers, pills and buttons are `nowrap`. Broken numbers
  measured: **0**.
- **Sections hidden.** `overflow: clip` on the main card was cutting off anything that poked out —
  popovers, the Assist panel edge, sheets on small screens. Removed.
- **Tablets.** The full 256 px sidebar ate a third of a 768 px screen, so tiles wrapped 3+1 and the
  board wrapped 2+1. The sidebar is now a **76 px icon rail from 768 to 1023 px**, full width from
  1024; the board's money column joins the tiles only from 1280. Board rows at 768/1024/1440: **1**.
- **Phones.** Tiles were shrinking to 64 px because `14vw` won the clamp; they now size from the
  screen width — **107 px at 360, 118 at 390** — and three always fit edge to edge. Every table
  scrolls inside its card (`.table-wrap`) instead of widening the page. Horizontal overflow at all
  five widths: **0**.
- **Performance.** The three things that cost the most on scroll and during a flip: backdrop blur
  cut from 24–40 px to 12–14 px; the loader's animated `box-shadow` replaced by an opacity ring on
  the compositor; the CSS view-transition removed — it was running on top of the framer page
  animation, a double animation and a visible stutter. Flaps now sit on their own compositor layer
  (`will-change`, `contain: layout paint`, `preserve-3d`). Ten flip turns: **one 59 ms main-thread
  task** in total.
- **The flap itself.** Slightly longer, better-shaped curves — the top plate accelerates into the
  fold, the bottom plate lands with a small overshoot and the shading follows the angle.

Renders: `design/54-phone.png`, `design/54-tablet.png`.

### v20.6 — the sidebar foot, and a menu that scrolls

- **The foot is one compact card**: avatar, name, a single status line (role · membership with the
  days left, coloured green / amber / red), and sign-out as an icon button on the right. Master
  control appears as one full-width button beneath it only for the master. The membership pill that
  duplicated this at the top of the sidebar is gone; the property type now sits on the head's second
  line.
- **Sections were disappearing.** On a 960 px screen the menu ran past the bottom and Labour, Proof,
  Neighbours, Reports and Settings were simply off-screen. The `<nav>` is now the part that scrolls
  (`flex-1 min-h-0`) with a soft fade at its bottom edge that says there is more; the foot stays on
  screen (measured: bottom at 936 of 960).
- All twenty operator screens re-rendered on the real shell: `design/flip/01…20`.

### v21 — the owner's brand, an About page, and one table for everything

**The owner's control page shows the owner's brand.** The sidebar head is the property's name, its
type, and its logo — or its initial in a flip tile until a logo is set. DineFlow's own wordmark
stays on the sign-in wall and in Master control only. Settings → Property gains **Logo** (a square
image URL) and **Brand colour** (optional hex; it becomes the accent on that property's screens —
active menu item, confirm buttons). Migration `0020_brand.sql` adds `logo_url` and `brand_colour`.
Uploading a file rather than pasting a URL needs Supabase Storage and is the next small step.

**About, from every area.** `/about` is the whole product on one page — what it does, who sees what,
every section by group, the six signature features, how it keeps its promises, the five guides, and
what is deliberately not built. A quiet *About DineFlow* link sits under the sidebar foot on every
screen; the phone has it under More.

**Tables.** `components/ui/DataTable.tsx`: sortable headers (click cycles ascending → descending →
off), a search box that filters as you type, right-aligned tabular numbers, a sticky header, paging
at 25, an honest empty state, and row actions that stay dim until the row is hovered (always visible
on touch). **On a phone every row becomes a card** — label left, value right, actions at the foot —
so no table ever scrolls sideways (measured: cell width 328 px on a 390 px screen, overflow 0).
Master control's properties table runs on it; the other nine tables share the same header, rows,
numerals and hover through one wrapper class, so the whole product reads as one table design.
The bar above a table follows the two-group toolbar from v17.1.

**Also fixed.** A row of four flip tiles now sizes itself for four on a phone (the About page's
tiles were spilling 1 px). Renders: `design/56`–`59`.

### v21.1 — a flap as wide as its glyph

Every flap was a digit's width, so anything wider — `%`, `₹`, `L`, `M` — was clipped at the right
edge (the *0% commission* tile showed it). A flap now sizes itself to the character it carries: an
invisible copy of the glyph sets the plate's width on the web; a glyph-class ratio does the same on
the phone (`%`/`₹` 0.56 of the tile, `M`/`W` 0.5, other letters 0.42, digits 0.36, a dot or colon
0.2). Mid-turn the flap takes the wider of the old and new characters so the fold never clips.
Verified in the browser: across `0%`, `86%`, `₹4.8L`, `T7`, `RS`, `MW` and `12:33`, no glyph is
wider than its flap. Render: `design/60-flap-glyphs.png`.

### v22 — the phone app, every screen in the iOS kit

Every remaining phone screen moved into the kit from v18 (`Screen`, `Inset`, `Cell`, `Sheet`,
`Chips`, `IconButton`), so the whole app now follows one set of conventions: a large title with the
context line above it, pull to refresh, inset grouped lists with hairline separators, actions in
bottom sheets that follow the thumb, 44 pt targets, haptics on every action, and the outbox behind
every write.

- **Sign in** — the live clock in three tiles on the wall, the sign-in as a card that rises from
  the bottom; the keyboard never covers the button.
- **Orders** — the floor as a two-across grid of table cards, the zone picked with chips, each card
  carrying its state as its border colour and one line (free · cooking 12 min · served ₹860);
  takeaway and delivery below; a floating + for a new order.
- **Order pad** — a deck card with the chevron handle; Dine in / Takeaway / Delivery chips; a
  scrolling row of tables; search; category chips; one row per dish with an Add button that becomes
  a − N + stepper with a flip tile; the basket as a floating bar with Send to kitchen.
- **Open order** — one inset group per KOT with its minutes, each line with its status pill, Mark
  served when something is ready, the running total in the floating bar with Add.
- **Rooms** — three key cards across, floors as chips, arrivals today as a list, the state as the
  card's colour; tap a card for Mark ready / Send to cleaning / Out for repair in a sheet.
- **Pantry** — search, Below reorder first, then everything; tap an ingredient for Bought /
  Wasted / Adjust in a sheet with a large numeral field.
- **Scan** — the camera in the Screen shell; Photo a bill; the last results as a list.
- The fifteen screens are rendered to the code in `design/phone/` and as one sheet,
  `design/61-phone-all.png`. Still to feel on real glass: the sheet drag and the flap timing.

### v22.1 — the light theme, made to feel good

The light theme was glaring and, worse, hiding text. Rendered on a screen with every component and
scanned for contrast rather than eyeballed.

- **Text was vanishing.** Titles, the money figure, column headings and table numbers inherited
  their colour from `<body>`, which had resolved to paper-white before a wrapper switched the theme —
  so white text sat on white cards. The theme block now sets `color` itself, so it is right wherever
  it is applied: on `<html>`, on the guest layouts, on any wrapper.
- **No pure white but the cards.** The ground is a warm `#ecece7`, controls `#e3e3dd`, inputs
  `#f1f1ec`; cards stay white and get a visible edge (`rgb(23 23 28 / .10)`) and a soft, low shadow
  instead of the dark theme's deep one. Secondary text is a real grey (`#5f5f68`, 6:1) rather than a
  translucent black that shifted on every surface.
- **Accents darkened for white.** Green `#1fa84a`, red `#d9302a`, blue `#1f6fd6`, amber `#c77d0a`;
  pills and column tints recoloured to match; the green button takes dark text in both themes (8:1
  instead of 3:1).
- **A colour for text on a label-coloured surface.** In light mode the bezel colour equalled the
  label colour, so avatars, ink buttons, the active chip and occupied key cards drew dark text on a
  dark surface. `--color-on-label` (near-black in dark, white in light) replaces every such use.
- Tables, the search field, switches, chips, grey buttons, skeletons, scrims and the thermal receipt
  each got a light-mode rule so nothing is left to chance. Render: `design/63-all-light.png`.

### v22.2 — fast to open, fast to compile

**The finding.** Launcher option 1 — the everyday "open the app" — was starting the *development*
server, which compiles every page on its first visit. An owner opening the app each morning was
paying developer compile times (13 s for the first page on a slow machine). Option 1 now runs the
**production build**, building once and only rebuilding when the code under `app/`, `components/`,
`lib/` or `packages/shared/src` changed since the last build. Developers get option **11** for live
reload.

**Production, measured on the sign-in page (median of four):** first byte 28 → 22 ms, first paint
130 → 78 ms, load 105 → 59 ms, 155 kB of JavaScript.
- `requireSession` and `createClient` are memoised per request with React `cache()`: the layout and
  the page both ask, Supabase is asked once.
- `preconnect` / `dns-prefetch` to the Supabase host in `<head>`, so the TLS handshake is done before
  the first query is written.
- Assist loads after the screen paints (`next/dynamic`, no SSR), never before.
- `output: "standalone"` when `DOCKER=1`, for a faster server start on a VPS or the Box.

**Development, measured cold:** server ready 4.3 → 2.3 s; first page compile 13.3 → 10.5 s; a warm
page 0.2 s. The flip family (`Flip`, `Loader`, `Countdown`, `Waiting`, `FlipClock`) moved to
`components/ui/flip.tsx`, a module with no animation library, icon set or router, so the sign-in
wall compiles without dragging the whole kit. Keep `.next` between runs — Turbopack's cache makes the
second start much faster; the launcher never deletes it.

**Links:** re-audited after every change since v20.1 — 48 targets against 47 routes and 11 API
routes, every one resolving (the same four regex false positives as before).
