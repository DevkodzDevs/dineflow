# Cash & controls · Audit trail · Intelligence — the "Insights & control"

**Routes** `/controls` · `/audit` · `/intelligence`
**Files** `app/(app)/controls/{page,ControlsClient,actions}.tsx|ts` · `app/(app)/audit/{page,AuditClient}.tsx` ·
`app/(app)/intelligence/{page,IntelligenceClient}.tsx` · `components/ui/ReasonDialog.tsx` ·
`components/shell/Nav.tsx` (`FRESH`, the "Insights & control" group)
**Reads** `audit_events`, `cash_movements`, `shift_closes`, `bills`, `order_items`, `profiles`
**Writes** `cash_move` · (from other screens) `void_bill`, `cancel_order`, `cancel_line`
**RPCs (read)** `shift_expected`, `menu_engineering`, `exceptions_summary`, `day_compare`
**Migration** 0087

## What it is

Three screens added on 2026-10-11 from the product audit (`docs/audit-2026-10-11.md`), grouped in
the menu under **Insights & control** because that is what the owner asked for. They share one idea: money
and stock that leave the building without a sale should be *seen* — by whom, why, and against what
baseline.

- **Cash & controls** — what the drawer should hold now (cash sales + cash in − cash out since the
  last close; the counter adds the float), a form to record cash in/out with a reason, this week's
  movements, the last 30 shift closes with their variance, and this week's voided bills and
  cancelled dishes with the reason and the name. Owner, manager, and (since 2026-10-20) the supervisors and cashiers of
  the money teams — service, front office, finance, management; not a kitchen or engineering supervisor (`seesFresh`,
  [shell-and-nav.md](shell-and-nav.md)).
- **Audit trail** — `audit_events`, newest first, under **one filter bar** (`[data-filters]`): the
  window as a `Segmented` (Today · 7 · 30 · 90), the six kinds (All · Money · Orders · Stock · Menu ·
  People & settings, counts in a small badge) on a `Rail` that scrolls sideways instead of wrapping,
  and the search — three stacked rows on a phone with the control and the search at full width,
  one row from `lg`. It was three loose rows of pills that heaped up at 412. *Older* pages by id. Each row:
  what, which (bill 214, 2× Paneer tikka, Chicken Briyani…), the reason in quotes, the changed
  fields `before → after`, who and when, the amount. Owner and manager (supervisors until 2026-10-20; the RLS policy
  still lets one read through the API).
- **Intelligence** — a period control (7 · 28 · 90 days, a `Segmented`, full width on a phone), a
  **scoreboard** (one card, four cells of one shape: a tinted mark, a display numeral, a label, a
  line — food cost with a ring that fills to the percentage, stars, dogs, flags; 2 × 2 on a phone,
  four across from 900px, hairlines between; with no recipes the first cell says *No recipes yet ·
  Add recipes in Menu →*, never a dash), the owner's briefing (yesterday against the same weekday
  last week, today so far, wastage, low stock, the last shift's variance, discounts/voids/
  cancellations against their 28-day baseline, food cost), the menu-engineering matrix (Star /
  Plowhorse / Puzzle / Dog / No recipe / Not sold) and four exception cards. Owner and manager
  (supervisors until 2026-10-20). The scoreboard replaced four `StatTile`s — a percentage numeral beside three flip
  counters read as three kinds of tile, and an empty food cost was a bare "—".

## How it works

**The trail is written by the database, not the app.** `audit_log()` is a definer function the API
cannot call; the triggers in 0087 call it on bills (a discount on insert, a void), orders (cancel,
merge), order_items (a single cancelled line — a whole-order cancel sets the GUC
`dineflow.audit_skip_lines` so it logs once), payments, stock_ledger (adjustment, wastage, opening),
menu_items (price, availability, active), profiles (role, modules, active), restaurants (a watched
column list; only changed keys are kept), shift_closes, day_closes, cash_movements, purchase_orders.
`audit_events` has a select policy for owner/manager/supervisor and **no** insert/update/delete
policy, so nothing in the app can edit or erase it. The actor is `auth.uid()`; a platform admin
acting as the owner has no `profiles` row and shows as *Master control*; the Box and the service
role show as *Server · sync*.

**Reasons are mandatory, in the database.** `void_bill(p_bill, p_reason)` (owner/manager/supervisor/
cashier; unpaid only; reopens the order), `cancel_order(p_order, p_reason)` (owner/manager/
supervisor/supervisor_2/cashier; open and unbilled only; frees the table if nothing else runs on it),
`cancel_line(p_item, p_reason)` (anyone while the line is pending; owner/manager/supervisor/
supervisor_2 once the kitchen has started it; never a served line). All three refuse a reason under
three characters. `guard_bill_update` now refuses **every** direct change to a bill, and
`guard_cancel` (on orders and order_items) refuses a direct `status = 'cancelled'` — kitchen bumps
to preparing/ready/served are untouched. The `ReasonDialog` (quick chips + a box, confirm off until
there is a reason) is what the till, the order page and the bill show.

**Cash in / out.** `cash_movements` (kind in|out, amount > 0, reason, note) through `cash_move`.
`shift_expected` returns `cash_in`, `cash_out` and `cash_drawer = cash + in − out`; `shift_close`
measures the variance against `cash_drawer` and names the in/out in its summary. A float top-up
used to read as "₹500 over".

