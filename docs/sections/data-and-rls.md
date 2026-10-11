# Data, RLS and migrations

**Files** `supabase/migrations/*.sql` (77, applied in order) · `scripts/migrate.mjs` ·
`packages/db/**` · `apps/web/lib/supabase/{server,client,middleware}.ts`

## What it is

One Postgres database (Supabase, Postgres 17.6, `ap-south-1`) holding every property's data, with
row-level security as the wall between them.

## How it works

### Tenant isolation

Every tenant table carries `restaurant_id` and an RLS policy built on `auth_restaurant_id()`, which
reads the caller's claim. **A query that forgets the tenant does not leak — it returns nothing.**
That is safe and it also looks exactly like a bug, so check RLS before you debug the query.

Verified live: 66 policies across 65 tables; cross-tenant read, write and insert all refused.
Re-verify with `audit-isolation.mjs` after any migration that adds a table.

### RPCs are the write path

The browser does not write tables. Every mutation is a Postgres function:

- `security definer`, so it can do its job
- **a pinned `search_path`**, so it cannot be hijacked by a shadowing schema
- **its own permission check inside the function** — never trust the caller
- one transaction, so a half-applied order cannot exist

Read-side RPCs exist too (`customers_overview`, `report_summary`, `session_bundle`…) where one
round trip should answer a whole screen.

### Migrations

Numbered, additive, applied in order. Recent ones give the flavour:

```
0070_menu_options_variants_addons_combos
0071_tables_move_merge_split_and_courses
0072_customers_loyalty_coupons
0073_purchasing_suppliers_po_grn_wastage
0074_table_qr_ordering_and_sales_breakdown
0075_index_every_foreign_key
0076_storefront_sends_each_addon_once
0077_two_people_at_once
0078_theme_follows_the_person
0079_rush_hour                — set_rush, dine_busy; dine_order re-created from 0074 + pause/ETA
0080_goes_well_with           — menu_pairings(): a security-invoker read; RLS does the fencing
0081_online_checkin_and_room_move — bookings.checkin_token/precheckin; checkin_view/submit (anon,
                                by token); booking_move_room
0082_set_rates_only           — a rate per night, leaving stop-sell and minimum stay alone
0083_brand_logo_storage       — the first Storage bucket: public `brand`, 1 MB, PNG/JPEG/WebP; owner/manager write own folder
0084_role_walls_and_lockdown  — role walls inside a property; internal definer functions out of public reach; v_low_stock invoker
0085_box_tenant_guard_ota_lockdown — box_push scoped to its own property; OTA sync functions service-role only; one payment, one bill
```

**Re-creating an RPC means copying the latest body, not the first.** 0079 replaced `dine_order`
from its 0074 text plus two lines; check `pg_get_functiondef` before you re-create one, or a fix
made in between is silently undone.

**The procedure, every time:**

1. Write the next-numbered file. Additive only — new tables, new columns with safe defaults, new
   functions. Never drop or rename something a running deploy reads.
2. **Dry-run it inside a transaction you roll back.** Confirm it applies and that
   `audit-isolation.mjs` still passes.
3. Apply with `node scripts/migrate.mjs`.
4. Re-run the gates.

## Before you edit

- **A new table needs its RLS policy in the same migration.** A table without one is open to every
  tenant, and nothing in the app will tell you.
- **A new column on `restaurants` ships in every session payload.** See
  [auth-and-session.md](auth-and-session.md).
- **Index every foreign key.** `0075` exists because they were not.
- **Never renumber or edit an applied migration.** Write the next one.
- **A `security definer` function without a pinned `search_path` is a privilege-escalation bug**,
  not a style issue.
- **Dates are IST.** The business day runs on `Asia/Kolkata`, not UTC — `todayIST()` and
  `+05:30` offsets in the queries.

## Verify

```
node audit-isolation.mjs    # 66 policies, 65 tables, cross-tenant read/write/insert refused
                            # — a scratchpad suite, not in the repo; see testing-and-gates.md
pnpm build
```

