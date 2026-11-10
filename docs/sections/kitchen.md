# Kitchen

**Routes** `/kitchen` (the pass) · `/kitchen/board` (the KDS screen)
**Files** `app/(app)/kitchen/page.tsx` · `KitchenClient.tsx` · `board/BoardClient.tsx`
**Reads** `kots` (with `orders`, `order_items`, and since 0163 `online_orders` → `order_channels` for the channel chip)
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
- **The ticket prints the dish as the kitchen reads it (2026-11-09).** `printKot` builds with `buildKotBytes(ticket, printer)`
  (`lib/print/script.ts`): a printer on *Auto* prints a picture (`raster.ts`, this device's fonts) when any line is in Tamil,
  Hindi or another script, text otherwise — so "மசால் தோசை" from the till no longer comes out as symbols. The line prints
  **exactly what the till sent** (`name_snapshot`), which may already be in Tamil. `KotData.items[].localName` is in place —
  printed bold under the name on both paths when set — but **no menu column carries a per-dish local name yet**
  (`menu_items` has `name` only), so nothing sets it; a `name_local` column and the dish editor field are the next step, a
  migration. The script choice is in Settings → Printers ([settings.md](settings.md)).
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

## 2026-11-01 — a ticket of cancelled dishes closes (0158)
- `sync_kot_status` read "every dish ready or cancelled" as **Ready**, so cancelling a whole order (or every dish) put its
  ticket at the pass for good: Served moves only dishes that are not cancelled, found none, said nothing, and the ticket came
  back on the next read — on the board's Ready column and the ready dock (the owner: "I press Served and it comes back again
  and again"; 30 were open). All cancelled → `served` with no `served_at` (closed, never served) and no started/ready stamps.
  The open ones were closed by the migration. The ready dock also drops any ticket with no live dish.

## 2026-11-02 — column heads and empty columns (the owner's iPad: "Ready — take it out" on two lines; "not looking good")
- **The head:** the state's icon on a tinted tile (`.kcol-icon`), the word on one line (`.kcol-title`, nowrap — *New*, *Cooking*,
  *Ready*; the Say word `ready`, not `ready_take`) and what to do with it under it (`.kcol-sub`: To start · On the fire · Take it
  out), the flap count on the right; 56px tall. `[data-kcol-head]`.
- **An empty column** (`.kcol-empty`, `[data-kcol-empty]`): the icon on a tile inside a slowly turning dashed ring (`kcol-orbit`,
  still for reduced motion), a soft glow of the state's colour, the line (No new tickets · Nothing cooking · Nothing ready) and a hint
  (Orders land here · Start a ticket · Done dishes wait here). It fills the column's free height up to 420px, so beside a long column
  of tickets it stays near the head. shots163 at 1194/1440/834/412 in dark, paper and colourful dark: one-line titles, empties 420px.

## 2026-11-03 — a channel order's reference is a grey chip, not the amber request (0163; the owner's iPad: "TEST-040011", "5-eeea", "0-2fee" in the amber pill — "what is this?")
- Since 0004, accepting an online order wrote its reference into `orders.notes`, which this screen shows as the whole order's
  cooking request (the amber `[data-kot-note]` pill, 2026-10-30) — so a Swiggy id or a guest's QR code looked like an instruction.
  Now the reference lives on the **ticket**: `kots.online_order_id` (one order can hold several QR rounds, so each round shows
  its own). `page.tsx` reads `online_orders(display_id, external_id, table_id, order_channels(kind, label))`.
- **The chip** (`RefChip`, `[data-kt-ref="qr" | "web" | "app"]`) sits after KOT and #, the same grey `KT_CHIP`: an icon (QR code, globe,
  bike), the source and the short reference — *QR · 2fee*, *Web · …*, *Swiggy · 040011*; the whole reference in its title.
  The words come from `lib/channelRef.ts` (`channelChip`, `shortRef`, `channelSource`; 5 tests): a website order at a table is QR,
  without one Web, the apps by name, any other channel by its label's first part; the reference keeps what follows its last dash, a
  long number its last six. **Reprint** puts it on the where line ("T3 · QR 2fee"); the amber pill and `** NOTE **` are the
  till's request only.
- shots164 (15): Swiggy and QR orders accepted as the owner through `accept_online_order`, a till order with "Jain" — at 1194 dark,
  1440 colourful dark, 412 paper: the chips, no amber pill on the channel tickets, "Jain" kept, chips 24px inside the ticket.

- **A room's QR order (0170)** carries the chip **Room · 60e9** (`channelSource(kind, label, atTable, atRoom)` — `online_orders.room_id`
  in the kitchen's select); its heading is the room alone, "Room 102" (`roomLabel`, below).
- **A room-service ticket is headed with the room alone (2026-11-03):** `roomLabel` (lib/channelRef.ts, tested) — the order's name is "Room 102 · name" (the till and the room QR both write it so) and the heading read "Room · Room 102 · name", cut to "Room · Room 1…" with the number lost. Now "Room 102"; the guest's name stays off the pass. `pw/kshot170.mjs` shoots it at 1194/834/1440, dark and paper.

## 2026-11-03 — a ticket fits every column width (the owner's iPad upright: "Roo…", "Start cooking" out of its button, "Basm…")
- Three columns on an 834px iPad leave a ticket **193px** wide (1024: 256, 1194: 313, 1440: 335, 1920: 484, a 412 phone: 356). `.kt` is now
  a container (`container: kt / inline-size`, globals.css after `.kt-sub`) and the ticket lays itself out by its own width:
  - **under 300px**: the heading may take two lines (`line-clamp: 2`) at 22px and the flip clock steps down (`zoom: .76`); the chips
    tighten and the keyboard-key chip (`[data-kt-key]`) goes; the dish disc 32px, the name 16px; the foot's button may wrap its
    words inside it and Reprint is 44×56.
  - **under 360px**: the pantry list (`[data-kt-needs]`) is one column — two cut "Amul butter 500 g" at 313px.
  - **under 220px**: the button's icon steps aside so "Start cooking" stays on one line (14.5px).
  Hooks: `[data-kt-body]`, `[data-kt-needs]`, `[data-kt-foot]`, `[data-kt-reprint]`.
- `pw/kfit170.mjs` (38): 1920/1440/1194/1024/834/412 dark and 834 paper, colourful dark, colourful light (`bright`), royal — every
  heading whole (the text measured with a Range: the display font's ascent made scrollHeight 1–2px over and read as cut), the
  button's words inside it on one line, no pantry name cut, no sideways overflow, 44px targets on touch widths.