**Menu engineering** classes a dish against the *average sold dish*: sells at or above the average
quantity and earns at or above the average margin → Star; sells but earns less → Plowhorse; earns
but sells less → Puzzle; neither → Dog. Margin is price − plate cost, and **plate cost is the
recipe at today's `cost_per_unit`** — the only price the pantry keeps (every purchase overwrites it),
so the figure moves with purchases and says so on the screen. A dish without a recipe is *No
recipe*, never guessed. `food_cost_pct` covers costed dishes only.

**Exceptions** compare the window with the 28 days before it, per day: discounts, voids, cancelled
lines, plus cash in/out and every shift close. The briefing turns these into sentences with a tone
(warn / ok / info); the thresholds are in `briefing()` in `IntelligenceClient.tsx` — 1.5× the
baseline and at least three events for a warning, ₹100 for a shift variance, 40% food cost.

**Not modules.** The three routes are not in `ROUTE_MODULE`, `MODULES_BY_TYPE` or `role_modules`;
`FRESH` in `Nav.tsx` decides who sees the links and each `page.tsx` redirects a role that should not
be there (`?locked=…`), while the RPCs and the RLS policy check the same roles again. Adding a
fourth screen: one line in `FRESH`, a role check in its page, and the same check in its RPCs.

## Before you edit

- **Record cash in / out do not call `router.refresh()`** (2026-10-13). Their actions revalidate, and an action that
  revalidates answers with the re-rendered page — the refresh rendered it a second time. Don't add one back;
  see shell-and-nav.md (speed). `actcheck.mjs`.
- **Cash reasons are an even 2-column grid** (`[data-reasons]`, 44px tiles, a tick on the picked
  one, a long reason wraps to two lines inside the tile), with *Other reason* below —
  that box shows only a typed reason, not a picked one. They were `.chip`s wrapping into ragged
  rows on a phone.
- **Audit's kind chips sit in one `shrink-0` box inside their `Rail`** (`[data-kinds]`,
  2026-10-13). Without `shrink-0` that box, a flex item of the rail, shrank to the rail's width and
  the chips spilled out of it. The rail's end spacer then sat under the chips, so at the end of the
  scroll "People & settings" stopped under the arrow and the fade (Chrome), or cut at its left with
  an empty run after it (an iPad). Now one tap on the arrow ends with the last chip fully in view,
  clear of the arrow, at 412, 834, 1194, 1366 and 1440. Probe: `fivefix.mjs`.
- **Audit's period control fits a phone**: `[data-period]` buttons are equal, `whitespace-nowrap`,
  13px with 6px padding below `sm` — "90 days" broke onto two lines at 390.


- **Never write to `audit_events` from the app.** If a new table needs a trail, add a trigger that
  calls `audit_log()` in a new migration, with an `after` timing so a failure cannot block the row.
- **A new way to cancel or void must go through the RPCs.** A direct `update … set status =
  'cancelled'` from a server action now raises `cancel from the order screen, with a reason`.
- **`day_compare()` and the audit page use IST days** (`Asia/Kolkata`); the reports page still uses
  a rolling `now() − N days`. Do not mix the two on one screen without saying which is which.
- **Cancelling after cooking does not return stock** (0055, deliberate). The dialog's hint says so.
  Do not promise otherwise in copy — the old "Stock will be returned" confirm was wrong.

## Verify

```
node dry87.cjs            # 33 checks inside a rolled-back transaction: direct writes refused, roles,
                          # reasons, cash drawer figure, close_day split-payment fix, audit rows, RLS,
                          # menu_engineering / exceptions_summary / day_compare shapes
node newmenu.mjs 1440 dark manoooo     # the three screens at 1920/1440/1194/834/412, the More sheet,
node newmenu.mjs 1440 paper "Tanvi's"  # a cash out, a dish and an order cancelled through the dialog,
                                       # a bill voided, the trail filtered and searched; restores all
pnpm test                 # lib/print/route.test.ts covers station routing (4)
```

- **Short copy** (2026-10-23): subtitles and hints cut to a few words.

## See also

[billing-and-invoices.md](billing-and-invoices.md) · [orders-and-till.md](orders-and-till.md) ·
[kitchen.md](kitchen.md) · [data-and-rls.md](data-and-rls.md) · [reports-and-forecast.md](reports-and-forecast.md) ·
[`docs/audit-2026-10-11.md`](../audit-2026-10-11.md)

- **iPad and desktop design (2026-10-24, the owner — "desktop to iPad only, don't disturb the mobile").** Phones keep the markup they had: every new part is `hidden md:…` and the old one `md:hidden` (or the change is `md:` classes only).
  - **Shift closes, empty** (`[data-shifts-empty]`): an `EmptyState` (design-system.md) — what a close records, and **Close a
    shift in Billing** → /billing.
  - **Menu engineering's classes are flap tiles** (`[data-classes]`, `[data-class=star|plowhorse|puzzle|dog]`): each in its own
    colour along the top (Star green, Plowhorse amber, Puzzle blue, Dog red), its icon (star, tractor, puzzle, dog), the name,
    the count on the `StatTile` flap (`.flip-stat`, the tile an `@container`) with "dishes" beside it, and what to do. Four
    across from `lg`, two below. A tapped class gets a ring in its colour and a tick; tapping again shows all. The name is
    the hue mixed 62% toward the label colour — the pure hue measured 3.4:1 on the colourful-light card.
- **Shorter copy (2026-10-29, the owner: "maximum 3 or 4 words, try 2 or 3 — clean and neat").** Subtitles, hints, helper
  lines and empty-state hints cut to two–four words, or removed where they said the obvious. Error and refusal messages,
  steps to follow outside the app, printed and exported text, WhatsApp bodies and tooltips were left as they were.
