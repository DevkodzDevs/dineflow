# Front desk (hotel / resort only)

**Routes** `/frontdesk` · `/frontdesk/[id]` (the folio) · `/frontdesk/night-audit`
**Files** `app/(app)/frontdesk/page.tsx` · `FrontDeskClient.tsx` · `[id]/FolioClient.tsx` ·
`night-audit/NightAuditClient.tsx` · `actions.ts`
**Reads** `bookings`, `guests`, `rooms`, `room_types`, `booking_charges`, `orders`, `night_audits`
**Writes** `create_booking`, `check_in`, `check_out`, `folio_totals`, `post_order_to_room`,
`run_night_audit`, `night_audit_numbers`

## What it is

Arrivals, departures and who is in which room. The folio is one stay's bill as it accumulates. The
night audit is the daily close for the rooms side — the hotel equivalent of `close_day`.

**This section does not exist for a restaurant.** `modulesFor()` hides it.

## How it works

A **booking** moves `reserved` → `checked_in` → `checked_out` (or `cancelled` / `no_show`).
`check_in` assigns a room and flips the room's status; `check_out` releases it and queues a cleaning
task (see [housekeeping.md](housekeeping.md)).

A **folio** collects charges: the room rate per night, plus anything posted to it.
`post_order_to_room` is how a Room-type ticket from the till lands on a stay. `folio_totals` does
the arithmetic in one place so the folio, the invoice and the night audit agree.

The **night audit** rolls the business date forward, posts the night's room charges and prints the
discrepancy list — rooms the front office and housekeeping disagree about.

The room chooser uses `.keycard` tiles with a condition dot in the corner, so the person booking can
see at a glance which free room is actually sellable.

## Before you edit

- **A room's `status` and its `condition` are different things.** `status` is
  available/occupied/maintenance/reserved — front-office truth. `condition` is
  dirty/clean/inspected/pickup — housekeeping truth. The discrepancy report exists because they can
  disagree.
- **Check-out does not mean the room is sellable.** If `hk_inspect_required` is on, it must be
  inspected first.
- **The details line truncates and the rate does not** — `truncate` on the line, `shrink-0` on the
  rate. A long guest name used to push the rate off the card.
- **The call link is an `.icon-btn`**, so it is 44px on a touch screen.
- **Dates are IST.** `todayIST()` in `lib/format.ts`. Never `new Date().toISOString().slice(0,10)`.

## Open bug: this route ignores the theme cookie

With `df-theme=paper`, `/frontdesk` renders `data-theme="dark"` on every load, while `/tomorrow`,
`/menu`, `/housekeeping` and `/billing` all render `paper`. Someone who chose the light theme gets a
dark Front desk.

Measured 2026-10-07, three consecutive loads, no service worker involved:

```
/frontdesk   at 600ms: dark   at 4.6s: dark
             cookie says paper · attr was dark · re-running boot gives paper
/tomorrow    at 600ms: paper  at 4.6s: paper
             cookie says paper · attr was paper · re-running boot gives paper
```

The served HTML is identical on both routes — `<html data-theme="dark">` plus one `THEME_BOOT`
script — so the difference is client-side and specific to this route. The cookie is readable and
correct throughout, and running the boot logic by hand on the page fixes it, so the boot script's
result is being thrown away after it runs. Likely a hydration mismatch on this page forcing React to
re-render from the server JSX, which carries `data-theme="dark"`; `suppressHydrationWarning` on
`<html>` hides the warning that would have said so. **Not yet fixed.** Start by looking for a
hydration mismatch in `FrontDeskClient.tsx`.

See [shell-and-nav.md](shell-and-nav.md) for how the theme is meant to boot.

## Verify

```
node guests-test.mjs     # 17 checks — includes the stay rows and the phone layout.
                         # It edits a guest and puts it back; keep that property.
pnpm --filter @dineflow/web typecheck
```

## See also

[rooms-and-reservations.md](rooms-and-reservations.md) · [housekeeping.md](housekeeping.md) ·
[guests-and-customers.md](guests-and-customers.md) ·
[billing-and-invoices.md](billing-and-invoices.md)
