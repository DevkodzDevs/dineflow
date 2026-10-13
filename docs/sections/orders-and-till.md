# Orders and the till

**Routes** `/orders` (the floor) · `/orders/new` (the till) · `/orders/[id]` (one ticket)
**Files** `app/(app)/orders/page.tsx` · `OrdersClient.tsx` · `new/PosClient.tsx` ·
`[id]/OrderDetail.tsx` · `actions.ts`
**Reads** `orders`, `order_items`, `dining_tables`, `menu_items`, `menu_variants`, `addon_groups`,
`menu_item_addon_groups`, `combo_items`, `categories`, `bookings`
**Writes** `place_order`, `fire_kot`, `recall_kot`, `move_order`, `merge_orders`, `split_order`,
`menu_stock`

## What it is

The busiest screen in the app. `/orders` is the floor at a glance — one card per table, open tickets
and their totals. `/orders/new` is the till: pick dishes, build a ticket, send it to the kitchen.

## How it works

**The till** (`PosClient.tsx`) is a two-track layout: a dish grid on the left, the ticket on the
right.

```
<div className="grid lg:grid-cols-[minmax(0,1fr)_clamp(280px,32%,380px)] gap-6">
  <section className="min-w-0"> … dishes … </section>
  <aside className="feather p-4 sticky …"> … the ticket (CartPanel) … </aside>
```

**Dishes are rows, not cards** (2026-10-12): one across on a phone, then `repeat(auto-fill,
minmax(250px, 1fr))` — 2 beside the rail at 1194, 2–3 at 1440, 4 at 1920. A row is 64px: the photo
(`Thumb size="sm"`, 40px) or a tinted square with the veg mark, the name (two lines at most) over
"₹price · category" (the pantry warning takes the category's place when there is one), and the
`.stepper` on the right. **At zero the row shows one plus and nothing else.** Once the dish is on the
ticket, the minus and the count slide in to the left of the plus — the plus itself never moves. The
row has the whole dish as one tap target and the stepper as its sibling. `takeOne` removes one;
clearing a dish outright is the cross on its ticket line. It was a 145px card (286px with a photo)
with the name on top, an empty middle and the plus far down-right: three dishes on a 1440 screen
where ten fit now.

**A dish with a photo shows it as a 40px square** on its row and on its ticket line; a dish without
one shows the veg mark on a tinted square, never a big letter. Until 2026-10-12 the grid went
"photo-first" once half the menu had photos — a full-width 4:3 picture on every tile — which made a
tile 286px tall. `photoFirst` is gone.

**Search** (`lib/tillSearch.ts`, `dishMatch`, 4 unit tests) covers the whole menu whatever chip is on,
best first: the whole name, the start of it, the starts of words in order ("chi bir"), any word's
start ("biry"), initials ("cb" = Chicken Biryani, "pbm" = Paneer Butter Masala — the short codes
counter staff learn on every Indian POS), then the middle ("65"). **Enter adds the top match and
clears the box**; Escape clears; a ✕ clears on touch; a line under the box says how many matched and
what Enter will add. **"/" jumps to the search** from anywhere on the till (a `kbd` hint shows from
`lg`), and **Ctrl/⌘ + Enter sends the ticket** (`submitRef`, a window listener).

**Popular** — a ★ chip after All, when at least four dishes sold here in the last 30 days: the 12
most-ordered, most first (`popular` from `page.tsx`, summed from `order_items`, cancelled excluded,
first 5,000 rows).

**A ticket line** is two rows: the name with its price on the right (the photo beside them when
there is one; sizes, add-ons, "₹x each", the pantry note and the request in green under the name),
then the controls — the stepper, the course chip, a **Request** pill (filled green and reading *Edit*
once set) and the cross at the far end. **Request opens a sheet** (`noteFor`, one for the whole
ticket): the floor's usual asks as chips (`LINE_NOTES`: Less spicy, Extra spicy, No onion, No garlic,
Jain, Parcel, Well done, No ice — a tap adds, a second tap takes back, joined " · "), a box for the
rest, Clear and Done. It is the per-item special request Toast and Petpooja's captain app put on a
line; the ticket-wide one is still the Cooking request sheet. Chips inside the line itself (tried for
an hour) wrapped to three rows and ate the ticket's space; a box under every line before that did
the same on a phone keyboard.

