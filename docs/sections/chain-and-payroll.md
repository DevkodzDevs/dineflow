# Outlets (a chain) and payroll

**Routes** `/chain` · `/payroll` (`?m=2026-09`) · the outlet switcher in the top bar (every screen)
**Files** `app/(app)/chain/page.tsx` · `ChainClient.tsx` · `actions.ts` · `components/shell/OutletSwitcher.tsx` ·
`components/shell/TopBar.tsx` · `lib/auth.ts` (`Session.outlets`) · `app/membership/page.tsx` ·
`app/(app)/payroll/page.tsx` · `PayrollClient.tsx` · `actions.ts`
**Reads** `outlet_access`, `outlet_session`, `staff_pay`, `staff_advances`, `payroll_runs`, `payroll_lines`, `profiles`
**Writes** `outlet_switch`, `outlet_create`, `outlet_grant`, `chain_overview`, `chain_people`, `chain_push_menu`,
`my_outlets`; `payroll_settings_save`, `staff_pay_set`, `advance_add`, `payroll_build`, `payroll_line_set`,
`payroll_finalise`, `payroll_pay` (all 0106); `admin_match_chain_membership` (Master control, 0109)

## What it is

**Outlets**: an owner with a second (or tenth) place runs them from one sign-in. The top bar says which outlet this
device is working in and switches it; `/chain` shows every outlet's day live side by side. **Payroll**: the month's
pay for the people who sign in, from their attendance, with PF and ESI when switched on.

## How it works

- **An outlet is still a whole property** — its own `restaurants` row, staff, menu, tables, bills, stock and
  membership. Nothing per-screen changed: `auth_restaurant_id()` answers the outlet *this sign-in* chose
  (`outlet_session`, keyed by the JWT's session id — a phone and a laptop can be in different outlets, the lesson of
  0095) provided `outlet_access` still allows it, else the person's own. Every policy and function already goes
  through it (checked: 1 of 314 functions and 0 of 145 policies read `profiles.restaurant_id` for the caller). Cost:
  +0.3 ms on the busiest property's 4,869 order lines.
- **`session_bundle`** returns the chosen outlet as `restaurant`, `profile.restaurant_id` = that outlet (so "this
  property's staff" queries follow) with `profile.home_restaurant_id`, and `outlets` (only when the person has more
  than their own). The switcher shows only with two or more; choosing reloads on `/dashboard` (`location.assign`) so
  no screen or realtime channel keeps the last outlet. A locked outlet (trial over) shows the switcher on
  `/membership` so the owner is not trapped there.
- **Opening one** (`outlet_create`, owner only, not from a demo): copied from the outlet the owner is in — kind,
  enabled sections, brand, GST rates, legal name/PAN, loyalty and payroll switches — eight tables, the menu (or the
  five starter categories), `chain_id` shared, a trial of at most 7 days and never past the source's own (0108).
  Each outlet is a membership: its card on `/chain` says *Trial · n days left* / *Member until …* (`chain_overview`
  carries `trial_ends_at` and `membership_ends_at`, 0109) and, for the owner, *Switch it on* — it stands the device
  in that outlet and opens `/membership` for a key. Master control's property sheet has *Match its chain*
  (`admin_match_chain_membership`, 0109): the outlet takes the membership, plan and end dates of its chain's first
  outlet, logged in `admin_log`. The owner gets `outlet_access` to it.
- **Managers / supervisors** may be ticked for other outlets on `/chain` (`outlet_grant`, owner only); their role
  is the same everywhere. Taking it away also ends their open session there.
- **`/chain`** (owner, manager, supervisor — an "Insights & control" link): totals today, one card per outlet —
  sales and bills, busy/total tables, late tickets, new online orders, staff on duty, expenses, seven-day bars —
  polled every 20 s (`chain_overview`; realtime cannot cross properties). *Work here* switches. *Send this menu*
  (`chain_push_menu`, owner or manager) copies categories, dishes and sizes by name, prices optional, deletes
  nothing; since 0109 also add-on groups and add-ons (by name, prices when asked), which dish offers which group
  (by dish name) and combo contents. The toast counts the add-ons.
