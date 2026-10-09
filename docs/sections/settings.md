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
