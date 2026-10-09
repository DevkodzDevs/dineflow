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
