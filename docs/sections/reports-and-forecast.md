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

**Charts are hand-drawn SVG.** No plotting library anywhere in this app.

**Table ready on WhatsApp.** A queued guest with a phone gets a green WhatsApp button beside the
ring button: "Hi Ravi, your table at … is ready. Please come to the host stand." plus their own
`/queue/<slug>?t=<token>` link. Pressing it also marks a waiting guest *called* — sending the
message is calling them. `waHref` in `lib/wa.ts` builds the link (ten digits get 91 in front; null without a usable number,
so the button simply is not drawn); `waDate` / `waTime` write "Fri, 9 Oct" and "8:30 pm".

## Before you edit

- **Tomorrow's header actions wrap on a phone**: the day arrows and Prep sheet on one line, Send to
  the team on the next. As one row they were 398px in a 358px column.

- **Pulse's top is two cards that line up** (`xl:grid-cols-[auto_minmax(0,1fr)]`, stretched): the
  flip tiles in "Right now", and Quote a wait with party size as an even grid (4 across on a phone,
  8 above). The tiles sit in `.flip-fit`, which sizes them from the card (cqw) on a phone — sized
  from 100vw they ran the third tile out of the card at 412.
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

- **Speed of service: three tiles that stay level.** `Mini` truncates its label to one line and the
  third is "On target" — "Within target" wrapped on a phone and made its tile taller than the other
  two. The header (target · tickets · recalls) wraps under the title rather than squeezing it;
  "1 ticket", "1 recall". Probe: `five.mjs`.

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