**The ticket rail** (`CartPanel`, used in the desktop `<aside>` and the phone sheet alike) reads top
to bottom: "Order details" + Clear · `Segmented` type (Dine in / Takeaway / Delivery / Room when
guests are in) · for dine-in, **Table and Guest side by side**, each a button that opens below it —
Table into a 5-across grid that closes on pick (occupied dimmed, the "already has order #n running"
notice under it), Guest into Name + Phone (phone drives `lookupCustomer`); takeaway and delivery
show Name + Phone directly · "Ticket · n items" + Courses toggle · the line cards (name and ×, then
`.stepper`, a note icon and the price; the note field appears below only when opened) · then a fixed
summary block: the cooking-request chip and the total on one row, the on-time promise, errors and
pantry warnings, and a full-width `Button variant="ink"` Send to kitchen.

**The rail always fits the screen; only the ticket lines scroll.** Every child of the panel is
`shrink-0` except the line list (`flex-1 min-h-0 overflow-y-auto`). The desktop `<aside>`'s height
is **measured** (`railRef` effect, on scroll and resize): viewport bottom less 16px, from the rail's
top or the 24px sticky line, whichever is lower — and capped at the dish column's bottom. The dish
`<section>` is `lg:min-h-[calc(100dvh-2.5rem)]` so it is always long enough for the rail to stick.
A fixed `calc(100dvh - 3rem)` put Send to kitchen ~180px below the fold, because the rail starts
under the master banner and search bar, not at the top of the viewport. Measured list space with
nine dishes: 1920×1080 465px · 1440×900 283 · 1366×768 151 · 1194×834 217 · 1024×768 130 ·
834 sheet 609 · 412 sheet 372.

**Goes well with** is a one-line strip between the category chips and the dish grid, shown only
once the ticket has a dish with known partners. `page.tsx` reads `menu_pairings()` (migration 0080:
for each dish, the three most often on the same ticket in the last 90 days, seen together at least
twice, still on sale) and passes `pairs`; `goesWith` scores them across everything on the ticket,
drops what is already on it or the pantry cannot cover, and shows four. A chip calls the same `tap()`
as a tile, so a dish with sizes still asks. **It lives in the dish column, not the rail** — the rail's
height is measured to fit the screen and every row added there comes out of the ticket lines.

A dish with sizes or add-ons opens `OptionChooser` instead of incrementing. Combos expand to their
parts. "+ Cooking request" writes `p_note`.

**Ticket types** are Dine In / Takeaway / Delivery / Room. Room posts the charge to a folio via
`post_order_to_room` (see [front-desk.md](front-desk.md)).

**Moving work around the floor** — `move_order` (table to table), `merge_orders` (two tickets into
one), `split_order` (one into two) — all RPCs, all atomic.

## Before you edit

- **Send to kitchen is not held up by the till re-rendering** (measured 2026-10-13): `placeOrder` revalidates, so
  its response also re-renders the till, but that streams behind the action's result — the order's screen
  shows ~420–550 ms after the tap on a local build. A `redirect()` from the action looked faster but, without a
  revalidate, would leave the Orders list missing the new order for up to 30 s (the client cache), so it was
  not done.
- **Fire, Move and Cancel a dish on an order do not call `router.refresh()`** (2026-10-13). Their actions revalidate, and an action that
  revalidates answers with the re-rendered page — the refresh rendered it a second time. Don't add one back;
  see shell-and-nav.md (speed). `actcheck.mjs`.
- **`place_order` checks the table is this property's** before setting it occupied (0098), and every
  order line's dish, variant and ticket must be the same property's (the `zz_same_property` triggers —
  see [data-and-rls.md](data-and-rls.md)).
- **The Orders header keeps *New order* beside the title on a phone** (`PageHeader actionsInline`). Without it a single button dropped onto its own row under the title, an empty half-line beside it. Probe `hdr.mjs` (8, with Pantry) at 375 / 412 / 834 / 1440.


- **The phone/tablet cart bar** (`[data-cart-bar]`, below lg) sits at
  `max(10px, safe-area) + 78px` on a phone — above the bottom tab bar — and 16px off the edge on a
  tablet (no tab bar). It is absent on an empty ticket (it used to park 80px down, half under the tab
  bar), and is a tint bar: count badge, "N items" over the total, *Review ›*. It sat at a fixed 72px
  and the tab bar covered it on an iPhone (2026-10-12). While it shows, a `body:has([data-cart-bar]
  button) [data-assist]` rule in `globals.css` lifts the assistant's round button above it — they
  were at the same height, the button over *Review*. The dish list has `max-lg:pb-20` so its last
  row scrolls clear of the bar.


