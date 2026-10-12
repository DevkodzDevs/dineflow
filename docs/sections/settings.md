# Settings

**Routes** `/settings` · `/settings/storefront` · `/settings/booking-page` · `/settings/printers` ·
`/settings/table-qr`
**Files** `app/(app)/settings/page.tsx` · `SettingsClient.tsx` · `actions.ts` ·
`storefront/StorefrontSettings.tsx` · `booking-page/BookingPageClient.tsx` ·
`printers/PrintersClient.tsx` · `table-qr/TableQrSheet.tsx` (+ their own `actions.ts`)
**Reads** `restaurants`, `profiles`, `dining_tables`, `menu_items`, `offers`, `printers`,
`payment_gateways`
**Writes** `admin_acting_as`, `box_issue_token`, `seed_demo_data`, `clear_demo_data`, plus the
per-page actions

## What it is

Everything about one property: its name and branding, its GST rates and check-in times, its tables,
its public storefront and booking page, its printers, and its table QR codes.

## How it works

**The `restaurants` row is the property's configuration.** `lib/auth.ts` loads the whole thing into
`session.restaurant` on every request, so a field added here is immediately readable everywhere
without a second query — and immediately part of the session payload's size.

**Storefront** (`/settings/storefront`) configures `/dine/[slug]`: what is shown, which offers run,
whether ordering is on. **Booking page** (`/settings/booking-page`) configures `/book/[slug]`:
`advance_pct`, policies, `booking_engine`.

**Bookings from Google** (`storefront/GoogleLinks.tsx`, end of the left column — the sticky QR
card on the right is untouched). The links to paste into the property's Google Business Profile,
each with where it goes (*Edit profile → Contact → …*) and a 44px copy button: Website, Menu link and
Order ahead (when delivery or takeaway is on), Reservations (when table booking is on), Room
booking (hotels and resorts). An orange note asks for *Listed publicly* first when it is off. It is
honest that Google's own hotel price box needs a certified connectivity partner. The public page
carries matching schema.org data — see [guest-facing.md](guest-facing.md).

**Payment gateways** hold the **property's own** Razorpay keys. Guest payments run on those keys,
not on DineFlow's — DineFlow is not the merchant of record for a guest's meal. This is a legal
position, not an implementation detail; see [legal.md](legal.md).

**Printers** (`/settings/printers`) supports browser printing and the local print bridge
(`scripts/print-bridge.mjs`, `Print-Bridge.bat`). **Table QR** mints the per-table codes that open
`/dine/[slug]` with a table attached.

**Demo data.** `seed_demo_data` / `clear_demo_data` fill and empty a sandbox property. They must
never be reachable on a real one.

## Before you edit

- **Kitchen → "Pantry stock leaves when…"** (`[data-stock-draw]`, two radio cards, saved by
  `saveRestaurant` as `stock_draw` — `ticket` unless *Start cooking* is chosen). It decides whether a
  dish draws its recipe when the order reaches the kitchen or when the kitchen presses Start (0092).
  Native radios, `defaultChecked` from the session's restaurant row (session_bundle sends the whole
  row, so no new plumbing). See [inventory.md](inventory.md).


- **Sections share one frame** (`Section` → `.settings-section`). Two in the same card get a rule
  and 28px between them — "Save payment settings" used to sit flush on the "Loyalty points"
  heading. The icon is top-aligned with the title, not centred on a five-line description.
- **Add a table on a phone** is two rows (Name + Seats, then Zone) and a full-width Add; at four
  columns it showed "T9" and "Mai". The per-table QR link is 40×40.
- **Loyalty's on/off is a switch row** (`card` + `Switch`, `loyaltyOn` state) with a hidden
  `loyalty_enabled` checkbox kept in step — `saveLoyalty` reads `=== "on"`, and a hidden checked
  box still posts. Round trip tested through the UI and restored (`loyalprobe.mjs`).
- **Storefront switches** carry a hidden checkbox for the form: `hidden` attribute + inline
  `display:none`, never the `hidden` class (see design-system.md).

- **A new `restaurants` column needs a default that is safe for every existing property**, because
  every property gets it the moment the migration lands.
- **Keys are secrets.** A gateway key must never be rendered into a client component or a public
  page. Check what crosses the boundary.
- **Changing a GST rate does not change past bills**, and must not. See
  [billing-and-invoices.md](billing-and-invoices.md).
- **`NEXT_PUBLIC_CLOUD_URL`** is what QR codes and share links are built from. Wrong in production
  and every printed QR points at the wrong host.
- **Membership "Manage" is a 44px target** (`min-h-11 -my-3`), the row height unchanged. It was 45×16.
- **A switch in a row is named after the row** (`<Switch name={title} />`) and brings no `<label>` of
  its own — the row is the label, and the whole row (70–90px) is the tap target. It used to nest a
  label inside the row's label (invalid HTML) and had no accessible name; `diag.mjs` reported it as
  four unlabelled 51×31 targets. `sw2.mjs`: tap the knob, tap the row text — each toggles once.
