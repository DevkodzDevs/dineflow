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
0098_security_hardening       — full audit 2026-10-13: anon reach, cross-property RPCs and FKs, counted code tries,
                                rate limits, module walls, Box token, CSPRNG codes, sign-in throttle (see below)
0099_sample_estate_passwords  — each sample owner its own generated password; the old shared one scrambled
0100_money_and_public_correctness — folio = stay invoice; dining invoice = its bill; no GST without a GSTIN;
                                counters closed + unique bill/invoice numbers; room GST default 5; a lapsed
                                property takes nothing; photo credits; "Push" says nothing was sent
0101_queue_page_name          — queue_place(slug): the public queue page could never find its property
0102_pulse_reads_history_once — table_pulse / table_pulse_for read the 90-day dwell history once
                                (dwell_medians + dwell_pick), not once per dining table; same figures
0103_calls_tokens_screen_feedback — Batch 1 of the Petpooja gap list: service_calls (a table's QR calls a waiter,
                                the bill or water), daily takeaway tokens (orders.token_no, order_tokens,
                                trigger orders_token), restaurants.screen_key + screen_feed (the TV), guest_feedback
                                (private ratings); service_calls and guest_feedback in the realtime publication
0104_screen_key_rotate        — my_screen_key(true) works: gen_random_bytes is extensions.gen_random_bytes
0105_expenses_checklists_payouts_phone_tally — Batch 2: expenses (+ cash_movements link), checklists +
                                checklist_runs, channel_settlements, orders.delivery_address + customers.address,
                                phone_order_card / order_delivery, report_extra, tally_company / tally_ledgers + tally_days
0119_theme_royal              — user_prefs.theme and set_my_theme accept 'royal' (royal classic); nothing else
0118_theme_bright             — user_prefs.theme and set_my_theme accept 'bright' (colourful light); nothing else
0117_theme_colour             — user_prefs.theme and set_my_theme accept 'colour' (the colourful theme); nothing else
0116_work_by_department       — _my_dept, _work_dept_ok, _work_board_sees; jobs and table_cleanings RLS by department;
                                _clean_job refuses another department's job; clean_board / work_board filtered; work_log
0115_session_department       — session_bundle's profile carries department and position
0114_work_board_key           — work_board: the new jobs under 'work', the cleaning jobs keep 'jobs'
0113_work_jobs                — jobs (every department's work: category → department, priority → due, repeat, a labourer,
                                a note) + _job_who / _job_repeat; job_add / job_assign_labour / job_cancel; the clean_*
                                functions take kind 'job', clean_done an optional note; kots.started_by / ready_by /
                                served_by + _kot_who; work_board
0112_cleaning_inspection      — housekeeping_tasks inspected_by / inspected_at / inspection; inspect_room stamps the clean
                                and gives a failed room back to whoever cleaned it; clean_board adds To inspect, arrival, VIP
0111_cleaning_jobs            — table_cleanings (+ a trigger on dining_tables occupied → free), restaurants.table_cleaning,
                                housekeeping_tasks place / assigned_by / assigned_at / taken_by / taken_at / done_by
                                (+ _hk_who), clean_board / clean_take / clean_done / clean_release / clean_assign /
                                clean_skip / clean_settings_save
0110_tally_stay_ledgers       — tally_settings_save takes room_sales / guest_services / discount / debtors
0109_close_known_limits       — feedback_ip_hits + feedback_submit(…, p_ip_hash) (five an hour per visitor);
                                staff_pay.pf_basic_pct, restaurants.payroll_wage_rule, payroll_runs.wage_rule,
                                payroll_lines.pf_wage, _payroll_pf_wage / _payroll_figures_v2; tally_days returns
                                stays; _copy_menu copies add-ons, their links and combos; chain_overview end dates;
                                admin_match_chain_membership
0108_review_fixes             — the review of 0103–0107: outlets never extend a trial; no screen_key in the
                                session; a separate allowance for anonymous feedback; prototype names refused as
                                positions; checklists count only remaining duties; payouts skip never-accepted
                                orders; payroll — net never below zero, no advance taken twice, the whole cost
                                expensed on pay, nobody but the owner sets their own pay