- **The cooking request (one note for the whole ticket) opens in a `Sheet`**, not inline: inline at
  the foot of the rail, an iPad keyboard squeezed the field to a sliver and pushed Send to kitchen
  out of the panel; the Sheet already sits in the visible viewport above a keyboard. A 3-row note
  (200 max, a counter), eight quick chips (`QUICK_NOTES` — tap to add, tap again to take away,
  joined with " · "), Clear and Done. The footer chip shows the saved request on the green wash.
  It still travels as `** NOTE **` at the top of the KOT. Probe: `note.mjs`.
- **The ticket rail sticks under the shell's floating top bar**, not at 24px: there the bar (sticky
  top-4) covered the rail's head — Dine in / Takeaway / Delivery / Room and the table — as soon as
  the page scrolled. The `railRef` effect measures the bar (16 + its height + 12 → `--till-top`,
  ~90px), sets the rail's `top` and measures its height from that line. From `lg` the dish column's
  title-and-search row (`[data-till-head]`, `--till-head`) and the category chips stick on the same
  line, on the page colour, with a `-14px` shadow of it painting the gap under the bar so cards do
  not show through. Below `lg` nothing is pinned. Probe: `till.mjs`.
- **The Order line, the category chips and Goes well with are `Rail`s** ("Order line", "Categories",
  "Goes well with" — `role="group"`), each with the round arrow on the right while anything is past
  the edge (phone and iPad; at 1920 they fit and show none). They keep their `-mx-4 px-4` bleed on a
  phone; the arrow sits in the wrapper, so it lines up with the page gutter. See
  [design-system.md](design-system.md).
- **An Order line card** (`[data-line]` = the `lineState` tone, `w-52`) is: the table in display type
  with its state as a chip on the right (a dot and an 18% wash of the state's hue — green ready,
  orange in the kitchen, blue served, grey waiting — with the text in `--color-label`), then
  "#no · N items · ⏱ age" on one line, then a three-segment bar (`data-steps`: 1 waiting, 2 in the
  kitchen, 3 ready or served) in that hue. A ready ticket has a green wash and edge (inline style —
  `.feather` sets its own background) and a pulsing dot: the one thing the strip is for is which
  table's food is up. All cards are one height (92px).
- **"All orders →" over the Order line is a 44px target** (`min-h-11 pl-2 -my-3`): the height is
  taken back by negative margin, so the row does not grow. It was 67×16. Do not add `-mr-*` — it
  pushed the link 8px past the section on the right.
- **The till's Back link is 44 on touch** (`[@media(pointer:coarse)]:h-11 w-11`). The control floor
  only lifts buttons; a `Link` stays at its 40px unless it says otherwise.

- **The floor is two tables across on a phone** (`grid-cols-2 min-[520px]:grid-cols-3`). At three, a
  108px card could not hold "T3 · READY · 4 seats". In the open-orders list the dish names truncate
  and the total is `shrink-0`, so they never run together.

- **The control floor is unlayered CSS** (`:where(button) { min-height: 40px }`, 44 under a coarse
  pointer). A plain `h-8` utility loses to it; only an `!important` utility wins. Size tile and rail
  controls at 40 (`h-10`) and let the floor lift them on touch — do not fight it with `!h-8`.
- **A 250px row with a picked dish leaves ~95px for the name** beside a 40px photo and a 102px
  stepper, which is why names clamp to two lines and the price shares a line with the category.
  There is no cross on a row; the ticket line has it.
- **`minmax(0,1fr)`, never `1fr`, for the dish track.** A `1fr` grid item will not shrink below its
  content and pushes the ticket rail off the screen. Pair with `min-w-0` on the section.
- **A floor table is one card** (`feather`, `filled` when occupied): the `Link` on top, and for a
  table with no ticket a Reserve button inside the card (`.room-act`, 40/44px). Grid rows stretch,
  so every card in a row is the same height without a placeholder. Reserve was 11px text floating
  under the card — a 16px target that made free cards look shorter than occupied ones.
- **Reserved is `--color-orange` with a dashed border**, never `--color-saffron`, which is green in
  the dark theme. Free carries a green dot.
- **Open orders are a grid of cards under the floor, at every width** (2026-10-13): one across on a
  phone, two from `md` (iPad, tablet), three from `xl` (laptop), four from `min-[100rem]` (1600px,
  desktop). Write that breakpoint in rem: Tailwind v4 sorts an arbitrary `min-[1600px]` ahead of its
  own rem breakpoints, so `xl:grid-cols-3` beat it and a 1920 screen showed three. Before, the orders
  were a 380px column beside the floor from 1280 and one full-width card per row below it. The floor
  now spans the page at every width; its tiles at 1280+ are the size they already were on an iPad.
