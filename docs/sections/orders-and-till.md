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
**Table** when none is picked) that opens a 5-across table grid — occupied dimmed, the "already has order #n
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
  why the stepper on a card has no count (it is on the photo) and the price truncates before the buttons do.
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