0107_staff_positions          — profiles.position / position_title / department / reports_to / joined_on +
                                staff_set_position; acting_profile() answers the outlet being worked in
0106_outlets_and_payroll      — Batch 3: restaurants.chain_id, outlet_access, outlet_session; auth_restaurant_id() and
                                session_bundle() answer the outlet this sign-in chose; outlet_* / chain_* RPCs;
                                staff_pay, staff_advances, payroll_runs, payroll_lines + payroll RPCs
0121_after_deploy_secrets     — api_key out of SELECT on both channel tables; request_password_otp closed to API roles
                                (was pending/; applied by hand in the SQL Editor after the deploy, 2026-10-19)
0120_control_room_owner       — effective_modules() gives 'dashboard' to the owner and a manager it was ticked for only
                                (was pending/; applied by hand after the deploy, 2026-10-19 — dashboard.md)
0122_checklists_by_department — checklists.departments (empty = everyone); RLS on checklists and checklist_runs hands
                                a person the lists for everyone and for _my_dept(); a six-argument checklist_save;
                                checklist_tick refuses another department's list (expenses-and-checklists.md)
0123_checklists_by_job_and_position — checklists.jobs (role keys) and .positions (profiles.position keys); a list is
                                for a person whose team, job or position it names (_checklist_for_me(d, j, p)); an
                                eight-argument checklist_save; checklist_tick uses the same rule
0124_staff_voice              — Feedback & complaints: staff_voice, staff_voice_authors (the only place an anonymous
                                item's author is kept; read "own rows" only), staff_voice_replies; the owner reads every
                                item, anyone else their own (not managers); voice_send/reply/set_status/seen/unread;
                                dry-run passed (dry124.cjs, 34), applied 2026-10-20 (staff-voice.md)
0125_my_profile               — profiles.display_name, emergency_name/_phone, about, languages, avatar_tone; my_profile_save
                                writes ONLY the caller's own row and ONLY those columns (+ phone, contact_email — a new
                                one clears contact_verified_at). dry125.cjs 21/21, applied 2026-10-20 (my-profile.md)
0126_menu_by_job              — role_modules.default_set narrowed to each job's own screens; profiles on a position
                                list exactly as the Staff screen wrote it moved to the narrower list (staff-and-labour.md);
                                dry126.cjs 33/33, applied 2026-10-20
0127_staff_leave              — staff_leave (ask / withdraw / decide: leave_request, leave_cancel, leave_decide); read by the
                                person, the owner and managers, and a supervisor for their own team (_leave_mine_to_see,
                                _dept_of); my_payslips() — the caller's own final payroll lines with their month.
                                dry127.cjs 30/30, applied 2026-10-20 (my-day.md, staff-and-labour.md)
0128_app_files                — the public Storage bucket `app-files` (100 MB, .apk/.exe types; only is_master() may
                                write, in android/ or windows/), app_releases (one is_current per platform; anon reads
                                current rows only), app_release_publish / app_release_make_current (Master control
                                only). applied 2026-10-20 — dry128.cjs 19/19 (admin-and-membership.md, docs/install-builds.md)
0129_app_release_links        — app_releases.external_url (https, ≤ 500); file_path and size_bytes nullable, exactly one of
                                file_path / external_url (app_releases_file_or_link); app_release_publish_link (Master
                                control only, https, .apk/.exe by platform, new version) — a file kept on Cloudflare R2.
                                dry129.cjs 17/17, applied 2026-10-20 (admin-and-membership.md, docs/install-builds.md)
0130_login_domain_cloud       — new DineFlow sign-in ids end in @dineflow.cloud (to_login_address, admin_create_property,
                                admin_realign_login_to_code, the two backfills, create_demo_sandbox → @demo.dineflow.cloud),
                                re-created from their live bodies; an id whose name exists on @dineflow.local is refused.
                                Existing .local logins are not moved; sign-in and forgot-password try a bare id on .cloud
                                then .local (login.ts loginCandidates). dry130.cjs 8/8, applied 2026-10-20 (auth-and-session.md)
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

