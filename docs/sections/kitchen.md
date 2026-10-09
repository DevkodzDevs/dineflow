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

`stale_kot_count` is what drives "Running late" on the dashboard and the bell badge in the shell —
a ticket older than 15 minutes that is not yet `ready`. That threshold lives with the RPC, not in
the UI, so every screen agrees on what "late" means.

Stations (`kds_stations` on the restaurant) route a category's dishes to a particular screen; a
category with no station stays on the expo view only. The warn and target minutes
(`kds_warn_minutes`, `kds_target_minutes`) colour the tickets.

## Before you edit

- **"All day" is a labelled rail of compact chips** (count badge + dish, `max-w-[15rem]` truncating,
  whole name in the title), with `rail-fade` and no scrollbar, and a "n portions" total beside the
  label. It was tall pills with the browser scrollbar under them, the last dish cut mid-word.
- **On a phone the header's second line is clock + stale warning left, Order board right**
  (`order-first` on the clock block); from `sm` they sit right of the title as before.

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