`scripts/verify.mjs` replays every migration into an in-memory PGlite instance, which is exactly
the dry-run this section wants — but it currently carries absolute paths from another machine and
does not run here. Fix its paths before relying on it.

## See also

[auth-and-session.md](auth-and-session.md) · [neighbours.md](neighbours.md) (the one deliberate
hole in the wall) · [testing-and-gates.md](testing-and-gates.md)

- **Storage (0083).** `brand` is the only bucket. It is public (logos appear on signed-out pages) and
  enforces its own limits — `file_size_limit` 1 MB, `allowed_mime_types` PNG/JPEG/WebP (no SVG: it can
  carry script) — so a request that skips the app is refused too. Policies on `storage.objects`:
  insert/update/delete only where `(storage.foldername(name))[1] = auth_restaurant_id()::text` and
  `auth_role() in ('owner','manager')`; select on the same folder (to clear old logos). Remove files
  through the Storage API, not `delete from storage.objects` — that leaves the blob behind.

## Role walls inside a property (0084, 0085) — read before adding a table or a direct write

`tenant_all` walls properties off from each other. It does **not** wall roles off inside one: by
itself it lets any active staff login write any row of its own property straight through the API.
On 2026-10-10 a housekeeping login could, in a rolled-back test, make itself owner, change the UPI
ID, and delete 1,388 payments; an owner could give itself a 10-year membership. What now holds:

- **`restaurants`** — `guard_restaurant_update` (BEFORE UPDATE, direct API writes only: it returns
  early unless `current_user` is `authenticated`/`anon`, so RPCs and the service role are untouched):
  membership/plan/trial/enabled_modules/code/login_domain/box_*/rating/is_shadow/network_alias are
  RPC-only; district/pincode/lat/lng any staff (Neighbours); the Tax columns owner/manager/supervisor;
  every other column the owner. Restrictive policies refuse direct INSERT and DELETE.
- **`profiles`, `invites`** — no direct writes at all (restrictive `using (false)` for
  insert/update/delete to authenticated, anon). Staff RPCs (`staff_create_login`, `owner_set_access`,
  `create_invite`, `join_restaurant`) check rank themselves and run as owner.
- **Money** — `payments`: no direct writes. `bills`: no direct insert/delete; a direct update may
  only void an unpaid bill (`guard_bill_update`). `invoices`: no direct insert/delete; a direct update
  may change only `guest_name/phone/gstin` (`guard_invoice_update`). `day_closes`, `shift_closes`,
  `business_periods`, `night_audits`: no direct delete.
- **Internal functions** revoked from public/anon/authenticated (every caller is itself DEFINER):
  `box_export`, `box_apply`, `demo_user`, `seed_storefront`, `assign_login_domain`, `next_staff_code`,
  `table_pulse_for`, `membership_state_for`, `suggest_staff_login`, `forecast_area_factor`,
  `price_line`, `sweep_expired_temp_passwords`; signed-in only: `staff_login_domain`,
  `network_demand`, `next_labour_code`; service role only: `ical_channels`, `ingest_ota_booking`,
  `ota_log`. `v_low_stock` is `security_invoker`. TRUNCATE/TRIGGER/REFERENCES revoked from the API roles.
- **`box_push`** updates a row only if it is the box's own property's (`where <t>.restaurant_id = r.id`
  on all eleven `do update`s) — menu, category and room-type ids are public.
- **`payments_gateway_ref_once`** — a Razorpay payment id (`pay_…`) settles one bill.
- **`create_invite`** pins `search_path = public, extensions` (it calls pgcrypto); before 0084,
  inviting by code failed with "gen_random_bytes does not exist".

