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

## Before you edit

- **Tomorrow's header actions wrap on a phone**: the day arrows and Prep sheet on one line, Send to
  the team on the next. As one row they were 398px in a 358px column.

- **Pulse's top is two cards that line up** (`xl:grid-cols-[auto_minmax(0,1fr)]`, stretched): the
  flip tiles in "Right now", and Quote a wait with party size as an even grid (4 across on a phone,
  8 above). The tiles sit in `.flip-fit`, which sizes them from the card (cqw) on a phone — sized
  from 100vw they ran the third tile out of the card at 412.

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
