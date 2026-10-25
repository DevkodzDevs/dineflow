# Orders and the till

**Routes** `/orders` (the floor) · `/orders/new` (the till) · `/orders/[id]` (one ticket) · `/orders/phone` (a call) · `/kiosk` (self-order)
**Files** `app/(app)/orders/page.tsx` · `OrdersClient.tsx` · `new/PosClient.tsx` ·
`[id]/OrderDetail.tsx` · `actions.ts` · `app/kiosk/**`
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

**Dishes are picture cards** (2026-10-15, the Simple Service redesign the owner approved from mockups; it
replaces the 64px rows of 2026-10-12). `.svc-dish`: the photo at 16:10 (or, with none, the category's picture
from `catIcon` on a quiet gradient — never a block of red or green), the veg mark (square with a dot, or a
triangle for non-veg) and the name (two lines), the price big and one **Add** (`.svc-add`, "Choose" with the
sliders icon when the dish asks a question). Once on the ticket its count sits on the photo (`.qty`) and Add
becomes **− +** (`.stepper` without the count — it is on the photo). Two across on a phone, three from `sm`,
then `repeat(auto-fill, minmax(176px, 1fr))` beside the categories and the ticket from `lg`. The pantry's
word sits on the photo as a `.flag` (*Pantry short* in amber, *N left*, *Combo*). `data-tile` and `.more` /
`.less` are what the keyboard map uses.

**Search** (`lib/tillSearch.ts`, `dishMatch`, 4 unit tests) covers the whole menu whatever chip is on,
best first: the whole name, the start of it, the starts of words in order ("chi bir"), any word's
start ("biry"), initials ("cb" = Chicken Biryani, "pbm" = Paneer Butter Masala — the short codes
counter staff learn on every Indian POS), then the middle ("65"). **Enter adds the top match and
clears the box**; Escape clears; a ✕ clears on touch; a line under the box says how many matched and
what Enter will add. **"/" jumps to the search** from anywhere on the till (a `kbd` hint shows from
`lg`), and **Ctrl/⌘ + Enter sends the ticket** (`submitRef`, a window listener).

**Popular** — a ★ square after All, when at least four dishes sold here in the last 30 days: the 12
most-ordered, most first (`popular` from `page.tsx`, summed from `order_items`, cancelled excluded,
first 5,000 rows).

**A ticket line** is a card: the veg mark, the name with its extras, "₹x each", the pantry note, then the
price; under it the stepper, the course chip (when Courses is on), the **Note** pill — amber with the request's
words once set — and the cross. **Note opens a sheet** (`noteFor`, one for the whole ticket): the floor's usual
asks as chips (`LINE_NOTES`: Less spicy, Extra spicy, No onion, No garlic, Jain, Parcel, Well done, No ice — a
tap adds, a second tap takes back, joined " · "), a box for the rest, Clear and Done. The ticket-wide one is
still the Cooking request sheet.

**The ticket rail** (`CartPanel`, `[data-cart]`, used in the desktop `<aside>` and the phone sheet alike) reads
top to bottom: where it is going, big (*Table T2*, or *Parcel* / *Delivery* / *Room*) with **Change** (or a green
**Table** when none is picked) that opens a 5-across grid of the **free** tables only (2026-10-20, below), the "already has order #n
running" notice under it · the order type as three or four picture tiles (Dine in / Parcel / Delivery / Room
when guests are in; icon over word when there are four) · for dine-in the guest folded into one row (*Guest name
or phone (optional)*, opening Name + Phone — the phone drives `lookupCustomer`); parcel and delivery show Name +
Phone directly · "Ticket · n items", Courses, Clear · the line cards · then a fixed foot: the on-time promise,
errors and pantry warnings, the cooking-request chip beside "n dishes" and the total in 32px display type, and a
64px green **Send to kitchen** (`.svc-btn.go.xl`, `data-send`). Ctrl/⌘ + Enter still sends (`submitRef`); the
Send button carries no `data-kbd-primary`, or the shell's Ctrl Enter would press it a second time.

