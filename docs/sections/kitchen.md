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

- **A ticket says who is cooking it (0113).** `kots.started_by / ready_by / served_by` are stamped by `_kot_who` on the
  status `sync_kot_status` sets — inside the cook's own session, so the name is theirs. `page.tsx` reads `started_by`
  and maps it to a name from `profiles`; the KOT line shows *· Arun Commis* (`data-cook`). The Work board counts tickets
  cooked per person. [work.md](work.md)
- **A parcel's ticket says its token** (0103): `where()` reads "Takeaway · Token 7" / "Delivery · Token 3" when
  the order has one; the reprint uses the same words. `page.tsx` selects `orders(token_no)`.

- **Simple Service (2026-10-15).** Three columns in the floor's colours — **New** (blue), **Cooking** (amber),
  **Ready — take it out** (green) — each a `.kcol` with its icon, word and count. A ticket is `.kt`: paper in
  both themes, the table big with a minutes pill (green, amber past `kds_warn_minutes`, red past
  `kds_target_minutes`, with a red ring on the ticket), "KOT # · order # · key n", the dishes as `.kt-line`s — the
  count in a dark disc, the name in 18px, a request in red with a warning sign — and **one big button, always in
  the same place**: Start cooking (amber, `.svc-btn.st.st-cook`) → Food ready (green) → Served (dark), with
  Reprint beside it (`data-kot-go`). A dish tapped ready shows a green tick in its disc and is struck through.
  The head is `SvcHead` with the clock and Order board; "All day" is chips with "to cook in all". The shared
  `Ticket` component is no longer used here (the order page still uses it). Keys 1–9 and R are unchanged.

- **A bump, fire or recall that the server refuses puts the ticket back** and says why (a toast). A fired
  course hid itself for good even when `fire_kot` failed — the kitchen never got it.
- **An offline bump moves the ticket's lines** (`lib/offline/sync.ts` `kot_status` → `order_items` by `kot_id`,
  as `setKotStatus` does online). It wrote `kots.status`: no stock was drawn in cook mode and the ticket jumped
  back when `sync_kot_status` rebuilt it from its lines.
- **Stock moves when the ticket arrives, by default (0092)** — not when *Start cooking* is pressed. A
  kitchen that works the board can switch back (Settings → Kitchen, `stock_draw = 'cook'`). On the
  board nothing changes: a `pending` line cancelled through `cancel_line` is credited back; one
  cancelled after *Start cooking* keeps its consumption. See [inventory.md](inventory.md).


- **"All day" is a rail of chips** (count disc + dish, `max-w-[16rem]` truncating, whole name in the title),
  `rail-fade`, no scrollbar, and "to cook in all · n" beside it from `sm`.
- **The head's clock and Order board are `SvcHead` actions** — on a phone they take the full width under the
  title, two equal pills; the stale-ticket warning is a red line under the head.

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
- **The board is never held while an answer is on its way** (2026-10-18). Every button disabled itself on the screen's
  one `pending`, so one tap greyed the whole board for the 0.4–1.8 s the server took. Start cooking, Food ready, Served,
  Fire and Recall show at once (optimistic) and hold nothing; only the station view's two buttons, which wait for the
  server to move a line, still do. A ticket's old copy fades in 140 ms. The realtime refresh waits for the action's own
  answer (`lib/liveRefresh.ts`). Probe: `cookchk.mjs` — the board's buttons free 60 ms after a tap, the database moved.
- **The Order board is a menu row of its own** (2026-10-20, the owner: "order board needs a separate menu option"):
  `order-board` in `components/shell/sections.ts`, after Kitchen, Tv icon, gated by the kitchen module (`mod:
  "kitchen"`) — in the sidebar, the phone's More sheet and Ctrl/⌘ K. Kitchen's own Order board button stays. On
  `/kitchen/board` the Order board row is lit, not Kitchen (`isOn`, shell-and-nav.md). The board still covers the
  shell and its ✕ goes to `/kitchen`.

- **Flap numbers (2026-10-20)** — design-system.md, *Flap numbers*. Each ticket's age is a ticking flip clock (`FlapClock since`, `[data-kt-age]`) — emerald, amber at `warnAt`, red at `lateAt` (red too when a promise is missed); the words stay as sr-only text. Column counts shuffle on 40px compact tiles (`[data-kcol-count]`, the old `<b class="num">` kept sr-only). The Order board spells the newest ready order (`[data-board-call]`, `FlapSpell`) its Preparing count breathes (`[data-board-preparing]`) and its Ready count shuffles (`[data-board-ready-count]`), 40px on the wall, 34 on a phone.
- **Short copy** (2026-10-23): subtitles and hints cut to a few words.

- **The ticket's head is a solid band** (2026-10-24, the owner: "it blends into the background"): `.kt-head` is the column's colour
  (`--st`) with its own ink (`--st-on`), not 18% of it on the paper on a column of the same tint; the title steps down to 24px
  under 640px so "Takeaway · Token 7" fits.
- **Shorter copy (2026-10-29, the owner: "maximum 3 or 4 words, try 2 or 3 — clean and neat").** Subtitles, hints, helper
  lines and empty-state hints cut to two–four words, or removed where they said the obvious. Error and refusal messages,
  steps to follow outside the app, printed and exported text, WhatsApp bodies and tooltips were left as they were.
- **The order's cooking request on the ticket (2026-10-30, the owner: "Jain was asked but the kitchen does not show it").**
  The till saves the whole-order request ("Jain", "All mild") as `orders.notes`; `kitchen/page.tsx` never selected it, so only
  per-dish notes ("Extra spicy") showed. Now **Reads** also `orders.notes`, and each ticket shows it under the ticket's numbers as a
  **compact amber pill** as wide as its words (a filled orange dot with a triangle, a soft orange ring; `[data-kot-note]`), tokens only
  so it reads on the paper ticket in every theme. The numbers themselves are **chips** now, not a sentence (`[data-kt-meta]`,
  `KT_CHIP`): *KOT 3* · *# 3* · the keyboard key · the cook (2026-10-30, the owner: "ultra modern, compact"). shots158 checks both.
  **Reprint** sends it as `** NOTE **` like the till, and the browser-print KOT (`kotHtml`) prints it in bold. The guest
  board (`kitchen/board`) lists no dishes, so it is left alone.