- **An order card** (`[data-order]`, `data-state`): a 3px strip and a status chip in the kitchen's
  words — Waiting · On the fire · Ready to serve · Served (ready pulses, and its card takes a green
  wash and edge); the table name in a square (or the kind's icon for takeaway / room service /
  delivery), `#no · N items · age` — the age amber past 12 h, Pulse's STALE; the customer; the
  kitchen's progress as a bar by plates (served · ready · on the fire · waiting) with counts; the
  first three dishes, each with its own state dot, then "+N more"; and the total in a footer strip
  edge to edge, like the Menu and Housekeeping cards. Rows stretch, so a row's cards are one height.
  The header counts the open orders and how many are ready / on the fire / waiting.
- **Stock is not `is_available`.** `is_available` is the dish-level sold-out switch the menu owns;
  `menu_stock` is the live count derived from recipes and the pantry. Both can hide a dish.
- **Never write `order_items` directly.** `place_order` recomputes the ticket, applies variants and
  add-ons, and checks stock in one transaction.

## Verify

```
node design-test.mjs     # the till checks: one plus at zero, two taps put 2 on the tile and a
                         # minus beside the plus, the plus has not moved, the ticket agrees, the
                         # minus takes one back and retires at zero, 0 nested buttons
node responsive.mjs      # the till and the option dialog at 5 widths
node fit.mjs             # nine dishes on the ticket at 7 real screen sizes (not full-page shots,
                         # which hide this): panel ends on screen, Send visible, the line list
                         # scrolls, nothing else overflows, still fits after scrolling the dishes
                         # and with one short category at 1920
```

## See also

[menu.md](menu.md) · [kitchen.md](kitchen.md) · [billing-and-invoices.md](billing-and-invoices.md)

- **Every ticket on the order page comes out of its own kitchen printer** (`PrintedTicket` in
  `OrderDetail.tsx` + `PrinterHead`), as the bill comes out of the counter printer: the machine —
  vent, "Kitchen printer", the ticket's state (PENDING, PREPARING, READY, SERVED, HELD; SPLIT on the
  "Lines" ticket), the green LED — then the ticket hanging from its slot with no torn top. One
  printer per ticket, not one across the column: with one machine the second and third tickets on a
  phone hung in the air under the first. Tickets stack on a phone and go two across from `sm`
  (`gap-5`, `items-start`), each with its own machine. The slot and the paper share the `px-3.5`
  inset, so the slot lies exactly over the paper; the paper is pulled 4px up under the machine
  (`-mt-1`, `z-[1]` under its `z-[3]`) so the teeth bite it. Probe: `kpr.mjs`.
- **The order page header on a phone** (`orders/[id]/page.tsx`): the title gets its own row and Add
  items / Bill sit under it as an even 48px pair (`grid-cols-2`, one column when the role cannot bill);
  from `sm` it is one row again. It used to squeeze "Order #1400 / T3" between the back button and
  two large buttons.

- **Cancelling asks why (0087).** The order page's per-line *cancel* and *Cancel order* open a
  `ReasonDialog` and call `cancel_line` / `cancel_order`; the reason and the name land on the row and
  in the audit trail. A waiter may cancel a pending dish; a dish the kitchen has started needs a
  manager (the server says so); a whole order needs owner/manager/supervisor/cashier. Direct
  `status = 'cancelled'` writes are refused by `guard_cancel`. The old confirm said "Stock will be
  returned" — it never was (0055) and the dialog now says the opposite.
- **Each till line knows its station** (`item.station ?? item.categories?.station`) and the printed
  KOT carries it, so station printers get their own lines. See kitchen.md.

- **The order-taking upgrade (2026-10-12)** came from the owner's ask to research other order-taking
  apps. Toast's order screen offers quantity / repeat / special request on a selected line; Petpooja's
  captain app recommends dishes and takes voice; Square fires and holds courses. DineFlow already had
  recommendations (Goes well with), voice, courses, offline sending and station printing, so what was
  added is what was missing: compact photo tiles, initials search with Enter-to-add, Popular, line
  request chips and keyboard sending. Probe: `tillnew.mjs` (13 — places no order; restores photos).
- **The order page's per-line "cancel" is 44px to the thumb** (`h-10`, 44 on touch, `-my-2.5` so the
  line does not grow) while staying small text. It was 16px tall after the reason dialog landed.