**The rail always fits the screen; only the ticket lines scroll.** Every child of the panel is
`shrink-0` except the line list (`flex-1 min-h-0 overflow-y-auto`). The desktop `<aside>`'s height
is **measured** (`railRef` effect, on scroll and resize): viewport bottom less 16px, from the rail's
top or the 24px sticky line, whichever is lower — and capped at the dish column's bottom. The dish
`<section>` is `lg:min-h-[calc(100dvh-2.5rem)]` so it is always long enough for the rail to stick.
A fixed `calc(100dvh - 3rem)` put Send to kitchen ~180px below the fold, because the rail starts
under the master banner and search bar, not at the top of the viewport. Measured list space with
nine dishes: 1920×1080 465px · 1440×900 283 · 1366×768 151 · 1194×834 217 · 1024×768 130 ·
834 sheet 609 · 412 sheet 372.

**Goes well with** is a one-line strip at the top of the dish column, above the grid, shown only
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

- **Phone orders (0105).** *Phone* on the Orders header → `/orders/phone`: the number first (a keypad on touch
  screens), and at ten digits `phone_order_card` brings the customer (name, visits, spend, notes), the address
  they gave last (customer's, else their last delivery's) and their last five orders. *Delivery* / *Parcel* /
  *Same again* put `{type, name, phone, address, items}` in `sessionStorage["df-phone-order"]` and open
  `/orders/new?type=…&from=phone`, which reads it once and clears it; *Same again* brings dishes in their sizes,
  add-ons are asked again. The till has a **Delivery address** box for delivery (filled from the phone when known);
  after `placeOrder`, `order_delivery` puts it on the order and the customer. The order page shows *Deliver to* and
  the token; the printed bill carries the address. **Offline (0109):** the queued `place_order` job carries
  `delivery_address`, and `lib/offline/sync.ts` calls `order_delivery` with the id the order lands with. The replay
  also sends the customer's name and phone — it read `a.customer`, which the till never queued, so every order sent
  from the queue had arrived without them.
- **Table calls on the floor (0103).** `page.tsx` reads open `service_calls` from the last 30 minutes; a calling
  table carries an orange pulsing pill above its card (`data-call`: *Wants bill* · *Calling* · *Water*, bill
  winning). Tapping it is "I have gone" — `answerCall(tableId)` → `service_call_done(p_table)` closes every open
  call on that table and the guest's card turns *On the way*. The pill is 28px inside a 44px button (`-top-6`) so a finger
  can hit it and it clears the table name; answered calls are remembered by call id, so the same table's next call
  shows again; `service_calls` is in `useLive`.
- **Parcel tokens (0103).** A takeaway or delivery order gets `token_no` from the trigger — 1, 2, 3… per property
  per IST day. It shows on the floor's no-table card ("Token 7"), the kitchen ticket ("Takeaway · Token 7"), the
  printed bill and the TV. The till's own KOT print goes out before the order exists, so it carries no token.