- **Four controls in the add-ons dialog are under 44px** — a known, pre-existing gap flagged by
  `responsive.mjs`. Do not treat a new one as "the same known issue" without checking.

## Verify

```
node dialog-audit.mjs    # /settings/printers and /settings/storefront open 3 of the 35 dialogs
node responsive.mjs      # 5 widths
pnpm --filter @dineflow/web typecheck
```

## See also

[guest-facing.md](guest-facing.md) · [legal.md](legal.md) ·
[admin-and-membership.md](admin-and-membership.md) · [api-routes.md](api-routes.md)

- **Sign out sits opposite the title** (`PageHeader actionsInline`): a `POST /logout` form, 44px, on
  the title's row at every width — a phone included, where `.page-actions` would otherwise drop it
  under the title.
- **Notifications card** (General, after Appearance, `#notifications`) is `NotificationSettings`
  from `components/shell/Notifier.tsx` — per device, like Appearance. The same panel opens from the
  bell for people who cannot open Settings. See [shell-and-nav.md](shell-and-nav.md).

- **Logo is uploaded** (`LogoUpload.tsx`, actions `uploadLogo` / `removeLogo`, bucket `brand` from
  0083). The browser refuses anything but PNG/JPG/WebP (SVG and GIF by name), over 5 MB, or under
  128 px, then shrinks to 512 px on the long side (WebP, PNG where WebP cannot be written) — a phone
  photo arrives at a few dozen KB. The server action checks ≤ 1 MB and the file's first bytes, uploads
  to `<restaurant_id>/logo-<time>.<ext>`, saves `logo_url` at once, and deletes the older files. A
  hidden `logo_url` input keeps the details form in step so its Save does not write the old address
  back. The file input is `hidden`, not `sr-only`: the global `input { width: 100% }` beats
  `sr-only` and a 1440px-wide invisible input pushed the page 323px sideways.
- **General → the property's own settings are separate cards, one form.** Property details (type,
  name, phone, address) · Brand (logo, colour) · Tax & billing · Rooms & stays (hotel/resort only:
  check-in/out, the inspection rule) · Kitchen · On-time promise · Tomorrow brief. They were all one
  card titled "Property details". It is still **one `<form>` and one `saveRestaurant`**, which reads
  every field — so a field moved between cards must stay inside that form, and a field that is
  hidden must still post its saved value (a restaurant posts the room GST and check-in times as
  hidden inputs; a switched-off promise posts `promise_minutes`/`promise_pct` — before this, every
  Save with the promise off reset the rate to 0). The Save sits in `.settings-savebar`, sticky above
  the bottom nav (`bottom: 92px` on a phone). **Two looks**, chosen by an IntersectionObserver on a
  1px sentinel just after it: pinned (`floating`) it is a lifted, rounded bar with `margin-right: 72px`
  so it ends before the Assist button beside it; at the end of the form it rests as a card exactly the
  width of the others. **It reports state, not a fixed sentence:** "No changes yet" (grey tick, Save
  disabled) → "Unsaved changes" (amber pulsing dot, Save live) once any field fires `input` (the logo
  picker excepted — it saves itself) → "Saving…" → "All changes saved" (green tick) or "Couldn't save"
  with the reason. The hint under the title is short ("Edit a card, then save") — pinned on a phone it
  has ~170px, and "Edit any card above, then save" was cut off — and wraps to two lines rather than
  truncating, so a long error reads in full. Probe: `props.mjs` (15 checks).
- **Account & security is three rows in one panel** — Password (sign-in ID, or "Signed in from Master
  control" when there is none — it used to print "Signed in as ."), Recovery email (where codes go, or
  an amber "Missing"), Membership (plan and date, a status pill, the whole row links to /membership).
  Detail lines wrap to two lines on a phone rather than truncate.
- **Attendance is its own tab** (`AttendanceSettings.tsx`): four rows — Manual, QR badge, Fingerprint /
  Face ID, Selfie + location — each a switch for the owner and an On/Off label for anyone else, under a
  "Only the owner can change how attendance is taken" line. Turning on Selfie shows *Where the property
  is*: "Use this device's location" (needs `geolocation=(self)` in the Permissions-Policy) and a 50–500
  m radius. Saved through `set_attendance_settings` — the owner check is in the RPC; the switches are
  only the face of it. When the server has no `SUPABASE_SERVICE_ROLE_KEY`, an orange note says the
  phone ways cannot work yet. With five tabs the bar scrolls on a phone, so a tapped tab scrolls itself
  into view. See [staff-and-labour.md](staff-and-labour.md).
- **Printers → "kick the drawer" does something now** (0087): `openDrawer()` sends ESC p to every
  bill printer with the switch on, after a cash settlement and after a cash in/out on Cash & controls.
  Browser printing cannot kick a drawer.