- **Payroll** (owner, manager; link in "Insights & control"): rates per person (`staff_pay`, by month or day, PF/ESI
  per person); advances (`advance_add`, cash leaves the drawer); *Work out pay* (`payroll_build`) — monthly: rate ×
  (present + paid weekly offs, capped at the month's days) ÷ days in month; daily: rate × present. PF 12% + 12% on
  the **PF wage** (0109, `_payroll_pf_wage`): (gross + bonus) × the person's *Basic %* (`staff_pay.pf_basic_pct`,
  the share of pay that is basic + DA, default 100), raised to half of pay while *the 50% wage rule* is on
  (`restaurants.payroll_wage_rule`, default on — the labour codes' definition of wages, in force from 21 Nov 2025),
  capped at ₹15,000. The line keeps it (`payroll_lines.pf_wage`), the run keeps the rule (`payroll_runs.wage_rule`),
  and the sheet (*on ₹…* under each PF figure), the payslip and the Excel sheet show it. ESI 0.75% (rounded up) + 3.25% when the full monthly wage (daily × 26) is ≤ ₹21,000.
  Every unrecovered advance comes off, never taking net below zero. Bonus / other deductions on a draft line
  (`payroll_line_set`) survive *Work out again*. *Finalise* locks the month and marks advances recovered (a partly
  recovered one is split). *Pay* (`payroll_pay`) writes a **Salaries** expense via `expense_add` — so Reports, the
  drawer (cash today) and Tally see it — and the payslip (PDF, `lib/tablePdf.ts`) and the sheet (Excel) download.
- **Who reads pay**: owner and managers the whole outlet's; anyone else only their own rate and advances, and their
  own line once the month is final (`_payroll_final()` — a waiter cannot read `payroll_runs`).

## Before you edit

- **`acting_profile()` follows the outlet too (0107).** It returned the home outlet, so the eight staff functions built on
  it (invites, logins, access) acted on — or refused — the wrong outlet when an owner worked in another. Fixed there.
- **Review fixes (0108).** A new outlet made from a trial ends with that trial, and an outlet whose membership has
  lapsed cannot open another — opening outlets used to hand out a fresh 7 days each time. Payroll: other deductions
  stop at zero net; *Finalise* re-reads the advances still outstanding, so a stale draft of another month cannot take
  the same advance twice; *Pay* writes the whole cost — the net (Salaries, by the way chosen), the advance recovered
  (Salaries, cash already out when it was given) and the PF & ESI owed (employee + employer, by bank) — so Reports and
  Tally see gross + bonus − other deductions + the employer's share; only the owner sets their own pay, gives
  themselves an advance, or does either for someone at or above them. The payroll Excel total row has Gross and
  Bonus in their own columns. Queued offline orders carry their outlet and are sent only from it.
- **Never read `profiles.restaurant_id` for "where is the caller"** — use `auth_restaurant_id()` (database) or
  `session.restaurant.id` / `session.profile.restaurant_id` (app). The home outlet is `home_restaurant_id`.
- **`outlet_session` upserts on the session id**: a session belongs to one user, so a probe that reuses one fake
  session id for two users sees the second switch do nothing. Give each user their own.
- `outlet_create`'s slug variable is `v_slug` — a plpgsql variable named like a column (`slug`) is ambiguous.
- **PF is on basic + DA, not the whole pay (0109).** Sources disagree on whether EPFO has moved its own base to the
  labour codes' wages yet, so the 50% rule is a switch (on by default) and the screen says to confirm with a CA. A
  person with no `pf_basic_pct` is 100% — the old behaviour. Labourers stay under Labour.
- `_payroll_figures_v2` is what `payroll_build` and `payroll_line_set` call; the old `_payroll_figures` is left for
  any finalised month worked out before 0109. `payroll_lines.pf_wage` is the table's last column — a
  `row(...)::payroll_lines` constructor must end with it.
- A demo cannot open outlets (its outlets would outlive its sweep). `batch3.mjs` clears the demo flag for the run and
  puts it back, deleting the outlet it opened.

## Verify

```
node dry106.cjs     # 47 checks, rolled back
node dry109.cjs     # 17 checks, rolled back: PF wage both ways, the switch, add-ons copied, match-chain, feedback per visitor
node bench106.cjs   # auth_restaurant_id before/after on the busiest property
node batch3.mjs     # 25 checks on a throwaway demo — see testing-and-gates.md
```

## See also

[auth-and-session.md](auth-and-session.md) · [data-and-rls.md](data-and-rls.md) ·
[expenses-and-checklists.md](expenses-and-checklists.md) · [staff-and-labour.md](staff-and-labour.md)
- **Phones and tablets (2026-10-18):** below `lg` the month sheet is a card per person (labels from `data-label`, the
  header and footer hidden, a total card under it) instead of a 900px table that scrolled sideways; the same `<table>`
  markup, so `data-line`, `data-net`, `data-save-line`, `data-pay` and `data-payslip` are unchanged. In Pay rates on a
  phone, with PF or ESI on, the amount and the PF/Basic/ESI/Save row each take a full line (they had crushed the name to
  two letters). batch3 checks the sheet has no inner sideways scroll at 412 and none at 834.
- **The "Live · updated" clock starts in the browser** (2026-10-18): it read the time to the second on the server and
  again on waking, and when the second had turned the two disagreed — React #418 on some loads. It shows *Live* until
  the screen is up, then the time.
