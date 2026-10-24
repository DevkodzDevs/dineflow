# Reports, pulse, tomorrow and proof

**Routes** `/reports` · `/pulse` · `/pulse/qr` (Join by QR) · `/tomorrow` · `/proof`
**Files** `app/(app)/reports/ReportsClient.tsx` · `Charts.tsx` · `Breakdown.tsx` ·
`app/(app)/pulse/PulseClient.tsx` · `app/(app)/pulse/qr/QrClient.tsx` · `app/(app)/tomorrow/TomorrowClient.tsx` ·
`app/(app)/proof/ProofClient.tsx` · each `actions.ts`
**Reads** `day_closes`, `night_audits`, `walkins`, `forecast_runs`
**Writes** `report_extra` (0105), `report_summary`, `sales_breakdown`, `hotel_kpis`, `kitchen_speed`, `table_pulse`,
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

- **More reports and export (0105, 2026-10-17).** `page.tsx` also asks `report_extra(from, to)` for the same window
  as IST dates; `MoreReports.tsx` draws *Sales less expenses*, *How guests paid*, *Sales by staff* (who took the
  order), *Every dish sold* (12, then Show all), *The bill lines* and *Cancelled & voided*. For a role below
  supervisor the function refuses and the panels do not show. **Excel and PDF** (buttons by the period chips) are
  built from one description, `tables.ts` → `reportTables()`, so they cannot disagree: Excel by `lib/xlsx.ts` (a
  real .xlsx, no library — a stored zip of SpreadsheetML; text cells are inline strings, never formulas), PDF by
  `lib/tablePdf.ts` (jsPDF, Latin-1: ₹ prints as "Rs"). Both load only when pressed. A zero discount shows ₹0,
  not −₹0.