- **pgcrypto lives in `extensions`, not `public` (0104, 2026-10-17).** A function with `set search_path = public`
  cannot see `gen_random_bytes` — 0103's `my_screen_key(true)` failed on every call ("function
  gen_random_bytes(integer) does not exist") and the owner could never switch an old TV link off. Write
  `extensions.gen_random_bytes(...)` (or `gen_random_uuid()`, which is core). A column default is safe: it is
  resolved when the migration runs. The 0103 dry run did not try the rotation — test every branch of a new RPC.
- **0123 — checklists by job and position (2026-10-20).** Applied before its code, safely: both new columns default to
  `'{}'`, so every list stays as 0122 left it; the five- and six-argument saves the deployed screens call are untouched
  and never write jobs or positions (the eight-argument one has no defaults, so PostgREST's named call picks by key
  count). The RLS policy now calls `_checklist_for_me(departments, jobs, positions)`; 0122's one-argument form is left
  in place, unused. Dry run `dry123.cjs` (23, rolled back); after: 3 saves (5, 6, 8 arguments), the policy on the new
  rule, 0 lists with a job or position audience, `notify pgrst` sent.
- **0122 — checklists by department (2026-10-20).** Applied before its code, safely: every existing list has
  `departments = '{}'` (everyone), so the deployed screens see exactly what they saw; the old five-argument
  `checklist_save` is untouched (the new one has a sixth, `p_departments`, with no default — so PostgREST's named-argument
  call with five keys can only match the old one, and six only the new). Dry run `dry122.cjs` (23, rolled back).
- **0119 — royal classic (2026-10-18).** The same widening for `'royal'`; dry-run `dry119.cjs` (6, the same checks).
- **0118 — colourful light (2026-10-18).** The same widening as 0117 for `'bright'`; dry-run `dry118.cjs` (6, the
  same checks). Applied before its code, safely — old code never sends it.
- **0117 — the colourful theme (2026-10-18).** Widens `user_prefs_theme_check` and `set_my_theme`'s guard to
  `('dark', 'paper', 'colour', 'system')`; the policy and grants are 0078's. Dry-run `dry117t.cjs` (6: saves colour,
  the old three still save, an unknown name is refused by the function and by the column check, session_bundle
  carries it, anon cannot call it). Safe to apply before the code that sends it — the old code never sends 'colour'.
- **0116 — work by department (2026-10-18).** The `jobs_read` and `table_cleanings_read` policies now also call
  `_work_dept_ok` (stable, security definer, one `profiles` read). A supervisor with no department passes, so live
  properties — none of whose people have a department yet — lose nothing. `work_log` is owner / manager only.
  Dry run `dry116.cjs` (22).
- **0113 / 0114 / 0115 — Work (2026-10-18).** `jobs`: RLS on, one select policy, no writes for anyone but the functions
  and triggers; in the realtime publication. `job_add` is any signed-in person's, but giving the job to someone is checked
  there too; `job_assign_labour` and `clean_assign` are supervisors'; `job_cancel` is the raiser's, the taker's or a
  supervisor's — its check coalesces nulls (`not (null or false)` is null, which does not raise: a stranger dropped a
  job in the rehearsal before the fix). `clean_done(text, uuid)` was dropped and recreated with `p_note default null`.
  `_kot_who` is a trigger on `kots`, stamped from `auth.uid()` inside the cook's session. `session_bundle` adds two
  fields (0115) and keeps its grants; a definition read back with `pg_get_functiondef` ends without `;` — add one before
  anything that follows. Dry runs: `dry113.cjs` (34), `dry114.cjs` (34), `dry115.cjs` (2).
- **0112 — the inspection loop (2026-10-18).** `inspect_room` keeps its checks and grant (owner, manager, supervisors);
  the re-clean it creates on a fail is given to the last cleaner only while that profile is active. `clean_board`
  returns `inspect` only to whoever may assign, and only where `hk_inspect_required`. Dry run `dry112.cjs` (14).