- **`/kiosk`** is outside `(app)` — no sidebar — but `requireSession()` still applies the membership lock, and the
  page refuses a login without the Orders module. Flow: Tap to start → category tabs, 4:3 photo tiles → a dish
  with sizes or add-ons opens the chooser (`optionProblem`, the till's rules) → basket with an optional name →
  `kioskOrder` (`place_order` as takeaway, note "Kiosk", which lands on the KOT) → the token in 200px and *Pay ₹X
  at the counter*. It resets after 90 s untouched, 25 s after the token. Staff leave by holding the top-left corner
  for two seconds **and entering the tablet's sign-in password** (`kioskLeave`: checked on a throwaway sign-in that is
  then ended, so the tablet's own session and outlet are untouched; failed tries count like failed sign-ins). A kiosk
  left on across a deploy says it is updating and reloads once the server answers.

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
- **The Orders header** is `SvcHead` ("Orders — Tap a table to take or see its order") with one green button,
  **Parcel** (`/orders/new?type=takeaway`, `data-new-parcel`): dine-in starts from a table on the floor, so the
  header's button is for an order with no table. `new/page.tsx` passes `?type=takeaway|delivery` to the till as
  `initialType`. On a phone the button takes the full width under the title.

- **The phone/tablet cart bar** (`[data-cart-bar]`, below lg) sits at `max(10px, safe-area) + 78px` on a phone —
  above the bottom tab bar — and 16px off the edge on a tablet; it is absent on an empty ticket. It is a green
  strip: the count in a square and "n dishes" over the total on the left (a tap opens the ticket sheet), and a
  dark **Send to kitchen** on the right (`data-bar-send`) that sends straight away — unless something is missing
  (no table, a dish owing a choice, the pantry warning, no room), when it opens the sheet with the reason on it
  (and the table grid open). The count and the total never shrink (`shrink-0`, nowrap); the button's second
  language line ellipsizes instead — in Tamil the total was cut to "₹410…". The
  `body:has([data-cart-bar] button) [data-assist]` rule still lifts the assistant's button above it; from `lg`
  `body:has(aside [data-cart]) [data-assist]` moves it left of the ticket rail, where it sat on Send to kitchen.
  The dish grid has `max-lg:pb-24` so its last row scrolls clear of the bar.

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
  title-and-search row (`[data-till-head]`, `--till-head`) and the category column stick on the same
  line, on the page colour, with a `-14px` shadow of it painting the gap under the bar so cards do
  not show through. Below `lg` nothing is pinned. Probe: `till.mjs`.
- **The till's head and steps** (`[data-till-head]`): Back (48px), "New order" over the title, and — below
  `lg` — **Change**, then the steps **1 Table · 2 Dishes · 3 Send** (`.svc-steps`, `data-steps`; step 1 opens the
  table grid) and the 56px search on full-width lines of their own. From `lg` the steps are hidden (the rail
  beside the dishes shows the same thing) — with `lg:!hidden`, because `.svc-steps` sets `display` unlayered —
  and the search sits beside the title.
- **The categories are a row of tabs across the top at every width** (`.svc-cat`: the category's picture from
  `catIcon` and its name, 48px; `data-cat`), a `Rail` labelled "Categories" under the steps and the search. From
  `lg` the row sticks under the till's head (`--till-top` + `--till-head`). A 96px column of squares beside the
  dishes was tried first (2026-10-15) and the owner asked for the row instead. The Order line and Goes well with
  are `Rail`s too.
- **An Order line card** (`[data-line]` = `orderState()`, `w-52`) wears the floor's colours (`.st-*`): the table
  in display type with its state as a chip (Ordered, Cooking, Food ready, Eating, Bill), "#no · N items · ⏱ age",
  and a three-segment bar in the state's hue. A food-ready ticket has a green wash and edge. The running orders
  query now carries `bills(status)` so a printed bill reads Bill.
- **"All orders →" over the Order line is a 44px target** (`min-h-11 pl-2 -my-3`): the height is
  taken back by negative margin, so the row does not grow. It was 67×16. Do not add `-mr-*` — it
  pushed the link 8px past the section on the right.
- **The till's Back is a 48px square** (`h-12 w-12`, every width) — over the 44px touch floor without a
  coarse-pointer rule.

- **The floor is two tables across on a phone** (`grid-cols-2 min-[520px]:grid-cols-3`). At three, a
  108px card could not hold "T3 · READY · 4 seats". In the open-orders list the dish names truncate
  and the total is `shrink-0`, so they never run together.

- **The control floor is unlayered CSS** (`:where(button) { min-height: 40px }`, 44 under a coarse
  pointer). A plain `h-8` utility loses to it; only an `!important` utility wins. Size tile and rail
  controls at 40 (`h-10`) and let the floor lift them on touch — do not fight it with `!h-8`.
- **A picture card at two across on a 412 phone is ~184px**: the price and Add (or − +) share its foot, which is
  why the stepper on a card has no count (it is on the photo). Below `sm` the foot is compact (2026-10-20, below), so the
  price is not cut any more.
- **`minmax(0,1fr)`, never `1fr`, for the dish track.** A `1fr` grid item will not shrink below its
  content and pushes the ticket rail off the screen. Pair with `min-w-0` on the section.
- **A floor table is one card in its state's colour** (`.svc-table`, `[data-table-card]`, `data-state`):
  the table in 34px display type with its seats; a free one is dashed with **Take order** (a link whose
  `::after` covers the card) and a 40/44px **Reserve** icon in the name row (over the link, `z-[1]`); a reserved
  one is amber and dashed (Unreserve); one with a ticket shows its state with its picture, the time since the
  order and the total, and a red **LATE** tag on its corner when a dish is past `kds_target_minutes`
  (`isLate`). A table marked occupied with no ticket reads *At table*. Above the floor, chips count each state —
  a tap shows only those tables (`data-state-chip`); on a phone they are one compact row that slides sideways (a
  `Rail`, "Tables by state" — they had wrapped into three uneven rows), from `sm` they wrap, and a parcel / delivery / room-service order with no table
  gets a card of its own in *Parcel · delivery · room*. `page.tsx` reads `bills(status)` and each line's
  `created_at` for that.
- **Reserved is `--color-orange` with a dashed border**, never `--color-saffron`, which is green in
  the dark theme. Free carries a green dot.
- **Paid and left is Cleaning (0111)** — a free table with an open `table_cleanings` job: cyan, dashed, who has it,
  *I'll take it* or *Done*, and a 44px + to seat the next party anyway (which closes the job). `page.tsx` reads the
  open jobs and `profiles` for names. [cleaning.md](cleaning.md)
- **Every open order as a card is the List view** (Tables · List, a `Segmented` beside the chips, remembered on
  the device as `df-orders-view`): one across on a phone, two from `md`, three from `xl`, four from
  `min-[100rem]`. Write that breakpoint in rem: Tailwind v4 sorts an arbitrary `min-[1600px]` ahead of its own rem
  breakpoints. The floor's grid is 2 · 3 (`min-[35rem]`) · 4 (`md`) · 5 (`xl`) · 6 (`min-[87.5rem]`) across — six
  at 1440, where five left one table alone on a row.
- **An order card** (`[data-order]`, `data-state`): a 4px strip and a status chip in the floor's colours
  (red when late); the table in a square (or the kind's icon), `#no · N items · age` — the age amber past 12 h;
  the customer; the kitchen's progress as a bar by plates with counts; the first three dishes, each with its own
  state dot; and the total in a footer strip edge to edge.
- **Stock is not `is_available`.** `is_available` is the dish-level sold-out switch the menu owns;
  `menu_stock` is the live count derived from recipes and the pantry. Both can hide a dish.
- **Never write `order_items` directly.** `place_order` recomputes the ticket, applies variants and
  add-ons, and checks stock in one transaction.

- **The phone's dish card is compact and the whole card adds (2026-10-20 — the owner: the price showed as "fro…"
  beside a big Choose).** Below `sm` only (two across): the dish button's `::after` covers the whole card, so a tap on
  the photo, the name or the price adds one — **a plain dish shows no button at all**, only its price (the owner, on a
  first try with a round `+`: "don't add an Add button — the card is the Add"; its `.more` is `max-sm:!hidden`, still in
  the page for wider screens). A dish that asks a size or add-ons shows a compact **Choose** pill (`[data-choose]`, 32px
  to the eye, 44px to the finger through a `::before`, sliders icon + the word) and its card opens the chooser (it
  cannot go on the ticket without one). "from" sits as a small line over the price (`[data-tile-price]`, 20px), which
  is never cut. The stepper and the pill stand above the card-wide tap (`relative z-[1]`). From `sm` the card is
  unchanged. `data-tile`, `.more`, `.less` and the aria-labels are as before.
- **A new order picks from the free tables only (2026-10-20 — the owner: "only show the free tables, not the reserved
  or booked ones").** `new/page.tsx` works out `notFree` (table id → why): **occupied** — an open order on it, or
  marked occupied; **reserved** — marked reserved on the floor, or a today's reservation (requested / confirmed) due
  from 30 min ago to 2 h from now (IST); **cleaning** — an open `table_cleanings` job (0111). The picker
  (`[data-table-picker]`, buttons `[data-free-table]`) leaves those out but always keeps the order's own table; with
  nothing free it says so (`[data-no-free-table]`), and a line under it counts what is hidden (`[data-hidden-tables]`).
  The phone's step **1 Table** opens the same grid. Move / merge on the order page are unchanged (moving onto a busy
  table is a merge). **Room** already lists only checked-in guests (`bookings.status = 'checked_in'`) — never a room
  that is only booked, never an empty one.

- **The till's running-orders "x min ago" carries `suppressHydrationWarning`** (2026-10-22): rendered on the server and
  again on the device, it can straddle a minute, and React logged #418 and redrew (`check51.mjs` caught it once).

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
- **The order screen's live channel refreshes calmly and signed in** (2026-10-18): it called `router.refresh()` on every
  `order_items` event — three dishes, three renders, each able to cancel the action's own answer — and joined without the
  signed-in token. It goes through `calmRefresher` (lib/liveRefresh.ts) and sets the token before joining.

- **Flap numbers (2026-10-20)** — design-system.md, *Flap numbers*. The phone cart bar's count (`[data-cart-count]`) and each dish photo's `.qty` (now `.qty.qty-flap`, `[data-qty]`) are mini flap tiles that flip as dishes are added.

- **The till's dish cards end the same at every width (2026-10-21, the owner: "the desktop like the phone"; "some have
  Choose, some nothing").** The price with *from* above it (on a desktop the pill had squeezed it to "from …"), and one
  compact pill: **Choose** for a dish with sizes or add-ons, **+ Add** (green tint) for a plain one; on the ticket, the
  − / + stepper. The name keeps two lines (`min-h-[2.75em]`), so a row's prices line up. Below sm the whole card still
  adds. Hooks `[data-choose]`, `[data-add]`, `[data-tile-price]`. shots39: 16 cards at 412 and 1440 — every one a pill
  or stepper, no price cut, prices of each row level.

- **The dish card, third pass (2026-10-21 — the owner: "not satisfied on desktop, laptop and iPad"; a phone showed
  prices cut at a card's foot).** The foot row is gone. The move sits on the photo's lower edge, centred: **ADD** (or
  **CHOOSE** for sizes / add-ons) as an outlined pill on the card colour, **− / +** once the dish is on the ticket (the
  count stays on the photo, `FlapMini`). It is `.act`, placed by CSS at `top: calc(100cqw * 10 / 16)` — the card is a
  size container (`container-type: inline-size`) and the photo is 16:10, so the edge is 62.5cqw down at any width.
  Under the photo: veg mark and name (two lines at most), then the price (`from` before it), the prep time and
  *customisable* (`[data-tile-price]`; `page.tsx` now reads `prep_minutes`). The whole card adds at every width
  (the dish button's ::after); the pill and the stepper stand above it (z-2). The photo's flags (*Pantry short*, *n
  left*, *Combo*) moved to its top-left. shots40: 412 / 834 / 1194 / 1440, dark and paper — every move on its photo
  edge (±3px) and inside the card, no price cut; Add becomes − / + on the same edge.

- **A dish name is one line** (2026-10-21, the owner: "no double lines"): the veg mark moved down beside the price, so the
  name has the full width (`[data-tile-name]`), set a size down when long (≤ 16 letters 15px, ≤ 22 13.5px, else 12.5px) —
  "Paneer butter masala" fits at 1440 — and past that an ellipsis with the whole name on hover (`title`). shots40: no name
  on two lines and none cut, at 412 / 834 / 1194 / 1440.

- **The cleaning table card on Orders** (2026-10-21, the owner: "messy"): built like the other table cards — name and
  seats (no negative margin; the name had touched the dashed edge), the state, *Waiting for someone · 2h* / *You are on it
  · 5 min* / *Given to …*, then one row: the move (*I'll take it*, *Done*, or *See who*) filling it and a round + to seat
  the next party anyway. On a two-across phone card the time, the move and + had not fitted one row and + stood outside
  the card. shots41: every control inside the card at 412 and 1440.
  **On a phone (2026-10-22, the owner: "not looking good" — the live card cut *Waiting for someone · 2d …* and wrapped its
  button onto two lines):** below md the frame is a soft solid cyan (1.5px, the dashed ring read as broken on a small card;
  iPad and desktop keep the dashes) and the who line is a row of its own (`[data-clean-who-phone]`): who has it in a few
  words — *Nobody yet*, *You're on it*, *Ravi's on it*, *For you* — on the left, how long in a tinted pill (clock + *3d*)
  on the right that never truncates. The moves never wrap: their words truncate inside, and under 400px the icon goes so
  *I'll take it* fits a 360 card. Probe `shots68.mjs`.

- **Tables: the filters on a phone (2026-10-22, the owner: "not looking good")** — below md the states are one sliding row
  in a soft track (`[data-tables-filter="phone"]`, buttons `[data-table-filter]`): the chosen one raised on the card
  colour, the rest a dot, the word and a quiet count, 44px chips; the zone select is a pill at its end (`[data-zone-pick]`).
  They wrapped into two rows round the zone select. iPad and desktop keep the wrapping chips (`[data-tables-filter]`).
- **Tables — a screen of its own (2026-10-21, the owner: "one more menu, Tables — click one and show its details
  completely").** `/tables` (`app/(app)/tables/page.tsx` · `TablesClient.tsx`), the menu's first row under *Guests &
  tables* (`ITEMS` key `tables`, `mod: "orders"` — whoever holds Orders sees it; appended last in `ITEMS` so the phone
  bar's defaults do not move; `ROUTE_MODULE.tables = "orders"`). Four tiles (free of all, in use with seats, bookings
  today, taken at tables today); chips by state (Free · In use · Bill out · Reserved · Cleaning) and a zone select; the
  tables by zone (`[data-table-row]`, `[data-table-state]`) — a state is the open order (an unpaid bill = *Bill out*), else
  an open cleaning job, else a booking still to come today (half an hour's grace), else free. A tap opens the table's
  Sheet (`[data-table-detail]`): State · Zone · Seats · Table ordering; **Now** — order no., guest, since when and who
  took it, each item with its state and amount, the running total or the bill out; **Cleaning**; **Bookings today** on
  the table (time, guest, party, state, Call); **Today at this table** — bills, takings, the average sitting (paid −
  order start) and the bills; the table's **ordering QR**; then *Take order* / *Add items* and *Bill* as the Sheet's
  pinned footer. Every query is this property's by id. Live through `useLive`. shots45: 13 of 13 at 1440 / 834 / 412.

## The till's dish cards (2026-10-23)

The owner: "Choose and Add — compact and modern; even card heights; the selected border cuts the photo; a tap on the card adds it — only Choose opens the choices".

- **A tap on the card, or +, adds the dish** — a dish in sizes goes on in its default size (`defaultVariant`) with no
  add-ons. Only a dish with a *required* add-on group (`optionProblem` on no add-ons) still opens its choices, so nothing
  half-ordered reaches the kitchen. **Choose** (`[data-choose]`) always opens the sizes and add-ons (`choose(it)`).
- **The move on the photo's edge**, from md: a solid round **+** in the tint (`.dish-plus`, ringed in the card colour) and,
  for a dish with choices, a slim **Choose** pill beside it (`.dish-chip`). **On a phone the same round +, 40px** (2026-10-24, the owner:
  "only the plus symbol is enough"); the ADD pill with its word is gone (globals.css, under 768).
- **Even cards**: name, then the price row (never wraps), then one fixed 16px line for "14 min · customisable" (blank when
  there is nothing) — the price no longer rides `mt-auto`, so no card has a gap between its name and its price.
- **The selected ring is drawn over the photo** (`.svc-dish[data-on]::after`, an inset ring at z 3); the inset outline it
  replaced painted under the photo and vanished along the top and the corners. All widths.
- **Short copy** (2026-10-23): subtitles and hints cut to a few words.

- **A dish the pantry cannot make cannot be ordered** (0137, 2026-10-24, the owner: "most important"). `place_order` refuses a
  ticket asking more of a dish than `menu_stock()` says its recipe and the pantry can make ("Not enough in the pantry: Chicken
  biryani (0 left — Basmati rice is out)"), when `restaurants.stock_block` is on (default; Settings → Kitchen). Never an order
  synced from offline (placed_at set), never a dish with no recipe, never an aggregator's accepted order. The till: such a
  card greys with **Out of stock** (`[data-out]`), a tap is refused with the reason, one more than is left says "Only N left",
  and Send stays off while anything on the ticket is short — no "Send anyway" (that remains when the owner turns the switch off).
- **Choose is a round options key** (2026-10-24, the owner: "an icon only"): the sliders in the tint on a ring, the same circle as
  + (38px, 40px on a phone — `min-width: 0 !important` beats the touch minimum), both shown at every width; a plain dish keeps ADD.
- **A parcel's details** (`[data-parcel-details]`): Pickup (or Deliver) Now · 15 · 30 · 45 min · 1 hr, and Packing (Cutlery / No
  cutlery / Extra sauce / Gravy separate / Eco bag). They join the order's request and print on the kitchen ticket ("Pickup by 7:45
  PM · Cutlery"). The strip at the top follows the type: the tables' open tickets for dine-in, the parcels' (by token) for a parcel
  or delivery (`[data-order-line=tables|parcels]`) — a parcel no longer shows tables.
- **iPad and desktop round (2026-10-24, the owner's screenshots; the phone is unchanged).**
  - **Orders, list view, nothing open** (`[data-orders-empty]`, sm+): `EmptyState` with the waiter's icon, a line on what fills it,
    and **Parcel** and **Phone order** (`[data-empty-parcel]`, `[data-empty-phone]`). The phone keeps the dashed line.
  - **The till's side panel on an iPad in landscape** ("screen broke the design": a delivery's details pushed Send to kitchen
    below the screen). Between the order type and the footer is one scroll region, `[data-cart-scroll]` — on lg a flex
    column that scrolls; below lg `display: contents` with `[&>*]:shrink-0`, so the phone and tablet sheet lay out exactly as
    before. The ticket lines no longer scroll inside it on lg (`lg:min-h-fit lg:overflow-visible`). The footer — Cooking
    request, the total, **Send to kitchen** — always shows. Parcel and Delivery on lg: name | phone as one joined field, the
    name wider (`[data-cust-name]`, `[data-cust-phone]`, a separator line between, so "Customer name" is no longer cut); the
    time as one segmented track of five; Packing one row that slides (`[data-packing-rail]`); a compact empty ticket.
  - **Phone order → Call** ("Call option need add here", sm+): a green **Call** inside the number field
    (`[data-call-number]`), on the waiting panel (`[data-call-waiting]`, an `EmptyState`) and on the caller's card
    (`[data-call-caller]`) — `tel:+91` and the ten digits, off (`aria-disabled`) until ten are typed. On an iPad or a Mac it
    rings through FaceTime / the linked phone.

- **The kiosk's leave has its own lockout (2026-10-25 audit).** `kioskLeave` counts failed passwords in a bucket of that tablet's
  sign-in (`kiosk:<user id>`) — one shared `kiosk` bucket let anyone with any account stop every kiosk being left for 15 minutes.
- **Tables · List is the app's ViewSwitch (2026-10-25).** `[data-view-switch=orders]` replaced the Segmented control; a tap
  shows the other for this visit, the pin keeps it (`df-view:orders`; a choice kept before under `df-orders-view` reads as
  pinned). Design-system.md, *One switch everywhere*.
