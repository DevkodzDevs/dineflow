# Reports, pulse, tomorrow and proof

**Routes** `/reports` · `/pulse` · `/tomorrow` · `/proof`
**Files** `app/(app)/reports/ReportsClient.tsx` · `Charts.tsx` · `Breakdown.tsx` ·
`app/(app)/pulse/PulseClient.tsx` · `app/(app)/tomorrow/TomorrowClient.tsx` ·
`app/(app)/proof/ProofClient.tsx` · each `actions.ts`
**Reads** `day_closes`, `night_audits`, `walkins`, `forecast_runs`
**Writes** `report_summary`, `sales_breakdown`, `hotel_kpis`, `kitchen_speed`, `table_pulse`,
`quote_wait`, `walkin_add`, `walkin_set`, `forecast_day`, `save_forecast`, `grade_forecasts`,
`forecast_scorecard`, `buy_purchase_list`, `record_chef_notes`, `business_record`, `proof_create`,
`proof_links_list`, `proof_revoke`, `seal_all_periods`

## What it is

Four screens that look backwards and forwards.

- **`/reports`** — what happened. Sales, breakdown by category and channel, hotel KPIs, kitchen
  speed.
- **`/pulse`** — what is happening right now on the floor: table turn, the walk-in queue, and the
  wait time quoted to the next party.
- **`/tomorrow`** — the evening brief. What to prep, what to buy, how many covers to expect.
- **`/proof`** — a shareable, revocable business record for a bank or a landlord.

## How it works

**Every number comes from an RPC, not from arithmetic in the client.** `report_summary`,
`sales_breakdown`, `hotel_kpis` and `kitchen_speed` each return a finished shape. This is
deliberate: the same figures appear on the dashboard, in reports and in `proof`, and they must not
be able to disagree.

**The forecast is graded.** `forecast_day` predicts, `save_forecast` records the prediction, and
`grade_forecasts` later scores it against what actually happened. `forecast_scorecard` is how
honest the model has been. `buy_purchase_list` turns a forecast into a basket for
[inventory.md](inventory.md).

**Proof** is an outward-facing artefact. `seal_all_periods` closes everything that can still move;
`proof_create` mints a link; `proof_links_list` and `proof_revoke` manage them. A revoked link is
dead immediately. The reader's view is `/record/[token]` — see [guest-facing.md](guest-facing.md).

**Charts on /reports are recharts** (`Charts.tsx` imports `BarChart`); the dashboard's `Gauge` and
`Week` are hand-drawn SVG. The note used to say no plotting library anywhere — it was wrong.

**Intelligence** (`/intelligence`, 0087) sits beside Reports: plate cost and margin per dish,
menu-engineering classes, exceptions against a 28-day baseline and the owner's briefing. See
[controls-and-intelligence.md](controls-and-intelligence.md).

**Table ready on WhatsApp.** A queued guest with a phone gets a green WhatsApp button beside the
ring button: "Hi Ravi, your table at … is ready. Please come to the host stand." plus their own
`/queue/<slug>?t=<token>` link. Pressing it also marks a waiting guest *called* — sending the
message is calling them. `waHref` in `lib/wa.ts` builds the link (ten digits get 91 in front; null without a usable number,
so the button simply is not drawn); `waDate` / `waTime` write "Fri, 9 Oct" and "8:30 pm".

## Before you edit