- **0111 — cleaning jobs (2026-10-18).** `table_cleanings`: RLS on, one select policy (`auth_restaurant_id()`), no
  insert / update / delete for anyone — the trigger and the `clean_*` functions write it; in the realtime publication.
  The trigger is `security definer` and only inserts or closes jobs. `clean_assign` is owner / manager / supervisor /
  supervisor 2 only; `clean_settings_save` owner / manager. Every function is revoked from anon. Dry run: `dry111.cjs`
  (36) — including a waiter refused, a direct insert and update refused, anon reads and calls nothing, another
  property sees nothing. [cleaning.md](cleaning.md)
- **0109 / 0110 — the known limits closed (2026-10-18).** `feedback_ip_hits` has RLS on, no policy and no grants:
  only `feedback_submit` (8 arguments, anon) reads and writes it; the hash is cleaned to hex, the 7-argument
  version still runs every other rule. `admin_match_chain_membership` is platform admin only. `staff_pay_set` takes
  `p_basic_pct` (1–100) and still goes through `_payroll_may`. `tally_days` adds `stays`: issued stay and facility
  invoices of the period with their lines' SAC and taxable value and the folio's payments (as the invoice page reads
  them). Dry runs: `dry109.cjs` (17), `dry110.cjs` (1).
- **0108 — the review of 0103–0107 (2026-10-17).** `session_bundle` now drops `screen_key` as well as `box_token` (the
  TV link is owner / manager only through `my_screen_key`; it reached every role's page payload). `outlet_create`
  refuses an outlet whose membership has lapsed and gives a new outlet made from a trial the same end date, so
  opening outlets cannot extend a trial. `feedback_submit` counts table-less, phone-less notes in their own 15-an-hour
  allowance. `staff_pay_set` / `advance_add` go through `_payroll_may`: only the owner sets their own pay or anyone's
  at or above them. Dry run: `dry108.cjs` (18).
- **0106 changed `auth_restaurant_id()` (2026-10-17).** It now answers `coalesce(_outlet_current(), profiles.restaurant_id)`
  for an active profile — the outlet this sign-in switched to, while `outlet_access` still allows it — and the master
  branches are unchanged. Every policy depends on it; the dry run (`dry106.cjs`, 47) and the four suites were run
  after it. See [chain-and-payroll.md](chain-and-payroll.md).
- **0105 (2026-10-17) — who may do what.** `expenses` is read by owner, manager, supervisor, cashier (the RLS policy
  itself checks the role, not only the property); `expense_void` is owner or manager. `channel_settlements` is read
  and written by owner or manager only. `checklists` / `checklist_runs` are read by the whole property; lists are
  written by owner, manager, supervisor, and anyone may tick. `report_extra` is owner, manager, supervisor (and the
  platform admin); `tally_days` and `tally_settings_save` owner or manager. None of the 0105 functions are anon's.
  **Do not read `restaurants` directly as a signed-in user** — since 0098 that is refused; the session bundle
  (`to_jsonb(r)`) carries `tally_company` / `tally_ledgers` to the page.
- **0103's public writes and their limits.** `dine_call(slug, table_qr, kind)`: anon, idempotent (an open call of the
  same kind is returned with `again:true`), 12 an hour per table, 400 an hour per place; `dine_call_status` shows
  that table's last 30 minutes. `service_call_done(p_id | p_table)`: staff only. `feedback_submit`: anon, rating
  1–5, up to eight tags of 30 characters, 60 an hour per place, 6 an hour per table, 3 a day per phone; the
  phone is stored as digits. `feedback_seen`: staff. `screen_feed(key)` answers only a key of 16+ characters for
  a property in trial or active; `my_screen_key` is owner or manager. Anon reads neither table (no anon policy).

