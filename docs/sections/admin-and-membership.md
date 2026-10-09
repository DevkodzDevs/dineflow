# Master console, membership and about

**Routes** `/admin` · `/admin/compliance` · `/membership` · `/about`
**Files** `app/admin/**` (~1386 lines) · `app/membership/**` · `app/(app)/about/AboutBody.tsx`
**Reads** `restaurants`, `membership_keys`, `admin_log`
**Writes** `admin_overview`, `admin_property_detail`, `admin_create_property`,
`admin_update_property`, `admin_delete_preview`, `admin_delete_property`, `admin_act_as`,
`admin_stop_acting`, `admin_issue_key`, `admin_set_membership`, `admin_set_contact_email`,
`admin_reset_property_password`, `admin_login_id_available`, `admin_box_status`,
`admin_compliance_overview`, `master_set_modules`, `master_set_password`, `install_sample_estate`,
`sweep_expired_demos`, `redeem_membership`

## What it is

The console you — the vendor — use across every property on the platform. It is not part of a
property's app; it sits above all of them.

## How it works

**Acting as.** `admin_act_as` puts a master inside one property; the rest of the app then behaves
exactly as that property's owner sees it, with the amber `MasterBanner` across the top saying so.
`admin_stop_acting` steps back out. **Everything done while acting is real and is logged** to
`admin_log` — that is what makes the feature acceptable at all.

**Module switches.** `master_set_modules` sets a property's `enabled_modules`, the third filter in
`modulesFor()` (see [shell-and-nav.md](shell-and-nav.md)). A property that opens a screen it is not
entitled to lands on `/dashboard?locked=1` and gets the "not switched on for this property" card.

**Membership.** `admin_issue_key` mints a key, `redeem_membership` on `/membership` turns it into a
live membership with an end date. `admin_set_membership` sets one directly. Expiry is what the trial
banner and the lockout read.

**Deleting a property** goes through `admin_delete_preview` first — it says exactly what will go —
and only then `admin_delete_property`.

**`install_sample_estate`** builds a whole demo estate; `sweep_expired_demos` clears sandboxes.

## Before you edit

- **The Master control header is two rows on a phone**: shield, brand + email (truncating) and a
  40px sign-out on the first; `AdminNav` (client, `usePathname` + `useSearchParams` in a `Suspense`)
  as a 3-up tab bar on the second, the current section filled. One row from `md`. As a single line
  it ran 13px off a 390px phone and pushed sign-out out of reach. Tab icons drop below 420px so
  "Compliance" is not truncated.
- **The console is dense on purpose with a mouse (30–36px); under `pointer: coarse` its tabs, chips,
  search, actions and row Open/menu reach 44px** (`AdminToolbar.module.css`, `RowActions.module.css`).
- **Compliance totals are compact rows on a phone** (label left, figure right), cards from `sm`.
- **The status filter is five tiles on a phone** (`@container (max-width: 560px)` at the end of
  `AdminToolbar.module.css`): one row, `repeat(5, minmax(0,1fr))`, count large over a short name (All
  · Active · Trial · Expired · Box), the colour as a corner dot and a 3px bottom bar on the one that is
  on; the "N properties / N of M shown · Clear" line sits above them. They were wrapping pills, two
  rows over one. Each button carries `aria-label="<full label>, <count>"` because on a phone its full
  label is hidden and the short one is `aria-hidden`. iPad and desktop keep the chips.

- **The membership status line is prose, not a flex row.** As `flex items-center` every text run
  became its own column ("Active / . / Yearly / plan · renews by"). The "2 months free" pill wraps
  under "Yearly" rather than leaving its card.

- **Every admin RPC must check `is_master` inside the function.** The route being under `/admin` is
  not a permission.
- **Acting-as must stay visible.** Never suppress `MasterBanner`, and never let a test leave a
  session acting — every suite here ends with `admin_stop_acting` in a `finally`.
- **A delete is irreversible.** The preview step is required, not a nicety.
- **A master's own password reset for a property (`admin_reset_property_password`) is a serious
  capability.** It is logged; keep it that way.
- **`/about` is the in-app version/credits page**, not marketing. Keep it factual.

## Not built yet

Razorpay **subscription** checkout on `/membership` — DineFlow charging a property for its own
membership — is designed but not implemented, and is blocked on the seven blanks in
`lib/company.ts` (see [legal.md](legal.md)). Note the distinction: a property's *guests* pay on the
property's own keys; a property pays DineFlow on DineFlow's.

## Verify

```
node audit-isolation.mjs    # acting-as must not widen what a tenant can reach
pnpm --filter @dineflow/web typecheck
```

Act as a property, confirm the banner, do something, confirm the `admin_log` row, stop acting.

## See also

[auth-and-session.md](auth-and-session.md) · [shell-and-nav.md](shell-and-nav.md) ·
[legal.md](legal.md) · [data-and-rls.md](data-and-rls.md)