- **Pulse is the waiting list first (Simple Service, 2026-10-15).** `SvcHead` ("Guests at the door, and when a
  table frees up"). Left, `[data-quote]`: **How many people?** as eight 64px buttons, the wait in display type in
  a blue wash (green "Seat now · A table that fits is free" when it is 0), Name and Phone, and **Add to waiting
  list** (`data-add-walkin`). Right, `[data-queue]`: **Waiting now** — the party size in a square, the name, how
  long, then **Table ready** (marks them called, `data-table-ready`) → **Seat now** (the free tables that fit),
  Call, the WhatsApp "your table is ready" and ✕ left; the separate seat icon hides on a phone so Table ready
  keeps one line. Under them **Tables freeing soon** (four, in the floor's colours by stage) and **Every table**
  (the All · Free · Reserved · In use tabs and tiles, now in the same colours; reserved amber and dashed), then
  the Join by QR card. The "Right now" card with its three flip tiles is gone — the counts are in the line above
  the party buttons and in the tabs.

- **`table_pulse` reads the dwell history once** (0102): it called `dwell_minutes()` per table. Its medians now
  come from `dwell_medians(rid)` and `dwell_pick()` — the same fallbacks, the same figures (`dry102.cjs`).
  Change the dwell rule in `dwell_minutes` *and* in those two, or the pulse and the queue drift apart.
- **`quote_wait(party)` is the screens' call** (0098) and always answers for the caller's own
  property. `quote_wait(party, property)` is the queue's worker (`queue_join`, `queue_status`,
  `walkin_add`) and no longer callable from the API — with it anyone could ask any property's wait.
- **Tomorrow's buy list carries reorder-level items (0092).** `forecast_day` lists an ingredient when
  tomorrow's cooking needs more than the shelf holds *or* the shelf after tomorrow would sit at or
  under its reorder level; it buys what tomorrow needs plus, where the shelf would be at the line,
  enough to reach **twice** the reorder level after tomorrow. Each line carries `why` (`tomorrow` |
  `reorder`) and `reorder`; the screen tags it (`[data-why]`: *for tomorrow* / *below reorder
  level · reorder at N*). An ingredient with `reorder_level = 0` is never listed for reorder — the
  standard-recipe RPC creates ingredients at 0, so a property sets the levels it cares about in Pantry.
  **The client rescales the list by the same rule** (`TomorrowClient`'s `purchase` memo) as the owner
  moves the covers slider: it used to compute only `need − have`, which dropped every reorder line
  (need 0, shelf 200 → "nothing to buy") — the page said *Pantry covers tomorrow* while `forecast_day`
  listed the item. Change the rule in one place and the other.


- **Tomorrow's header actions wrap on a phone**: the day arrows and Prep sheet on one line, Send to
  the team on the next. As one row they were 398px in a 358px column.

- **Tomorrow's adjust block** (`[data-adjust]`, under the forecast number) is a label row, a
  full-width `Segmented` of the four moods (`MOODS`: Quiet ×0.7, Normal ×1, Busy ×1.25,
  Festival ×1.6 — each segment shows the covers it means; a slider value between them lights
  none), and a `.range` slider with its track filled to the value (`--pct` from `sMin`/`sMax`).
  *Reset to N* appears only when the count has moved. It was a bare 6px range and four 32px chips
  with a different gap above each; the moods were 32px on an iPad.

- **Reports' KPI row is `.stat-flat`** (`[data-kpis]`): four money figures, never a flap, so the
  tiles carry no flap-alignment band — ~108px tall instead of 177px at 834, where two rows of them
  sat before the first chart. Pantry's row stays banded because it mixes flaps and a figure.

- **Pulse's top is two cards that line up** (`xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]`,
  stretched, `[data-pulse-top]`): "Right now" — three flip tiles in one row, then *Frees next*
  (`[data-frees-next]`, the three busy tables nearest to freeing, stale ones left out) pinned to
  the bottom — and Quote a wait with party size as an even grid (4 across on a phone, 8 above).
  The tiles sit in `.flip-fit`, which sizes them from the card (cqw) at every width and never
  wraps. **Do not give that card an `auto` track**: `.flip-fit` is an inline-size container with
  no width of its own, so the track collapsed, the tiles stacked into a 600px column and the quote
  card beside it was half empty (2026-10-12).
- **Pulse's tables are tabs and tiles** — All · Free · Reserved · In use, each with a count (a 4-up
  segmented control; on a phone the count stacks under the label so "Reserved" is not cut). The page
  also reads today's `reservations` that hold a table (`requested`/`confirmed`, `table_id` set): a
  free table with one still to come (from 30 min before now) is **Reserved**, not Free; a table in use
  shows "Next: <guest> · <time>". Tiles: free (green, "Ready to seat"), reserved (blue, guest and
  party), in use (stage pill, time left, a bar of how far through the sitting it is, "frees ~hh:mm",
  "seated … ago"). Durations read as people say them (`dur`: 25 min, 2h 10m, 3 days); an order open
  longer than 12 h (`STALE`) is not a sitting — it shows amber "Open N days — bill or close it" and
  sorts first in In use. It used to print "seated 34736 min ago". Probe: `pulse.mjs` (7 checks;
  inserts a booking and removes it), `fresh.mjs` (a live tile; restores the order's time).

- **Speed of service: the tiles in a row, the chart under them.** The card is an `@container`;
  tiles and the hour chart sit side by side only from a 52rem card — at an iPad's half of the screen
  the three tiles had ~100px each and "5.7 min" was cut. Below that the tiles are a row on top and
  the chart takes the full width. `Mini` shows the figure large and its unit small beside it
  (`unit`), so nothing truncates, and "On target" carries a thin bar in its tone (`bar`; green
  ≥90%, red <70%). The Rooms tiles use the same `Mini` in whole rupees, two by two until the card
  is 30rem, then four across. "1 ticket", "1 recall". Probe: `speed.mjs`.

- **Pulse's Join by QR card shows the real code** (`components/QR.tsx`, 148px on a white tile in
  both themes — a scanner wants dark on light) for `/queue/<booking_slug>`; it was a QR *icon*
  beside the address, nothing to scan or print. Beside or under it (`@container`, row from 26rem):
  "Scan to join the queue", the link as a copy chip, Open, and **Print poster** — `printPoster`
  opens a window with an A4 door sign (the property, a 640px code, three steps, the link) and
  prints it. A property that is not Listed publicly gets "Join by QR is off" and a link to
  Settings → Storefront instead. Probe: `joinqr.mjs`.

- **A sealed period must not move.** If a report lets a closed day change, the proof record is a
  lie. `close_day` and `run_night_audit` are the seals.
- **Do not recompute a figure client-side "just for this screen".** Add it to the RPC.
- **`/proof` links are shared outside the business.** Anything you add to `business_record` is
  something a landlord will read. Revocation must actually revoke.
- **Date windows are IST and inclusive-exclusive.** A report suite that breaks in a new month is
  usually a window bug, not a data bug — pin the test window rather than widening the default.

## Verify

```
pnpm --filter @dineflow/web typecheck
node design-test.mjs     # the invoices month strip shares the Charts code
node dialog-audit.mjs    # /proof opens two dialogs; both are audited
```

## See also

[billing-and-invoices.md](billing-and-invoices.md) · [inventory.md](inventory.md) ·
[dashboard.md](dashboard.md)
- **An empty chart says why** (`Empty` in `Charts.tsx`, `[data-empty-chart]`): with no paid bill in the
  window *Sales by day* and *Top dishes* show a dashed 224px box reading "No paid bills in this window"
  / "Nothing sold in this window yet" — the same height the chart takes, so the row does not jump
  when data arrives. They were blank cards, which read as broken (2026-10-12 whole-app review).