- **0102 (2026-10-13): the pulse reads its history once.** `table_pulse()` and `table_pulse_for(p_rid)` called
  `dwell_minutes()` per dining table — free ones too — each a scan of 90 days of paid dine-in orders; Pulse is
  live, so a 28-table floor did 28 scans per refresh (pg_stat_statements: 7,585 calls, 80 ms average).
  `dwell_medians(p_rid)` returns the medians by party size and sitting from one scan, `dwell_pick()` applies
  `dwell_minutes`' own fallbacks (size + sitting with ≥ 8 visits → size → all → 45). Neither helper is callable
  by anon or authenticated; the two pulse functions keep their grants. `dry102.cjs`: all 14 properties identical
  before and after inside one transaction (the same `now()`); the busiest 114 → 39 ms and `table_pulse_for`
  215 → 32 ms, both including a ~30 ms round trip from India. `dwell_minutes()` is unchanged for its callers.
- **What the database spends its time on** — `pgstat2.cjs` (by function, cumulative) and `pgsnap.cjs save/diff`
  (one run). Development and production share this database, so a diff includes live traffic. 2026-10-13:
  `session_bundle` (102k calls, 14 ms), `kots_needs_live`, `table_pulse`, `menu_pairings`, `menu_stock` — the
  live screens' polling. Timed as an owner, net of the round trip, every heavy function is 0–25 ms at today's
  sizes except the pulse (fixed above); the averages are inflated by spikes on the Micro compute (the same call
  5 ms in one run and 52 ms in the next).
- **0093** — `selftest_runs` (master-only policy, wrapped `is_platform_admin()`), `selftest_db()` and
  `selftest_functions(uuid)` (both raise `42501 master only` for anyone else; anon has no execute).
  `selftest_functions` stands the caller inside the property for the calls and puts the context back
  — the previous property, or none — inside the same transaction (since 0095 through the
  `_acting_*` helpers, for that sign-in only). `dry93.cjs` (10).
- **0095 — a master's "inside this property" is per sign-in** (2026-10-13). `admin_context` held one
  row per account, and every sign-in of the account shared it: an iPad and a laptop, a browser test,
  the Testing console. Open anywhere moved the others; Back anywhere took them out. The next screen
  then found a master inside no property, and `requireSession` (lib/auth.ts) sent it to `/admin`.
  The owner saw "sometimes a menu tap goes back to Master control" while probes signed in as the
  same account opened and left properties against the same database.

  Now `admin_session_context` (`session_id` primary key = the JWT's `session_id`, `user_id`,
  `restaurant_id`) holds one row per sign-in:
  - `auth_session_id()` reads the claim. `auth_restaurant_id()` and `admin_acting_as()` read this
    sign-in's row.
  - `admin_act_as` sets it and tidies away rows of this account's ended sign-ins (never its own).
    `admin_stop_acting` clears it.
  - `seed_property`, `admin_create_property`, `install_sample_estate`, `admin_delete_property` and
    `selftest_functions` go through the internal `_acting_set/_get/_clear` (definer, revoked from
    public/anon/authenticated).
  - A call with no session id keeps the old account-wide `admin_context` row, so nothing that worked
    before stops.
  - The table is read-only to its own master (`user_id = (select auth.uid())`); writes come only
    through the functions.

  Every re-created body came from `pg_get_functiondef` on the day, with only the context lines
  changed. Dry run `dry95.cjs` (19, rolled back): two sign-ins keep their own property through
  Open, Back and the self-test; RLS follows the sign-in; the no-session path, staff, anon and a
  non-master behave as before; a direct write is refused; ended sign-ins are tidied. Browser:
  `twosign.mjs` (10), `openback.mjs` (6). A sign-in opened before 0095 that was inside a property
  through the old row has to press *Open* once more.


- **0092** — `restaurants.stock_draw` (`ticket` | `cook`, check constraint), `consume_recipe()` rewritten
  (draw on insert in ticket mode; credit on `pending → cancelled`; once-only by the ledger's net for the
  line; `dineflow.skip_consume` still honoured), `forecast_day` replaced whole (0025's body plus the
  reorder lines). No new table or policy. `dry92.cjs` (14) — both modes, the credit, the mid-service
  switch, billing after sending, the check constraint, the reorder arithmetic, idempotence.


