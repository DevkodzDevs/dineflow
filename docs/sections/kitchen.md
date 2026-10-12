# Kitchen

**Routes** `/kitchen` (the pass) · `/kitchen/board` (the KDS screen)
**Files** `app/(app)/kitchen/page.tsx` · `KitchenClient.tsx` · `board/BoardClient.tsx`
**Reads** `kots`
**Writes** `kots_needs_live`, `stale_kot_count` (both read-side RPCs); status changes go through the
order actions

## What it is

What is cooking, in the order it was fired. `/kitchen` is the working view; `/kitchen/board` is the
one that goes on a screen above the pass and is read from across the room.

## How it works

A **KOT** (kitchen order ticket) is a row in `kots` with a status: `pending` → `preparing` →
`ready`. The till fires one with `fire_kot`; `recall_kot` pulls it back.

`stale_kot_count(p_hours)` drives "Running late" on the dashboard and the bell badge in the shell —
pending/preparing tickets older than `p_hours` (the kitchen page passes 24, so it is "left over from
earlier", not "late"). The amber/red lateness on the board itself is computed in the browser from
`kds_warn_minutes` / `kds_target_minutes` (0067). The note used to say 15 minutes; the RPC never did.

Stations (`kds_stations` on the restaurant) route a category's dishes to a particular screen; a
category with no station stays on the expo view only. The warn and target minutes
(`kds_warn_minutes`, `kds_target_minutes`) colour the tickets.

## Before you edit

- **Stock moves when the ticket arrives, by default (0092)** — not when *Start cooking* is pressed. A
  kitchen that works the board can switch back (Settings → Kitchen, `stock_draw = 'cook'`). On the
  board nothing changes: a `pending` line cancelled through `cancel_line` is credited back; one
  cancelled after *Start cooking* keeps its consumption. See [inventory.md](inventory.md).


- **"All day" is a labelled rail of compact chips** (count badge + dish, `max-w-[15rem]` truncating,
  whole name in the title), with `rail-fade` and no scrollbar, and a "n portions" total beside the
  label. It was tall pills with the browser scrollbar under them, the last dish cut mid-word.
- **On a phone the header's second line is clock + stale warning left, Order board right**
  (`order-first` on the clock block); from `sm` they sit right of the title as before.

- **On a phone the order board is two stacked panels** (`sm:hidden` in `BoardClient.tsx`): a
  two-line header (Order board, the property name under it, a clock, a 44px close), then **Ready to
  collect first** — green, pulsing dot, count — and Preparing under it, each order a tile three across
  (#number, where); an empty panel says so in a sentence with an icon. Two side-by-side columns on a
  phone broke "Ready · please collect" over three lines and showed a lone dash. From `sm` it is the
  wall layout, unchanged. Probe: `board.mjs` (4 checks; makes three tickets live and restores them).
- **The board is read at distance.** Type on `/kitchen/board` is sized for a wall, not a desk. Do
  not shrink it to fit more tickets; fewer, legible tickets is the design.
- **`useLive(["kots"])`** keeps both views current. Do not add a polling interval.
- **Status is a workflow, not a toggle.** A ticket that jumps `pending` → `ready` skips the timing
  data the speed report is built from.
- **There is no `StatTile` row here**, so the split-flap treatment that `StatTile` applies elsewhere
  does not reach this screen. (`FlipRow`, an unused three-tile row meant for it, was deleted on
  2026-10-10 — use `StatTile` if tiles are ever wanted here.)

## Verify

```
pnpm --filter @dineflow/web typecheck
node dashcheck.mjs       # the dashboard reads stale_kot_count; a change here moves that number
```

Then open `/kitchen/board` at 1920 and stand back from it.

## See also

[orders-and-till.md](orders-and-till.md) · [reports-and-forecast.md](reports-and-forecast.md)

- **Station printers print again (0087).** `printKot` routes with `ticketsFor()` (`lib/print/route.ts`,
  unit-tested): a printer with no station prints the whole ticket, a station printer only the lines
  whose station is its own (the dish's `station`, else its category's), nothing when none are. Before
  this no screen passed a station, so a station-bound printer never received a ticket. The till's
  menu query now selects `station, categories(station)` and each printed line carries it; the kitchen
  Reprint passes `stationOf(i)`. Online orders carry no station and still go to station-less printers.
