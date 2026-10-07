# Control room (dashboard)

**Route** `/dashboard` — the landing page for every signed-in role
**Files** `app/(app)/dashboard/page.tsx` · `Overview.tsx` · `Live.tsx`
**Reads** `bills`, `orders`, `order_items`, `kots`, `dining_tables`, `rooms`, `bookings`,
`housekeeping_tasks`, `online_orders`, `profiles`, `v_low_stock`
**Writes** nothing

## What it is

The owner's first screen: what came in, where it came from, what is moving, who is on. Everything
on it is a door to the screen behind it.

## How it works

`page.tsx` fires **fourteen queries in one `Promise.all`**, including the session, and then does all
the arithmetic server-side — occupancy, late tickets, the seven-day curve, the top dishes. The room
queries are asked unconditionally; a restaurant comes back empty, and waiting to learn the property
type cost more than the empty answers do.

`Live.tsx` wraps the board and re-renders it when orders, bills, rooms or stock change. **Nothing on
the board polls on its own.**

`Overview.tsx` is built in **bands, not columns**. A band is a row of panels that share a top *and* a
bottom:

1. header — greeting, property, date, clock
2. `.flip-row` — three split-flap tiles, the numbers readable from across a kitchen
3. `.stat-grid` — every stat tile in one row, count-aware tracks
4. band: **On now** (2/3) beside **Where it came from** over **This week** (1/3)
5. `.board-row`: **Selling today** · **Settled** · **On the rota**

This replaced three independent `space-y` columns. Those stacked cards of whatever height their
content happened to be, so at 1440 six panels sat at six different tops — 443, 549, 576, 680, 818,
1070. Bands are the fix and they are measured, not eyeballed.

`Gauge` and `Week` are **hand-drawn SVG**, not a chart library. `ICON` maps a tile's icon *name* to a
component on the client.

## Before you edit

- **Icons travel as names.** `Tile.icon` is a key of `ICON`, resolved in the client component. Pass
  a Lucide component from `page.tsx` and the dashboard renders its error card while typecheck stays
  green. This has happened.
- **The tile count decides the grid.** `TRACKS` in `Overview.tsx` maps 4/5/6/7 tiles to column
  classes, with `[&>:last-child]:col-span-2` where the count will not divide. Add or remove a tile
  and you must check `TRACKS` has an entry for the new count, or the row gets a hole. A restaurant
  shows 5, a resort 6.
- **Do not duplicate a flap.** The flip row already carries occupancy / orders / in-kitchen. A stat
  tile showing the same number in smaller type is noise — an "In the kitchen" tile was removed for
  exactly this.
- **`owner` and `kitchen` are still props but unread.** Both are one line from being wanted again;
  the owner card said only what the sidebar says, and the kitchen count is the flap beside it.
- **The live list needs `flex-1 min-h-0` *and* a `max-h`.** The floor gets as many rows as the band
  allows, but 20 open orders must not stretch the band to 1200px.
- **`force-dynamic`.** Never cache this page.

## Verify

```
node dashcheck.mjs       # 6 checks at 1920/1440/1194/834/412 — no overlap, no spill,
                         # 0 touch targets under 44px, gauge + week present, tabs present
node board.mjs <tag>     # prints every band's top/height — a RAGGED line means two panels
                         # in one band do not end on the same pixel
```

Run `board.mjs` against **both** a resort (`Tan Resort`) and a restaurant (`Tanvi's`) — the tile
count differs and so does the grid.

## See also

[design-system.md](design-system.md) · [shell-and-nav.md](shell-and-nav.md) ·
[reports-and-forecast.md](reports-and-forecast.md)