- **Write policies wrapped: `(select auth_restaurant_id())`, never a bare call** — the same for
  `auth_role()` and `is_platform_admin()`. Bare, Postgres calls the function once per row and cannot
  use the `(restaurant_id, …)` indexes: "the last six paid bills" scanned every property's bills,
  64.7 ms at 2 477 bills and growing with every bill written. **0091** rewrote all 70 such policies
  (an `alter policy` loop over `pg_policies`; idempotent): 2.1 ms. Its dry run counted every one of
  83 RLS tables as owner, staff, another property's owner, master-acting and anon — identical before
  and after. A new migration that adds a policy should use the wrapped form from the start.
- **Don't add up rows in Node.** PostgREST returns at most 1000 rows a request, so a page that sums
  what it fetched is silently wrong past 1000 — and slow long before. Count in SQL: **0089**
  `invoice_summary(p_days, p_kind)` (Invoices' tiles and six-month strip) and **0090**
  `dashboard_figures()` (Control room: takings today, the 7-day curve, top 5 dishes) — both read-only,
  security definer, scoped to `auth_restaurant_id()` and gated by `has_module`. Dry runs: `dry89.cjs`
  (8 — matches the rows; 1 500 extra invoices still exact), `dry90.cjs` (4 — 1 200 bills and 1 500
  dish lines still exact), `dry91.cjs` (4).


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
- **0096 — Help & support.**
  - `support_tickets` (number from an identity; kind, privacy topic, priority, status, consent `allow_access`, context
    jsonb ≤4 KB, `due_by` = 15 days for privacy, rating) and `support_messages` (side user/support, `internal`,
    `event`, `attachments` paths).
  - RLS select: the raiser, the property's owner and manager, every master; internal notes masters only. No direct
    writes.
  - A private bucket `support` (3 MB, PNG/JPEG/WebP): insert and select only in the folder of a request the caller
    can see, `<property>/<request>/…`.
  - Property RPCs: `support_open` (ten an hour), `support_reply`, `support_attach`, `support_set_status`,
    `support_set_access`, `support_rate`, `support_seen`, `support_unread`.
  - Master RPCs (each checks `is_platform_admin()`): `admin_support_list`, `_ticket`, `_reply` (reply or internal
    note, status in the same step), `_set`, `_seen`, `_badge`.
  - Times are `clock_timestamp()`, so a reply and its status event keep their order. Dry run `dry96.cjs` (26).
- **0097** — `support_files_delete` (Storage delete, masters only) and `admin_support_drop_file`. Storage refuses a
  direct `delete from storage.objects`, so files go through the API. Dry run `dry97.cjs` (4).
- **Money** — `payments`: no direct writes. `bills`: no direct insert, update or delete — since 0087
  `guard_bill_update` refuses every direct update ("a bill can only be changed from the till"); a
  void goes through the till's RPC with a reason (0084 had still allowed voiding an unpaid bill). `invoices`: no direct insert/delete; a direct update
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
migration *with a reason*. **Adding a SECURITY DEFINER function?** Since 0098 a new function is *not*
executable by anon or PUBLIC (default privileges changed for role `postgres`): signed-in screens and the
service role get it, a stranger does not. A public-page RPC needs `grant execute on function … to anon`
on purpose. Check the caller inside either way. Re-verify with `dry98.cjs` (63 dry / 57 live),
`walls.cjs` (27) and `t0085.cjs` (7) — see testing-and-gates.md.

## Security hardening (0098, 0099) — 2026-10-13

A full audit of the live database and the app. Each item was shown open on the live database first
(`dry98.cjs` without DRY, every case rolled back), then closed.

- **What anon may run.** 158 security-definer functions were executable with the anon key. Now only
  the public pages' RPCs (`dine_busy/discover/order/reserve/slots/storefront/track`, `public_*`,
  `queue_*`, `checkin_*`, `pay_link*`, `proof_open`, `ical_feed`, `ingest_online_order`), the Box's
  (`box_pull/push/sync`), `create_demo_sandbox`, and the helpers RLS policies call (found by name in
  `pg_policies`) — 28 in all, and 0101's `queue_place`. Signed-in and service-role access is exactly what it was. Internal:
  `next_number` (anyone could bump any property's bill/invoice counters), `accept_online_order_for`
  (anyone could turn any property's online order into a kitchen ticket), `gen_temp_password`,
  `quote_wait(party, property)`. `dine_review` is closed outright (nothing calls it; unlimited
  unverified reviews moved a place's rating). Anon has no INSERT/UPDATE/DELETE on any table, now or for
  tables to come. `sync_state` and `neighbours_cache` read: signed-in only.
- **One property cannot reach another's rows.** `post_order_to_room` (the order must be the property's
  and still open), `place_order` and `reservation_set` (the table), `create_booking` (the room, a chosen
  guest), `set_rate_inventory` (the room type — a rival's booking page could be shown sold out or ₹1),
  `staff_login_domain` (the caller's own property; Master control any), `quote_wait(party)` (always the
  caller's own — the queue's internal `quote_wait(party, property)` is not callable from the API).
  `public_availability` and `public_book` read rate rows of the property's own room types only.
- **`zz_same_property` on every FK between tenant tables** (68 columns, 38 tables): BEFORE INSERT /
  UPDATE OF the FK columns or `restaurant_id`, `_same_property()` (definer, so RLS cannot hide the row
  it looks up) refuses a row that points at another property's row — "room_id belongs to another
  property (rooms)". A missing row is left to the FK. **A new FK between two tenant tables gets no
  trigger by itself:** re-run 0098's section 8 block in the migration that adds it. The one row that
  already crossed (a housekeeping task, from the shared master context 0095 fixed) was deleted.
- **A wrong code is counted.** `verify_password_otp`, `reset_password_with_code`, `staff_verify_contact`
  updated the try counter and then raised — and the raise rolled the update back: unlimited guesses at
  a six-digit code. They now answer `{ok:false, error}` for a wrong code or too many tries; the server
  actions surface `error`. Any new "count, then refuse" must not raise in the same transaction.
- **Codes from the cryptographic generator.** `_random_digits(n)` (56 bits of `gen_random_bytes`) for
  every one-time code; `gen_temp_password()` = Dine + one of 32 words + six digits + a symbol (~160
  million, was ~500,000 from `random()`); invite codes 12 hex characters (48 bits, was 32).
- **Rate limits** — `rate_hits(bucket, at)` (RLS on, no policy) and `_hit(bucket, max, window)`; a hit
  made by a call that later raises is rolled back with it, so only successful calls count:
  `dine_order` 10/h per phone and 300/h per place, at most 100 lines and 99 of a dish; `dine_reserve`
  5/day per phone, 60/h per place; `queue_join` 3/h per phone, 150/h per place; `public_book` 3/day per
  phone, 20/h per property, stays ≤ 30 nights starting ≤ 2 years out, and it refuses stop-sell or a
  sold-out allotment the page itself shows; `dine_track` stops after 10 misses an hour for a phone.
  Names, phones, emails, notes and addresses are cut to length. Not per-IP: the guest's address never
  reaches the database (the storefront calls from the Next server).
- **`public_book` works.** It called `next_number('booking')` with no property in the session and
  raised for every guest ("no restaurant context for next_number"). Now `next_number('booking', rid)`.
- **Module walls** (restrictive policies, `(select has_module(…))`): `categories`, `menu_variants`,
  `addon_groups`, `addons`, `menu_item_addon_groups`, `combo_items`, `recipe_items` — Menu;
  `ota_channels`, `order_channels` — Channels; `printers`, `offers` — Settings. `menu_items` by trigger
  (`guard_menu_item_write`): Menu writes anything; Scan may add a dish; Online orders may change only
  `external_refs`. Before, any staff login could reprice the menu, add a 100% offer, or redirect the
  printers through the API.
- **The Box token** left the session payload (`session_bundle` returns `to_jsonb(r) - 'box_token'`) and
  is not selectable by anon or authenticated. **`restaurants` now has column-level SELECT** for those
  roles: a new column must be granted (`grant select (col) on public.restaurants to anon,
  authenticated`) in the migration that adds it, or a screen selecting it gets "permission denied".
  `session_bundle` (definer) sees every column regardless.
- **Partner API keys.** `ota_channels.has_api_key` / `order_channels.has_api_key` (generated). The
  Channels page selects explicit columns without the key and a blank key field keeps the saved key
  (it used to erase it on every save).
- **Sign-in.** `login_gate(login, ip)` / `login_failed(login, ip)` (service role only): ten failures for
  one typed id or thirty from one address in 15 minutes close the form for that id. The lockout check
  (`enforce_temp_password_lockout`) looks at each stale temporary password once (it bcrypt-checked
  every one on every sign-in attempt). `request_password_otp_for(user)` (service role) mints the
  password-change code for the user the session proves. `master_password_is_default()` — the overview's
  red notice. `sweep_expired_demos` is Master control's; `create_demo_sandbox` sweeps by itself.
- **0099** — `install_sample_estate` gives each new sample owner its own `gen_temp_password()`, shown
  once (an existing login keeps its password and comes back null); any account still on the old
  shared password got a random one. Dry run `dry99s.cjs` (8): the estate still builds with the triggers.
- **0121 (was `pending/after_deploy_secrets.sql`), applied 2026-10-19 after the deploy.** It takes `api_key` out of
  SELECT on both channel tables and closes `request_password_otp` to the session. It waited in `pending/` (which
  `migrate.mjs` does not read) because the screens deployed before it still `select *` and still called it. The owner
  ran it and 0120 by hand in the SQL Editor; both were then moved into `migrations/` and recorded in
  `_dineflow_migrations` without running again. Checked after: no API role can read either `api_key`, channel names
  still read, `request_password_otp` not executable by `authenticated`, effective_modules carries the control-room
  rule. Dry run `dry99.cjs` (10). **The password-change code now needs `SUPABASE_SERVICE_ROLE_KEY` on Vercel**
  (`request_password_otp_for`); without it there is no fallback any more.
- Not done here, still open: a nonce-based `script-src` CSP; membership expiry enforced in the
  database rather than only in the layout.

## Money and the public pages (0100, 0101) — 2026-10-13

From the money and GST review. `dry100.cjs` (27) ran each case on the live functions first — a stay paid
in full at ₹7,350 invoiced at ₹7,400 "unpaid"; the folio after check-out at −₹367.50; a dining invoice whose
lines added to ₹1,098.80 against a ₹1,151 total; a property with no GSTIN still charging GST; a lapsed
property taking a table order — then with 0100, all 27 right. Details live in the section notes:
[billing-and-invoices.md](billing-and-invoices.md), [front-desk.md](front-desk.md),
[guest-facing.md](guest-facing.md), [online-and-channels.md](online-and-channels.md).

- `folio_totals`, `generate_stay_invoice`, `generate_dining_invoice` were rewritten whole; every other body in
  0100 is the live text with marked lines changed, written by a session script from `pg_get_functiondef`
  dumps that asserts each replaced string occurs exactly once — a body that had changed since the dump would
  have stopped the script, not reached the database.
- `counters`: no INSERT/UPDATE/DELETE for anon or authenticated. Unique `bills_no_once (restaurant_id,
  bill_no)` and `invoices_no_once (restaurant_id, invoice_no)` (no duplicates existed).
- `restaurants.room_gst_rate` default 5 (was 12; 0066 had fixed the rows but not the default).
- **A public page never reads a table directly.** 0101 exists because `/queue/<slug>` did, got no row as a
  stranger, and turned every guest away. Use an RPC and grant it to anon explicitly.
- Not done: the direct-write walls on money tables listed in [billing-and-invoices.md](billing-and-invoices.md).

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