**Adding a direct write from a screen?** It will be refused if it touches a guarded table or column —
that is the point. Route it through an RPC that checks the caller's role, or widen the guard in a new
migration *with a reason*. **Adding a SECURITY DEFINER function?** Supabase grants EXECUTE to anon by
default: `revoke … from public, anon` unless strangers are meant to call it, and check the caller
inside. Re-verify with `walls.cjs` (27 checks) and `t0085.cjs` (7) — see testing-and-gates.md.

## Attendance (0086)

- `restaurants.attendance_methods text[]` (check: subset of manual/qr/biometric/selfie, default
  `{manual,qr}`), `attend_lat`, `attend_lng`, `attend_radius_m` (25–2000, default 150). Changed only by
  `set_attendance_settings` (owner; selfie needs a location). `guard_restaurant_update` already keeps
  these columns owner-only on a direct write.
- `labourers.punch_token` — unique, random, the identity in `/attend/<token>`. Readable by the
  property's staff (they hand it out); treat it like a password in anything you log.
- `staff_attendance`, `attendance_punches`, `attendance_passkeys`: **select-only** for the property's
  staff; no direct writes. `attendance_challenges`: no policies at all — service role only.
- `labour_attendance`: restrictive policies now **refuse direct insert/update/delete** to
  authenticated. Use `labour_mark` (manual) / `labour_punch` (QR).
- `_attend(...)` is the one place a punch is written (IST day, in → out → done, refuses a method that is
  off, logs the punch). EXECUTE is the service role's only; `labour_punch`, `staff_punch_code`
  (DEFINER) call it on the caller's behalf.
- Storage bucket `attendance` — private, 1.5 MB, jpeg/webp/png; read by the property's staff through
  `storage.foldername(name)[1] = auth_restaurant_id()`; written only by the server.

## Controls, audit trail, intelligence (0087)

- **`audit_events`** — written only by triggers through `audit_log()` (definer, revoked from the API):
  bills (`discount.give` on insert, `bill.void`), orders (`order.cancel`, `order.merge`), order_items
  (`line.cancel`; a whole-order cancel sets `dineflow.audit_skip_lines` and logs once), payments
  (`payment.take`), stock_ledger (`stock.adjust|waste|opening`), menu_items (`menu.price|availability|
  active`), profiles (`staff.access`), restaurants (`settings.change`, watched columns, changed keys
  only), shift/day closes, cash_movements (`cash.in|out`), purchase_orders (`po.status`). Select for
  owner/manager/supervisor of the property; no insert/update/delete policy at all.
- **`cash_movements`** — select for the property; writes only through `cash_move` (owner/manager/
  supervisor/cashier). `shift_expected` adds `cash_in`, `cash_out`, `cash_drawer`; `shift_close`
  measures against `cash_drawer` and now checks the role.
- **Reasons and names**: `bills.void_reason/voided_by/voided_at`, `orders.cancel_reason/cancelled_by/
  cancelled_at`, `order_items` the same. `void_bill`, `cancel_order`, `cancel_line` are the only ways to
  set them; `guard_bill_update` refuses every direct bill change, `guard_cancel` every direct
  `status = 'cancelled'` on orders and order_items (other status changes pass).
- **`close_day`** sums bills and payments apart (it used to count a split-paid bill once per payment).
- **Read RPCs** `menu_engineering(p_days)`, `exceptions_summary(p_days)`, `day_compare()` — owner/
  manager/supervisor, checked inside. Plate cost = `recipe_items.qty × ingredients.cost_per_unit`.
- Verified by `dry87.cjs` (33 checks, rolled back) — see testing-and-gates.md.

## Dish photos (0088)

`menu_items.image_credit`, `image_source` (the existing `image_url` holds the photo). A public
Storage bucket `menu` (1.5 MB, PNG/JPEG/WebP), one folder per property; insert/update/delete for
owner, manager, supervisor, supervisor_2 and chef in their own folder only; select on their own
folder. `dine_storefront` is 0076's body plus `image_url` on each dish — nothing else changed
(`dry88.cjs`: same payload size without it, anon still has execute).