- **Pulse, redesigned for the host at the door (2026-10-20, the owner: "good concept, not user-friendly enough").**
  Every block has a title and one plain line saying what it is for. Top to bottom:
  - `SvcHead` ("Who is waiting at the door, and which table frees up next") with a **Join by QR** button
    (`data-joinqr-link`) → `/pulse/qr`.
  - **On a phone (2026-10-22, the owner: "not looking good")** the full-width Join by QR bar and three cramped tiles are one
    card (`[data-pulse-glance="phone"]`): *The floor now* with **Join by QR** as a pill on its right (the header's button is
    hidden below md — `SvcHead actionsClassName`), then three slim columns with hairlines — *Tables free* (the shuffling flap
    at 30px, /14), *Waiting* (the breathing flap), *Avg sitting* (1h 30m). iPad and desktop keep the tiles and the header button.
  - **Three glance tiles** (`[data-pulse-glance]`, 3-up at every width): tables free to seat (of all — Free
    excludes Reserved), parties waiting, how long a sitting usually takes (`avg_dwell`).
  - `[data-pulse-top]`, side by side from `lg`: **Add a guest who is waiting** (`[data-quote]`, an `@container`) as
    numbered steps — **1 How many people?** (eight buttons, 4-up, 8-up from a 34rem card), the answer under them
    (`[data-wait]`, `aria-live`): **Seat now — "T4 is free and seats 4"** (the smallest free, un-booked table that
    fits), **About 25 min** "until a table for 3 is likely free", or, when `quote_wait` is null, *No table fits*
    ("put two together") / *Long wait* (more parties that size waiting than tables); **2 Their name and phone**;
    **3 Put them on the list** (`data-add-walkin`). Beside it **Waiting now** (`[data-queue]`, a card with the
    count): each guest a row (`data-walkin`, an `@container`) — party size in a square, #place, name, "waiting
    12 min · told 20 min", then the one big move (**Table ready** `data-table-ready` → **Seat now**
    `data-seat-walkin`) and Call · WhatsApp · Seat · Left as 44px squares (48 on touch) whose words show from a
    36rem row; the separate Seat hides on a phone. Seat opens **Pick a free table for N** — the tables that fit,
    smallest first, a booked one in amber with its time. Nobody waiting shows an empty state with a link to the
    door QR.
  - **Next tables to free up** (`[data-frees-next]`, four, in the floor's colours, the stage under the time), then
    **Every table** — the All · Free · Reserved · In use tabs and tiles, now the full width (the right-hand QR column
    is gone).

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

- **History: Pulse's top was once two cards that lined up** — "Right now" with three flip tiles in `.flip-fit`
  beside Quote a wait. If flip tiles ever come back here, **do not give their card an `auto` track**: `.flip-fit` is
  an inline-size container with no width of its own, so the track collapsed and the tiles stacked into a 600px
  column (2026-10-12).
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

- **Join by QR is its own screen, `/pulse/qr` (2026-10-20 — it was a card at the foot of Pulse).** `qr/page.tsx`
  reads only the session (slug, Listed publicly, name) and the base address (`NEXT_PUBLIC_CLOUD_URL` or the request's
  host, as Pulse did). Gated like Pulse — the app layout maps the first segment, `pulse`, to the pulse module — and a
  menu row of its own after Pulse (`pulse-qr`, shell-and-nav.md). Left, `[data-joinqr]`: the property's name, the
  real code (`components/QR.tsx` drawn at 320px, shown up to 19rem wide on a white tile in every theme — a scanner
  wants dark on light, `[data-code]`), the link as a copy chip, **Print poster** (`printPoster`, the A4 door sign:
  the property, a 640px code, three steps, the link), Open, Share (`shareText`; copies where there is no share
  sheet) and Copy link. Right: *How guests use it* (scan · add name and party · you tap Table ready) and *Where to
  put it*. Not Listed publicly (or no slug) → `[data-joinqr-off]` "Join by QR is off" with Open Storefront
  settings; Pulse then shows one line linking to it. Probe: `joinqr.mjs` (rebuild it for the new route).

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

- **Short copy** (2026-10-23): subtitles and hints cut to a few words.

## See also

[billing-and-invoices.md](billing-and-invoices.md) · [inventory.md](inventory.md) ·
[dashboard.md](dashboard.md)
- **An empty chart says why** (`Empty` in `Charts.tsx`, `[data-empty-chart]`): with no paid bill in the
  window *Sales by day* and *Top dishes* show a dashed 224px box reading "No paid bills in this window"
  / "Nothing sold in this window yet" — the same height the chart takes, so the row does not jump
  when data arrives. They were blank cards, which read as broken (2026-10-12 whole-app review).

- **Flap numbers (2026-10-20)** — design-system.md, *Flap numbers*. Pulse: Parties waiting breathes, Tables free to seat shuffles (`[data-glance-n]`); "Seat now" spells the table (`FlapSpell`); a quoted wait under 100 min shows its minutes on tiles; each waiting party's time is a ticking `FlapClock` (amber at the quoted minutes, red 10 after).

- **Sales by hour, redesigned (2026-10-21 — the owner: "messy").** With bills at midnight and 11pm the window was all 24
  hours and every bar had its label — "12am1am2am…" ran into one another on a phone. Now (`HourChart` in `Breakdown.tsx`,
  `[data-hour-chart]`): one hue, the hour being read full tint and the rest a tint of it, an empty hour a dot on the
  baseline; labels only on the clock's 3-hour marks (2-hour when the day has ≤ 14 hours, every hour when ≤ 8) plus the
  chosen hour, with its neighbours dropped so they never touch; a dashed top line with the busiest hour's value. Tap,
  hover or tab to a bar (`[data-hour]`) and the line above reads it (`[data-hour-readout]`: hour range, bills, ₹); it
  starts on the busiest hour, and a *Busiest · 8pm* pill jumps back. shots34 checks no two labels touch at 360–1440.

- **Proof of business — the sharing head (2026-10-21).** *Who you have shared it with* was a 2xl title wrapping to two
  lines beside a squeezed *New link* whose plus rendered as a dot. Now (`[data-links-head]`): a link icon, the title at 21px
  with what a link is under it, and *New link* (`[data-new-link]`, `svc-btn go`) beside them — its own full row on a phone.
  No links yet is a dashed box with Bank / Supplier credit / Landlord shown as who a link is for (`[data-links-empty]`).

- **Pulse, the owner's 2026-10-21 round.**
  - **Seat now left the table "free" (a real bug).** `walkin_set … 'seated'` marks the table occupied, but `table_pulse`
    and `table_pulse_for` read a table's stage from its open order only, so a seated party with nothing ordered stayed
    Free, was offered to the next party, and `quote_wait` counted it free now. **Migration 0131** adds stage
    **seated**: no open order, a walk-in seated there in the last 3 hours, and no order started on that table since (an
    order takes over; once it is paid the table is free again). `free_now` / `seats_free_now` count stage free only.
    `dining_tables.status` is not used — orders closed without a bill leave it 'occupied'. `dry131.cjs`: 6 of 6,
    rolled back. **0131 is written, not applied: apply it only after this code is live** — the screen before this
    round read `STAGE[t.stage][0]` and throws on a stage it does not know. Now every lookup falls back to "in use".
  - **What the host does shows at once.** Table ready turns the card Called, Seat now and Left take it off, and the
    seated table reads *just seated* — local state (`mine`) ahead of the write; a failed write puts it back.
  - **Waiting cards redesigned** (the owner: "messy"): place number, name and a Waiting / Called chip on one line;
    party, the wait (`FlapClock`) and what they were told (only when > 0) as chips; one row of 44px actions — the next
    move, Seat (from sm), Call, WhatsApp, Left. Called turns the card green. `[data-walkin-name]`, `[data-walkin-state]`,
    `[data-seat-table]`.
  - **Next tables to free up** and **Every table** are cards like the two above, each head with an icon tile (`Head`
    takes `icon` and `tone`); "nothing freeing" is a dashed empty state. shots39: 16 of 16.

- **Top dishes is a ranked list** (2026-10-23, the owner: "the words break"): the rank (No 1 in the tint), the name on one line
  (the whole name on hover), a slim bar against the best seller, plates and takings — plain HTML (`TopDishes` in
  ReportsClient.tsx, `[data-top-dishes]`). It was a recharts bar chart whose bars all ran full width and whose names wrapped in
  a 110px axis.
- **Pulse: an overdue table is built like a sitting** (2026-10-23): the time big in amber with an *overdue* tag where "frees ~"
  sits, a full amber bar, and "Open too long — bill or close it" in one line (`[data-stale]`) — it was a grey stage pill
  over a wrapping warning.

- **Pulse on a phone, bigger figures** (2026-10-23, the owner): in "The floor now" the flaps are 40px (were 30) and the
  sitting time 30px (was 22); iPad and desktop tiles unchanged. Pulse and Join by QR lines shortened.
- **Reports by department (0140, 2026-10-24 — the owner: "every in and out, every department its own table, Excel and PDF for all
  and for each, charts; the owner's, and the owner gives access").** `report_departments(p_from, p_to)` answers the owner, whoever
  holds the **Reports grant** (`profiles.grants`, Staff → Access; connections.md) or the master — anyone else is refused, and the
  app layout sends them home (`?locked=reports`); the module ceilings still apply on top. One call, at most a year, pinned to
  the property, IST dates: `sales` (each paid bill: day, type, where, items, subtotal, discount, GST, total, how it was paid,
  who billed), `online` (each order with the platform's cut, the rider), `rooms` (each stay that touched the window, with
  `folio_totals`), `facilities`, `expenses`, `purchases`, `payroll` (the runs whose month falls in the window),
  `attendance` (staff days and hours; daily labour with wages), `housekeeping` (done, by who), `customers` (who came, spend,
  points), `inventory` (the shelf now, its value, wasted in the window), `cancelled` (lines and voids with reasons),
  `cashups` (each shift close) — each with a `_totals` — and `by_day` (dining, rooms, facilities, expenses, purchases).
  Lists are capped at 2000 rows (1000 for rooms, facilities, customers; 500 cash-ups); the totals count everything.
  **Income** on the charts is dining bills + room nights (rate × night, as hotel_kpis) + facilities; **outgoings** is expenses
  (salaries paid are already expenses) + pantry purchases. Payroll and online payouts are shown, not added, so nothing is
  counted twice. `deptSpec.ts` is the one description of every department's columns — the screen (`Departments.tsx`:
  Income · Outgoings · Net, the in-and-out bars, the two share rings, a chip rail, a card per department with its figures in one
  line, a DataTable and its own **Excel** and **PDF**), the Excel sheet and the PDF are all drawn from it. "Export all" (the
  page's Excel / PDF) now carries *In and out by day* and every department before the older tables. `Charts.tsx` adds
  `MoneyChart` and `ShareChart` (recharts, tokens only). `Departments.tsx` is lower-case `deptSpec.ts`'s neighbour on purpose:
  a file named `departments.ts` beside it clashed on Windows (TS1149). Probe: `pw/conn140.mjs` (connections.md).
- **Tomorrow's weekday tile with no history (2026-10-24).** `forecast_day` sends "no history yet", and the tile took its first word, "no", as the number in big letters. TomorrowClient now shows 00 on the flaps with "No Sundays on record yet" under it.
