# Testing and the gates

> Nothing is "done" because it looks done. It is done when something measured says so.

## The gates — all four, every time

```
pnpm lint          # 0 errors (14 warnings are known and pre-existing)
pnpm typecheck     # clean
pnpm test          # 82 unit tests in 15 files — lib/security.test.ts (7: CSV formulas, print HTML escaping, privateAddr for the OTA feed fetch) + offline outbox, options, rates, print route, dish photos, till search, wa, room suggest, marketing, bar, schema.org, upi, recipes, install (10: the device, browser and install plan for ~30 real user agents; the Edge, Chrome and WhatsApp links)
pnpm build         # a real production build
```

`pnpm build` **clobbers `.next`**, which kills a running `next dev`. Run the browser suites first,
build last, and restart the dev server if you need more screenshots.

## The browser suites

> **These are not in the repo.** They are written per session into the working scratchpad and
> thrown away with it. The table below is the record of what each one checks so the next session
> can rebuild it rather than reinvent it — and so a claim like "24 toolbar checks passed" in a
> commit message can be read. **Committing them to `scripts/` or `tests/` is an open decision**;
> until then, expect to write the one you need.

They drive headless Chrome over the DevTools Protocol against a dev server on **port 3141**, signing
in by injecting the chunked `sb-<ref>-auth-token` cookie and calling `admin_act_as` to stand inside
a property.

| Suite | Checks | Covers |
| --- | --- | --- |
| `dashcheck.mjs` | 6 | the control room at 1920/1440/1194/834/412 |
| `board.mjs` | — | prints every dashboard band's top/height; `RAGGED` = misaligned |
| `cal.mjs` | 6 | the month grid at 4 widths + an empty month |
| `toolbars.mjs` | 24 | six chip rails × four widths |
| `design-test.mjs` | 21 | the till, the invoice pane, the phone sheet |
| `responsive.mjs` | — | menu/pantry/add-ons dialog at 5 widths |
| `guests-test.mjs` | 17 | the guest sheet; **restores the guest it edits** |
| `legal-shot.mjs` | 18 | the legal pages; public paths make no auth call |
| `dialog-audit.mjs` | 35 | every dialog, 0 with two scrollbars |
| `audit-isolation.mjs` | — | tenant isolation |
| `stale.mjs` | — | what a dead refresh token actually gets |
| `spill.mjs` | — | names the element hanging off the right edge |
| `gest.mjs` | 10 | pull-to-refresh and edge swipes at 412 with real `Input.dispatchTouchEvent` drags: a full pull fetches RSC once and keeps a typed field; a 50px pull, a pull while scrolled, and a browser-tab edge swipe do nothing; in the installed app a left-edge swipe goes back, a right-edge one forward, a 54px or mid-screen swipe stays put. **Chrome cannot emulate `display-mode: standalone`** (`setEmulatedMedia` ignores it) — shim `matchMedia` with `Page.addScriptToEvaluateOnNewDocument`, using `q.includes('standalone')` (a `\s` inside the template string is lost), and print `matchMedia(...).matches` so a false pass is visible |
| `nt.mjs` | 10–11 | notifications: Sign out on the Settings title row (vertical overlap with the h1, 44px, POST); the card's 4 devices and 6 tones all ≥44px; a tone tap plays (counts `createOscillator` via an init script) and saves to `df-notify`; then **inserts a real `reservations` row** and expects the tone, a toast (poll — a toast lives 3.2s), the bell's count, the panel line, the *Sound & alerts* sheet, read-on-close, and on a phone the wordmark → /dashboard. **Deletes the probe reservation in `finally`** (`put back: probe reservation "Probe Notify" removed`). The settings sheet's labels are CSS-uppercased, so match them with `/i`. |
| `logo.mjs` | 15–16 | the logo upload: the URL box is gone; a 6 MB file, an SVG, a GIF and a 64 px PNG are each refused in words with nothing saved; a 1200 px PNG made in the page is shrunk to 512 px WebP and saved (logo_url = the `brand` file, served publicly, < 1 MB); the bucket itself refuses another property's folder, a 1.1 MB file and an SVG sent straight to the Storage API; Replace leaves one file; Remove clears both; at 1440+ the sidebar shows the new logo. **Restores `logo_url` and removes probe files through the Storage API.** |
| `props.mjs` | 8–10 | Settings → General's cards: titles in order (7 for a hotel, 6 for a restaurant), Property details holds only type/name/phone/address, Kitchen only `kds_*`, Rooms & stays the check-in/out and inspection; no sideways scroll; the save bar on screen mid-page, above the bottom nav, not under the Assist button; a Save that edits four cards writes exactly those columns and nothing else (24 columns compared). **Restores all 24 columns.** |
| `diag3.mjs` | every route | `diag2` plus page errors: `Runtime.exceptionThrown`, console errors and any 4xx/5xx document/fetch/script/image, one line per page (`ok` / `ISSUE` + reasons). `CDP` from env so several can run; driven by `sweep2.sh` (one property per call). **Run properties one after another, not in parallel** — every probe signs in as the same master, and `admin_act_as` is per user, so parallel runs switch each other's property and produce false 404s (`/billing/<id>`, `/frontdesk/<id>`). |
| `walls.cjs` | 27 | database security (0084): as a low-role login and as an owner, through `set local role authenticated` + JWT claims in a transaction that is always rolled back — self-promotion, UPI change, free membership, deleting payments/invoices/the property, writing invites, editing bill or invoice totals, low role changing GSTIN, anon calling `box_apply`/`box_export`/`demo_user`/`seed_storefront`, reading `v_low_stock` — all refused; and what the app does (owner Settings/Tax, staff Neighbours, invoice bill-to, `create_invite`, `staff_login_domain`, `network_demand`, `forecast_day`, `session_bundle`, staff list) still works. `DRY=1` applies the migration inside each transaction first. | **Its "void an unpaid bill" case is stale since 0087**, which closed every direct bill update ("a bill can only be changed from the till"): expect it refused. 27 checks, 26 pass on 2026-10-13 after 0095; the one fail is that case.
| `t0085.cjs` | 7 | a box token cannot rewrite another property's menu item but still updates its own; anon and signed-in cannot call the OTA functions, the service role can; one `pay_…` ref cannot settle two bills, cash refs may repeat. |
| `testorder.mjs` | 3 | Channels → Send test order reaches this server's own webhook and records one order; **removes it**. |
| `perf.mjs` / `perf2.mjs` | 26 screens | load speed, laptop and phone (4× CPU, 9 Mbps, 60 ms): server time, DCL, LCP warm and cold, CLS, JS kB; `perf2` also prints FCP and the LCP element — **check that element**: once it was the error screen ("Nothing you entered has been lost"), which reads as a slow page. |
| `five.mjs` | 15 | four phone layouts at 412/834/1440, dark and paper: Neighbours' tabs an even 2×2 ≥44px (chips in one row above); the OTA card checks are superseded by `otalist.mjs` (the cards became a list); Reports' speed tiles equal height with one-line labels; Tax → Returns' stepper bar with the month centred, CSV full width under it, the card-title note under its title, no table for an empty month. Reads only. |
| `otacards.mjs` | 15 (dark) · 12 (paper) | Channels → OTA channels as cards at 1920/1440/1194/1080/834/412 (hotel `manoooo` and resort `Tan Resort`): 3 across at 1920/1440/1194 (a touch iPad's 1042px list), 1 across at 1080/834/412; each row of cards one height; the footer strip edge to edge (left, right and bottom within 1.5px) in 4 equal sections, icon over word under a 26rem card and beside it from 26rem, 44px or more on touch, every icon 15px; no label cut; the name on one line with the Live/Draft chip beside it; the link fields at one height along a row; the link's last 12 characters in view, left of Copy; Copy ≥44px on touch; the field beside the name only on a card from 48rem (1080); nothing past a card; no sideways scroll. Presses Copy ("Copied" on that card only, the clipboard holds the full `https://` link, back to "Copy" after 1.8s) and Sync on a channel with no feed (spins, a toast, no reload: a window marker and the scroll position survive). Paper is forced with the `df-theme` cookie **and** the attribute: ThemeKeeper puts the cookie's theme back. Writes nothing. Supersedes `otalist.mjs`. |
| `taxstrip.mjs` | 19 (dark) | Tax → Calendar, Documents and Returns at 1920/1440/1194/834/412 (hotel `manoooo`: 13 filing cards — 2 filed, 2 overdue, 9 due — and 10 documents): every card ends in its strip, edge to edge (left, right, bottom within 1.5px), equal sections, no label cut, icons 15px, ≥44px on touch; the cards of a row one height; every link section opens a new tab on an http(s) address; nothing past a card; no sideways scroll. At 1194 and 412 it presses *Mark filed* (the date — today — and the ARN open inside the card, the strip reads "Cancel · Save as filed" and stays on the card's foot), then *Cancel* (back to "Mark filed · Open portal"), and *Edit* on a document ("Edit document" with its title filled in) and Escape. Saves nothing. Paper: `PAPER=1`, which sets the `df-theme` cookie and the attribute. |
| `labicons.mjs` | 5 per pass | Labour → Today at 1920/1440/1194/834/412: every card's *Pay* square (and *Punch link* with `PHONE=1`) is exactly the height of *Mark present* / *Mark absent* beside it — 40px with a mouse, 44px on touch — square, with a 20×20 icon centred on a grey fill; the row on one line inside the card; no sideways scroll. `PHONE=1` turns `selfie` on for the property for the run with a direct update and prints `put back: attendance_methods [...] restored to how it was found`. `PAPER=1` for paper. Passes 2026-10-13: hotel 5/5, resort +selfie 5/5, paper 5/5. |
| `fivefix.mjs` | 25 | Five fixes of 2026-10-13, hotel `manoooo`; `PART=labour|audit|folio|admin|select` runs one.
- **Labour, 3 checks** (1194, 412, 1440): every card has its month calendar by default; the *Month calendar* switch hides them all (354px cards become 178px); a reload keeps them hidden; switching it on shows all. Puts `df-labour-cal` back as found.
- **Audit, 5 checks** (1194, 1366, 834, 412, 1440, touch where real): the chips box holds every chip; one arrow tap reaches the end with the last chip fully in view, clear of the arrow; the next tap goes back. The scroll is compared within 1px, since the browser stops at 351.x of 352.
- **Folio, 5 checks** (1920, 1440, 1194, 834, 412): the folio comes out of the printer; the machine fits its column (sides 22px, or 8px in the 344px column at 834), centred on the paper; "Front desk · READY", FOLIO-0024.
- **Master control, 4 checks:** on /admin/testing at 1194 and 834 touch the frame scrolls (overscroll none, html hidden) and the last card is ≤30px off the bottom at the end; at 1440 with a mouse the page scrolls as before; /admin/compliance at 1194 touch has ≥1px to scroll.
- **Selects, 8 checks** (1194, 834, touch), with base-select hidden from JS: New room → Type opens the list exactly the field's width, 6px under it, 44px rows, the chosen one ticked, the field marked open and not focused; a pick sets the field and closes the list; a tap outside closes only the list. Tax → *What is it* runs the screen's onChange.
- **Chrome with a mouse, 1 check:** the styled list opens; `select-picker-1440.png` shows it at the field's width.

Writes nothing. |
| `navline.mjs` | 4 per property | The sidebar's group lines at 1194 and 834 (icon rail, touch) and 1440 and 1920 (full menu). Every `.nav-group` but the last has a 1px `::after`, 36px wide on the rail and 200px in the full menu; the last group has none; there are 23px (rail) or 27px (menu) from a group's last item to the next group. 2026-10-13: hotel 4/4 (5 groups), restaurant 4/4 (4 groups), resort in paper 4/4. `DARK=1` forces dark in the test browser only: the Master login has paper saved (set 11:19 IST 2026-10-13 with the theme button, not by a probe), and `ThemeSync` applies it on every page. |
| `dry95.cjs` | 19 | 0095 dry run in a rolled-back transaction, as two real sign-ins of the master (`set local role authenticated` + `request.jwt.claims` with their `session_id`). A opens manoooo; B opens Tan Resort and goes Back; A stays inside manoooo throughout. The Functions self-test puts each sign-in back. RLS reads follow the sign-in. A call with no session id uses the old row and leaves A alone. Owner, anon and a non-master Open behave as before. A direct write is refused. An ended sign-in's row is tidied on the next Open. Leaves no table behind. |
| `twosign.mjs` | 10 | The same on the running app: the browser's sign-in opens manoooo. A second sign-in of the account opens Tan Resort, then goes Back. The browser taps /rooms, /housekeeping, /labour, /frontdesk, /orders and /tax and reloads; every time it lands where it tapped, with the banner still "viewing manoooo". Steps both out with their own tokens and signs both out. |
| `openback.mjs` | 6 | Open on the manoooo row → `/dashboard` inside it, then Back to Master control → `/admin` and out; three rounds at 1194 touch, ~1.5 s each way. |
| `dry96.cjs` | 26 | 0096 in a rolled-back transaction, each caller played by role + JWT claims:
- A housekeeping login raises; manoooo's owner sees it; Tan Resort's owner sees nothing and cannot answer.
- Master control lists it (unread, badge) and replies, which moves it to waiting and stamps the first response; an internal note is added.
- The raiser sees the reply, not the note, and the unread count goes 1 → 0 once opened. Their answer reopens it.
- A screenshot attaches in its own folder; another folder or property is refused.
- Sorted, rated 5, access taken back. The owner cannot rate. Privacy is due in 15 days.
- A direct update and anon are refused; the eleventh request in an hour is refused.
- Leaves no table or bucket behind. |
| `dry97.cjs` | 4 | 0097: Master control takes a screenshot off a message (the thread says so), the property cannot, a wrong path is refused, the delete policy is masters-only. |
| `supportflow.mjs` | 14 | Help & support end to end at 1194 (and 1440, 412, 834):
- **Raise:** the form (3 contacts, 6 kinds, side by side); filled with a screenshot via `DOM.setFileInputFiles` → *Sent*, the screenshot loaded; stored with the device and the file in its folder.
- **Master control:** the badge, 8 counters and the row marked unread; the full request (consent "allowed", where they were, 4 quick replies); a reply (→ waiting, an event) and an internal note.
- **The property:** "1 new reply" and a list mark; the thread shows the reply, not the note; opened, the badge clears; *This is sorted*, rated 5.
- **Master control again:** the rating; removing the screenshot deletes the file. Phone and iPad upright: two tabs, kinds 2 / 3 across.
- **Clean-up:** deletes the request, its messages, its admin_log lines and the file, and restarts the numbering if no other request exists.

`DARK=1` forces dark (the master login has paper saved). Passes 2026-10-13: paper 14/14, dark 14/14. |
| `dry98.cjs` | 63 dry · 57 live | 0098, all in ONE transaction that is always rolled back, each case in its own savepoint as the role + JWT claims PostgREST would use (`DRY=1` applies the migration first; without it, the live database as it is — before 0098, 33 cases showed OPEN). Property A = a hotel with tables, dishes and a housekeeping login; B = a resort with a guest in house; throwaway waiter/cashier logins made inside the savepoint. **Stranger:** `accept_online_order_for`, `next_number`, `sweep_expired_demos`, `dine_review`, `quote_wait(2, property)` → *permission denied*; a direct table insert refused; the definer functions anon may run are exactly the public list + RLS helpers (28). **Across properties:** B posts A's open order to its in-house guest → *order not found or already settled*; place_order / reservation_set on another's table → *table not found*; create_booking another's room / guest → *room / guest not found*; set_rate_inventory another's room type → *room type not found*; staff_login_domain → *not your property*; direct rows on another's room / dish / room type → *belongs to another property*; the 68 FKs covered by 38 triggers. **Codes:** one wrong password-change code leaves attempts = 1; five wrong reset codes, then the right one refused. **Secrets:** staff `select box_token` denied; session payload without it; the owner still reads the other columns; temp password / code shapes; 12-hex invite; `master_password_is_default`. **Walls:** housekeeping cannot reprice, add a 100% offer, move printers or add a channel, can add a dish from Scan; a cashier can map a dish, not reprice it. **Still works:** orders by owner and waiter, the resort's own booking and rates, `quote_wait(2)`, Staff's login domain, session_bundle, the master's demo sweep and menu inside a property, a table order by a guest (accept inside), the 11th order an hour from one number refused, the 4th queue join, the 11th track miss, the storefront, a room booking on /book (it had failed for everyone), the 4th booking a day, a 60-night stay refused, "Try a demo" with 16 dishes, the sign-in gate (10 failures close that id only; strangers cannot call it), the lockout scrambling once. **Grants:** signed-in lost only `dine_review`, `next_number`, `quote_wait(int,uuid)`, `accept_online_order_for`. Count rows with `reset role` — RLS hides `password_otps` and a demo's dishes from the API roles (both were probe bugs on the first run). |
| `dry99s.cjs` | 8 | 0099 as the master, rolled back: an existing sample owner on the old shared password is scrambled; `install_sample_estate` builds six properties (102 dishes, 4 145 bills, nothing across properties) with 0098's triggers in place; five new owners each get their own generated password that signs in; the existing login keeps its own (null). |
| `dry99.cjs` | 10 | `supabase/pending/after_deploy_secrets.sql` on top of 0098 (`LIVE99=1` once 0098 is live): the owner cannot select either channel's `api_key`, `select *` is refused (why it waits for the deploy), the new Channels columns read, saving and writing a new key still work, a session cannot call `request_password_otp`, the service role can call `request_password_otp_for`, the OTA sync still lists feeds. |
| `selftest98.cjs` | 19 + db | the app's own self-test as the master, before and with 0098: `selftest_functions` 19/19 both; `selftest_db` — no table without RLS (88 with `rate_hits`), no bare policy, nothing missing. |
| `sec98.mjs` | 9 per run | at 1440 paper, 1194 dark, 834 and 412 paper: Master control's default-password notice (44px button, no sideways scroll; stacked on a phone), every property's code under its name (the swapped `access`/`boxes` reads), the password sheet does not print the shipped password; `/channels` and `/online-orders` inside manoooo carry no partner `api_key` (only `has_api_key` — match `[^_]api_key`, or `has_api_key` reads as a leak). |
| `throttle.mjs` | 2 | the sign-in form signed out with a made-up id: ten wrong passwords, then the eleventh *Too many sign-in attempts*. **Needs `SUPABASE_SERVICE_ROLE_KEY` on the server** — the form skips the gate without it, and this machine's `.env.local` has none, so locally the eleventh is still "Invalid login credentials" (the gate itself is proven in `dry98.cjs`). `throttleclean.cjs` removes its counter rows. |

| `dry100.cjs` | 27 | 0100 in one rolled-back transaction as manoooo's owner (or anon): a 2-night ₹4,000 stay with ₹1,000 off — folio ₹7,350, check-out, invoice ₹7,350 "paid", tax on the discounted room, the folio after check-out (paid, balance 0, payments not discounts); the same with a posted order and a ₹1,000 extra (folio = invoice, lines' GST = CGST + SGST); no GSTIN (no tax row, no GST, no rate); a dining bill with 10% off and 5% service charge (header adds up, lines' GST and taxable = the bill's, a service-charge line); −10% discount, a voided bill's payment, staff resetting `counters`, room GST default; a lapsed property's table order, queue, room booking, storefront and discovery; photo credits; "Push" says not sent. Without DRY the same cases show today's functions — 11 of them failed before 0100. Dishes sit under `menu`, not `categories` (a probe bug on the first run). |
| `dry101.cjs` | 4 | `queue_place`: a stranger gets a listed live place's name; an unknown slug, an unlisted place and a lapsed one get nothing. |
| `fullsweep.mjs` | 775 visits | every app screen at 1920/1440/1194/834/412 for a hotel (dark, + Master control + every public page signed out), a resort (paper) and a throwaway demo restaurant (deleted after by `dropdemo.cjs`): error card, not found, sideways scroll, past the edge, script errors, where it landed. One error card: a session check that hit the 8 s statement timeout while three sweeps ran at once — a capacity signal, not a code fault. Uses `headp.mjs` (`CDP`, `PROFDIR` from the environment, so sweeps run side by side). |
| `ready100.mjs` | 12 | Online orders' reject dialog (Keep it leaves the order; a reason rejects it and the aggregator's note and fee survive — it creates one online order and deletes it), the bill's service charge and an 18% tax summary on Tan Resort, an invoice renders, storefront photo credits, the queue's privacy line, the Contact page, Channels' sync wording, Settings' labels tied to fields, the toast live region. |
| `public.mjs` | 9 | every public page as a stranger, by content not just by load: discovery lists the place, the menu has prices, the table and room booking forms, the queue's join form (it said "not taking a queue" to everyone, live too) with its privacy line, a pay link, privacy, sign-in. |

> **The probes sign in as `master@dineflow.in` with the password 0011 shipped with** (`head.mjs`'s
> `token()`). Once the owner changes that password — Master control asks them to — `token()` needs the
> new one from the owner, or a session minted with the service role; never write it into a file in
> the repo.
| `staffrow.mjs` | 26 (hotel) · 16 (restaurant) | Staff rows at 1920/1440/1194/834/412, dark and paper, on a hotel (`manoooo`) and a restaurant with Staff enabled (`Tanvi's` — `Demo Restaurant` has no Staff module and redirects to /dashboard): avatar, name and buttons centred on one line; the chips under the name, 28px, one ink colour, inside the row; at most two lines at 412; buttons 40×40 with a mouse, 44 on touch, both square on a phone; no sideways scroll. Reads only. |
| `rails.mjs` | 51 (hotel) · 19 (Demo Restaurant) | every `Rail` at 1920/1440/1194/834/412, dark and paper — Rooms by state (hotel/resort), Order line, Categories, Goes well with (taps "One more Appam with stew" on screen only; nothing is sent): an arrow exactly when something is past the edge, 40×40 with a mouse and 44×44 on touch, centred on the items, opacity .8; taps until the end show everything with the last item clear of the arrow, which turns to "Back to the start"; one more tap returns to 0. Order line cards: one height, meta on one line, chip inside, `data-steps` matching the state, ready ones washed green. Reads only. |
| `kpr.mjs` | 9 | the order page's kitchen printers at 1920/1440/1194/834/412, dark and paper, hotel and restaurant: as many printers as tickets (`[data-unit]`), each slot's left/right equal to its paper's, the paper tucked 4px under its machine, no torn tops, the machine painted above the paper (hit-tested only where the machine is clear of the floating top bar and the bottom nav), one column on a phone and two from `sm`, no sideways scroll; the two-ticket case takes one line of the order off its KOT for the run (an UPDATE of `kot_id` only, which no trigger watches) and **puts it back**; the kitchen board's tickets all torn, no machine. |
| `clock.mjs` | 26 | the Control room's analog clock at 1920/1440/1194/834/412, dark and paper, hotel and restaurant, plus reduced motion at 412 and 1440: 64px on a phone and 76 from `md`; 12 hour bars and 48 dots; each hand's computed angle against the time in India (hour ±1°, minute ±1.5°, second ±12°) and the `aria-label` time; the second hand moves 6–18° in two seconds — **also under `prefers-reduced-motion`**, where a CSS-animated hand would stand still; the weekday and date beside it, clear of the property name; face and ring different colours; no sideways scroll. Reads only. Its date regex lives in plain Node code — single backslashes, not the doubled ones a page-side template string needs. |
| `deck.mjs` | 23 | the frame scroller at 1194/1180/834 with touch (and 1440 mouse, 412 phone unchanged), dark and paper, hotel (Tomorrow, Rooms dialog) and restaurant (Reports, Menu → Add-ons): the frame scrolls with overscroll none and the page is the screen's height; at the bottom the card ends 12px above the edge and `window.scrollY` stays 0; top bar and rail stay stuck; a sidebar tap opens the next page at 0; back lands where you were; pull to refresh at the top only; a dialog freezes the frame and closing frees it at the same place. **On an iPad-size touch screen a probe must scroll `body .deck`, not the window** — `window.scrollTo` does nothing there; `scrollIntoView` still works. |
| `hk.mjs` | 31 | Housekeeping's wide room card at 1920/1440/1194/834/820 (and the phone card at 412), dark and paper, every floor open, with rooms 102 → inspected and 106 → pickup for the run (`condition` and `condition_at` only; **puts them back**): 4 columns at 1920, 3 below; every card one height; the actions as small pills in one row, 30px to the eye, and a press 5px above, 5px below and 1px beside each still lands on it (a 44px target); every pill's word inside its pill (measured on the text node — the `::before` widens `scrollWidth`) and inside the card; at most one filled pill; icons only on ≥15rem cards; the condition pills distinct; no sideways scroll. `dock.mjs` covers only the phone card (390, 600). |
| `joinqr.mjs` | 15 | Pulse's Join by QR card at 1920/1440/1194/834/412, dark and paper, on a listed property (`manoooo`; `Demo Restaurant` is not listed and shows the off state): a loaded 148px PNG code on white for the queue link; nothing past the card, no sideways scroll; Print poster (with `window.open` stubbed) writes a sign holding the code image, the property name and "Join the queue". |
| `till.mjs` | 16 | the till scrolled 700px at 1920/1440/1194/1180 (and 834/412 unpinned), paper and dark, hotel and restaurant: the ticket rail starts 12px under the top bar, its Dine in button answers a tap there, Send to kitchen stays on screen; the title-and-search row stays under the bar and the category chips never behind it; no sideways scroll. **`design-test.mjs` has 6 stale checks** (the invoices month strip, row pane and phone sheet from before 1bdcb74; the till "plus has not moved", which Goes well with now moves) — they fail with and without the sticky change. |
| `note.mjs` | 16 | the till's Cooking request at 1440/1194/834/412 (phone via Review), paper and dark: the dialog opens on screen with the note focused, 8 quick chips, 200 max; chips add ("No onion · Jain") and take away; Done closes it and the chip shows the note; Clear empties it. Nothing is sent. |
| `invdlg.mjs` | 20 | Invoices at 1920/1440/1180/834/412, paper and dark: a tap on an invoice row (`tr[aria-label^="Open INV"]` — **not** `tbody tr`, the month chart has a hidden table first) opens the pane from 1280 and a dialog below, for that invoice; the headline matches the Total line; charge lines present; Open invoice and Print are real buttons ≥44px on touch; nothing past the edge; the dialog on screen. |
| `speed.mjs` | 20 | Reports (30 days) at 1920/1440/1194/834/412, paper and dark, on `manoooo` (`Tanvi's` has no tickets and shows the sentence; `Demo Restaurant` no longer exists): Speed of service's three tiles one height with every label and figure whole; the chart beside them only on a ≥52rem card, otherwise under them at full width; On target has its bar; nothing past the card; the four Rooms tiles whole. |
| `sweep.mjs` | every page × press | **The whole app, with writes blocked.** Every in-app route (41 on the hotel incl. one order, bill, invoice and stay page; 37 on a resort and a restaurant) at 1920/1440/1194/834/412: uncaught errors, 5xx / 404 documents, sideways scroll. Then at 1194 and 412 with touch, every visible button, tab, radio and summary in `main` is pressed (the Master banner skipped — its form submit reloads the page) and every in-app link fetched: a press that throws, a dialog that does not fit or will not close (Escape, then its close button), an error page. **Writes are blocked in the browser**: CDP `Fetch` fails every non-GET request except auth, and every `/api/` request (the OTA sync is a GET that writes); `confirm` returns false; print/open/alert do nothing. `snap.cjs` fingerprints 20 tables before and after — unchanged. `MODE=load|click|all`, `ROUTES=/a,/b` (set `MSYS_NO_PATHCONV=1` in Git Bash), `CW=` one width, `VERBOSE=1`. 2026-10-11: 279 loads clean; 1,615 presses / 192 dialogs → 5 issues (two shares, the clipboard, two file inputs), fixed; re-run clean. |
| `att.mjs` | 21 | attendance in the app, on `manoooo` (server on 3142, built): Settings → Attendance shows 4 ways with switches for the owner; turning on fingerprint + selfie, "Use this device's location" (CDP `Browser.grantPermissions` + `Emulation.setGeolocationOverride`) and 100 m saves through `set_attendance_settings`; fits at 1920/1194/834/412 with no button under 40px (a switch counts its 7px `::before`); Labour *Mark present* writes `method_in = manual` through `labour_mark` and *Mark absent* removes it; every card has a 44px punch link whose sheet holds the QR and `/attend/<token>`; Manual off hides the buttons **and** `labour_mark` refuses; `/attend/<token>` opens with no session (here: the no-service-key message); Staff → *Attendance today* Present / Undo through `staff_mark`, fits at 4 widths; `/scan?code=df:staff:<code>` punches IN by QR. **Restores the settings and deletes every attendance row and punch it made** (direct SQL via `packages/db/.env`, since the API refuses those deletes). Without a service key it cannot run a fingerprint or selfie punch end to end — with one, add a `WebAuthn.addVirtualAuthenticator` (ctap2, internal, `isUserVerified`) on `localhost` and `DOM.setFileInputFiles` after `Page.fileChooserOpened`. |
| `wa.mjs` | 5 | the fingerprint ceremony exactly as `lib/attendance.ts` runs it, with no database: a tiny server on `localhost:3177` using `@simplewebauthn/server` with the same options, the browser bundle, and Chrome's virtual platform authenticator — registration verifies; the public key stored as base64url text and read back verifies an assertion; a second punch verifies with a rising counter; a replayed assertion is refused; the haversine distance (0.045° = 5004 m). |
| `dry87.cjs` | 33 | migration 0087 inside a rolled-back transaction (`as(uid, …)` sets JWT claims + `set local role authenticated` in a savepoint): direct order/line cancel and bill void refused for an owner; a kitchen bump still direct; `cancel_line` needs a reason, a housekeeping login may cancel a pending dish but not one the kitchen started; `cancel_order` role + reason, exactly one audit row; `generate_bill` with a discount → `discount.give`; `void_bill` role/reason/unpaid-only, order reopened, `bill.void` row; `cash_move` role, `shift_expected.cash_drawer = cash + in − out`, `shift_close` variance against it and its summary; `close_day` on a synthetic bill paid 400 cash + 600 UPI → 1000 (was 2000); `menu.price`, `settings.change` (changed keys only), `staff.access` rows; RLS (owner reads, housekeeping 0; insert and delete refused); `menu_engineering` (classes, plate-cost arithmetic), `exceptions_summary`, `day_compare` shapes; a low role refused the margin RPC. |
| `newmenu.mjs` | 36 (hotel) · 29 (restaurant) | the New menu in the browser (server on 3142, built): the sidebar group and the More sheet; Intelligence (4 tiles, briefing lines, a row per active dish, the Dog chip filters), Cash & controls (a ₹120 "Petty expense" cash out through the form, shown in the list and the tile), an order built by SQL: a dish cancelled through the `ReasonDialog` (5 chips, confirm off until a reason), then the whole order; a bill raised and voided with "Wrong table" — the order open again; the Audit trail (today) holding cash.out, line.cancel, order.cancel, bill.void, the Orders chip, the search; every screen at 1920/1440/1194/834/412 with no sideways scroll, nothing past a card and no button under 40px on touch; the scoreboard 4 across (2 × 2 under 900) with one cell height and the period control full width under 640; the audit filter bar one row from 1024 (three under, search and period full width on a phone) with the six kinds on one line. **Deletes the probe's orders, lines, bill, cash movement and audit rows in `finally`** (direct SQL — the API refuses those deletes by design). |
| `dry88.cjs` | 5 | 0088 rolled back: `dine_storefront` carries `image_url`, the rest of the payload unchanged, the `menu` bucket's limits, its four policies, anon still executes the storefront. |
| `photos.mjs` | 14 | dish photos on `manoooo` (server on 3142): a card's photo strip opens the sheet, Wikimedia photos load (≥3) and a tap saves one with its credit and source; the new-dish form picks the Masala dosa photo by itself as the name is typed, the picker fits at 834/412 (4 square photos a row) and closing saves nothing; *Find photos* fills the dishes without one; each card carries a 64–72px square photo (or its dashed placeholder) beside the name, cards in a row one height, at 1920/1194/834/412, none broken; the storefront at 412 shows the photos with no sideways scroll. **Restores every dish's photo fields as found.** Needs the internet (Wikipedia/Commons). |
| `cam.mjs` | 7 | *Take a photo* on a dish (Chrome with `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`, `Browser.grantPermissions videoCapture`): at 1440 the live preview opens with frames, *Capture* uploads to the `menu` bucket and saves it, the preview closes; at 412 a **real tap** (`Input.dispatchTouchEvent` — a `Runtime.evaluate` click opens no chooser) opens the `capture="environment"` input, the file is shrunk to WebP and saved; the two buttons share a row at 44px. **Restores the dish's photo and deletes the test uploads through the Storage API.** Make sure no older `next start` holds 3142 — a stale one answered a whole run once. |
| `tillnew.mjs` | 13 | the till for order takers on `manoooo` with photos borrowed through *Find photos* (restored after): dishes are 64px rows (tallest ≤ 84px, photos 40px — was 286px), 10 on a 1440 screen, "/" focuses the search, "cb" puts Chicken biryani first and **Enter** adds it and clears the box, "but" finds both butters, Popular shows ≤ 12, Request opens a sheet whose chips toggle ("Less spicy · Jain" → "Jain") and Done leaves the line ≤ 120px with the request under the name, Ctrl+Enter sends (a dine-in with no table asks for one), 1920/1194/834/412 no sideways scroll. **Places no order.** Read the ticket from the aside that says *Order details* — the first `aside` is the sidebar. |
| `pwa.mjs` | 11 | installing: Chrome's own `Page.getInstallabilityErrors` empty on `/get` and `/dashboard`, the manifest and the apple-* tags in `<head>`, the service worker `active` (Chrome's `ServiceWorker.workerErrorReported` is how the CacheStorage failure was found); the manifest's id, standalone, 4 shortcuts and maskable icon; the sidebar's Install entry → `/get`; `/get` with the browser's offer swallowed (as real Safari) under an Android, iPhone, iPad (MacIntel + touch) and Windows Edge user agent shows that device's steps and never "Not published yet"; with the offer, Android and Windows get the one-tap button; the More sheet's Install entry ≥44px. |
| `install-probe.mjs` | 54 | installing, on every kind of device (server on 3143, built; signs in with a throwaway Try-Demo restaurant and deletes it after). (1) Chrome's own verdict: `Page.getInstallabilityErrors` and the manifest's errors empty on `/get` and `/login`; a description for restaurants and hotels, 3 wide + 3 narrow screenshots each loading at its declared size, `related_applications`; the `<head>` catcher. (2) `/get` under 19 user agents with the browser's offer swallowed: iPhone Safari, Chrome, Edge and Firefox (the drawn steps, the first screen per browser), Chrome on iOS 16.1 (→ Safari), inside Instagram on an iPhone (→ Open in Safari + Copy), an iPad that says Macintosh with 5 touch points, Mac Safari (Add to Dock) and Firefox, Windows Edge and Chrome (their menus) and Firefox (`microsoft-edge:` + the address), Android Chrome, Samsung Internet and Firefox, inside Instagram (`; wv)`) and UC (`intent://…package=com.android.chrome…browser_fallback_url…`), Linux Firefox, a Chromebook — each with nothing sideways and 44px targets; then every ringed target and its label inside the drawing, 4 steps × Safari, Chrome, Edge, iPad (the `animate-ping` ring is left out — it grows to twice its size on purpose — and the step is read by `[data-step-screen="n"]`, not the first one, which may be the one leaving). (3) Headless Chrome's real offer → the one big button at 1440 and 412; pressed, with a stand-in answering *accepted* → the browser's prompt ran once, "Installed on this phone", `df-app`; a later tab says so, *Install it again* → the menu; a fresh offer clears the note; `navigator.standalone` → "You're in the app". (4) The sign-in row: Android 48px (no offer → the sheet; with the offer → one tap, no sheet), iPhone, PC. (5) The top bar's button on an iPhone (the drawn steps, nothing covering them), the sidebar on Mac Safari (the sheet in place) and on Windows Chrome with the offer (one click, no sheet), Settings. (6) `/get` dark and paper at 1920/1440/1194/834/412 — 1440, 1194 and 834 with the offer swallowed (Edge before its offer; an iPad's Safari never offers, though headless Chrome does under any user agent). `/get` hands out `NEXT_PUBLIC_CLOUD_URL` when `.env.local` sets it (it does), so the Edge/Chrome links are checked against that, not 127.0.0.1. Run one part: `node install-probe.mjs manifest|get|oneTap|signin|app|widths`. |
| `manifest-shots.mjs` | — | retakes the manifest's six screenshots into `apps/web/public/screenshots/` (server on 3143): two Try-Demo properties (a restaurant and a resort), dark theme, 1440×900 and 412×915 at 2×, the till with a few dishes picked; `dropdemos.cjs` deletes both after (it refuses anything that is not a demo sandbox). **Rebuild after** — `next start` serves only the `public/` files that were there at build time. Look at every image before keeping it: they are public. |
| `perfx.mjs` | — | how fast it answers a person, on a throwaway Try-Demo property (`dropdemos.cjs` deletes it — and never empty `demo_ids.txt` before that reports 0 left): `nav` (a menu tap → the new screen, first visit and again, plus *fully on screen*: the page card at opacity ≥ .95 and in place), `taps` (the browser's Event Timing — INP — for buttons that only change the screen), `actions` (Send to kitchen → the order's screen, with every page and action request), `idle` (long tasks while a live screen sits 20 s), `load` (server time, FCP, JS per screen). `node perfx.mjs <parts> restaurant|resort laptop|phone [base]`; `HOVER=150` (the mouse rests before the click) and `TAPMS=90` (a finger is down) for human timing; `NOINTENT=1` turns IntentPrefetch off (the page sees Save-Data) for an A/B on one build; works against the live site too. Scroll with `behavior: 'instant'` — the app scrolls smoothly, and a rectangle read straight after `scrollIntoView` is still the old one. |
| `actcheck.mjs` | 5 | the buttons that lost `router.refresh()`: an order from the till, a dish cancelled (the order's realtime listener may add one refresh), Generate bill and Mark paid (cash), a ₹10 cash move in Controls (use the *visible* form — Controls renders one per layout) — each screen changes from the action's answer with one action request and no page request. |
| `motioncheck.mjs` | 10 | every screen reached by a tap ends fully drawn — opacity 1, no transform, nothing faded or blurred, nothing sideways — restaurant (dark) and resort (paper) at 1920 / 1440 / 1194 / 834 / 412, screenshots. |
| `dry102.cjs` | 5 | 0102 rolled back: every property's `table_pulse_for` and each owner's `table_pulse()` identical before and after (one transaction, one `now()`), faster, the helpers out of anon/authenticated reach. |
| `pgstat2.cjs` · `pgsnap.cjs` · `fntime.cjs` | — | the database's own view: time per app function since the stats were reset; a before/after diff around one run (shared with production traffic); the heavy functions timed as an owner inside a rolled-back transaction (subtract the ~27 ms round trip from India). |
| `ttfb.mjs` · `par.mjs` · `onepage.mjs` · `cpuprof.mjs` | — | server time of whole pages one at a time and N at once (the cold-start test); every request one page load makes; a CPU profile of one cached tap on a 4× phone (`callers.cjs` names who called a native function — that is how the sidebar's forced layout was found). |

Every suite is checked at **1920, 1440, 1194 (iPad landscape), 834 (iPad portrait) and 412 (phone)**,
and asserts **0 touch targets under 44px** on the touch widths — WCAG 2.5.5 and Apple HIG. An inline
text link is exempt from the width rule but not the height rule.

## Rules for the suites themselves

- **A test that touches data puts it back.** `guests-test.mjs` prints
  `put back: "…" restored to how it was found`. Match that.
- **A failing assertion is as likely to be the test as the code.** Assertions that have been wrong
  here: CSS-uppercased labels compared against source case; `blur()` without focus; `innerText` on
  a `<tr>` joining cells with tabs; `aside.sticky` matching the nav sidebar; vertical centring read
  as wrapping; scrolled-away chips counted as "cut off"; `\d` collapsing to `d` inside a JS template
  literal; a backtick inside a template literal ending it early. **Check the probe before
  "fixing" the screen.**
- **Content inside a horizontal scroller is not page spill.** Walk up the ancestors for
  `overflow-x: auto | scroll | hidden` before reporting an overflow.
- **A stagger animation on 42 nodes is a real cost on a tablet.** Fade the block.
- **Time-dependent suites rot.** Demo invoices age out of a 30-day window; pin the window
  (`?days=365`) rather than widening the screen's default.
- **Flakes happen** — the dialog audit has printed 29 once and 35 another time. Report that
  honestly as a flake and re-run; do not record a pass you did not see.

## What *is* in the repo

`scripts/` holds `migrate.mjs` (apply migrations), `check-live.mjs` (what a stranger's phone sees at
your public address), `print-bridge.mjs`, `box-agent.mjs`, `flow.mjs`, `pulse.mjs`, `run.mjs`,
`set-app-url.mjs`.

**`scripts/verify.mjs` does not run on this machine.** It carries absolute paths from another
environment (`/tmp/node_modules/...`, `/home/claude/dineflow/supabase/migrations`). It replays every
migration into an in-memory PGlite instance, which is a genuinely useful check — but it needs its
paths fixed first. Do not cite it as a passing gate until it does.

## Two sessions on one machine — measured 2026-10-07/08

Two Claude sessions worked the same request at once without knowing it, and four kinds of shared
state turned good code into failing numbers. Run `ListAgents` before you measure or build; if a
peer is busy, message it and agree who owns which files and who runs the build.

- **`apps/web/.next` has one owner.** A `next build` and a `next dev` writing it at once gave
  `ENOENT …_buildManifest.js.tmp.*` in the dev log, `PageNotFoundError: Cannot find module for
  page` during *Collecting page data*, and a 15-minute build with no `BUILD_ID`. The same tree,
  same command, alone: green in 1m04s. Take the dev server down before anyone builds — and
  remember `Start-DineFlow.bat → launcher.mjs local` builds too, so the owner can be the third
  writer.
- **The master account's acting-as state is shared.** `admin_act_as` / `admin_stop_acting` from
  either session stomps the other, and a suite then measures `/admin` and reports nonsense —
  "gauge false", "no toolbar", `0 passed · 0 failed`. Re-assert `admin_act_as` immediately
  before every `Page.navigate`.
- **Port 3141 is shared.** Five Chrome suites against one dev server produced
  `8 passed · 2 failed`; the same suite alone passed 21/21. Run suites one at a time when a
  number looks wrong.
- **A build is verified by its artefacts, not a piped exit code.** `tail` reports its own
  status, not turbo's. Read `apps/web/.next/BUILD_ID` plus `prerender-manifest.json` and
  `routes-manifest.json`, and only trust them if nothing has started a dev server since — a
  dev start rewrites `.next` and removes `BUILD_ID`.
- **Commit by explicit path**, never `git add -A`, while a peer has uncommitted work in the
  tree; check `git diff --stat HEAD` for files you did not touch first.

## Devices and properties

Test data lives in five properties: `Mass` (hotel), `Tan Resort` (resort), `manoooo` (hotel),
`Tanvi's` (**restaurant**), `Jeevi's` (resort). **Check both a resort and a restaurant** — the tile
counts, the modules and the flip tiles all differ, and a bug that only exists for one kind of
property is easy to ship.

## Before you say it is done

1. Four gates green.
2. The suites that touch your section, with their numbers in the message.
3. Screenshots at 1440 and 412, **in both themes** if you changed anything visual.
4. Your own assertion checked against what the screen actually does.

## See also

[data-and-rls.md](data-and-rls.md) · [design-system.md](design-system.md) · [README.md](README.md)

## Audit of 2026-10-10 — every screen, every width

- **Sweep:** 1,127 page loads (hotel, resort, restaurant × dark at 412/834/1194/1440/1920 + paper at
  412/1440, ~55 routes each). **0 page errors, 0 console errors, 0 failed requests** (the only 404s
  were the parallel-acting race above). Fixed: 44px targets for card-title and dashboard "All →",
  legal links (footers and `/legal/*`), Reports range, Tax tabs, Leak-finder and order-track back links,
  order/invoice back buttons (were shrinking to 23–29px), Night audit (back, date stepper, room rows,
  "Open housekeeping"), queue party chips, kitchen-board close; invoice "Reverse charge" line and the
  Channels webhook example now wrap; Proof "Seal new months" no longer clipped. Known false positives
  left: the kitchen board overlay "overlapping" the page under it, and pinned bars (Settings Save,
  till cart) "overlapping" what scrolls beneath them.
- **Speed (production build, after `FirstPaint`):** laptop — worst warm LCP 504 ms, worst cold 720 ms,
  CLS 0. Phone (4× CPU, 4G) — worst warm LCP 760 ms, cold under 1 s on every screen but sign-in for a
  signed-in master (1.24 s: it is a redirect to /admin), CLS ≤ 0.005. Before: phone warm up to 1.2 s
  (5.5 s on one outlier), cold up to 1.97 s.

## Whole-app design review — 2026-10-12

`shots.mjs` (every in-app route × 1440/834/412, full-page JPEG into `review/<property>-<theme>/`, with
`side` / `past` / `small` / `cut` per page) and a look at all 123 pictures. Everything was consistent
except three things, fixed and checked by `reviewfix.mjs` (4): empty report charts, the order line's
cancel target, the pantry's stock figure on a phone — measured with a Range over the text, because
the figure's block box is as wide as the name cell and that cell runs under the scrolled-off actions.
A look at the 834 pictures found a fourth: Menu's five toolbar actions (~730px) were wider than the
682px column, so the chip rail collapsed and *New dish* ran off the page. `tb.mjs` (12) measures the
Menu toolbar at 834 / 1024 / 1183 / 1184 / 1194 / 1280 / 1363 / 1366 / 1440 / 1920 / 412 — stacked
under the rail in the two ranges, one row beside ≥300px of rail outside them, never a button past
the column — and that Pantry's two actions keep their row beside the tab rail at 834.
Two more the owner marked afterwards, checked by `tmr.mjs` (11): Tomorrow's adjust block at 1440 /
1194 / 834 / 412 — four moods in one control the width of the card (36px, 44 on touch), the lit
mood matching the count, a 44px slider filled to `--pct`, no label cut, nothing past the column;
Busy → ×1.25 and Reset shown, the slider between moods lights none, Reset puts it back — and
Reports' KPI row flat at 1440 / 834 / 412 (one height per grid row, ≤136px, band 0px, no figure
cut) while Pantry's mixed row keeps its band.
Then `pm.mjs` (7): Pulse at 1920 / 1440 / 1194 / 834 / 412 — three tiles in one row inside the card
and ≥8px apart, *Frees next* under them, the two cards side by side with ≤60px under the quote form
(21px; it was a 600px tile column beside a half-empty card), no sideways scroll — and Menu opened
in a fresh session finds photos by itself (0 → 22 of 28 for manoooo; **kept**, that is the fix),
the other dishes drawing an outline glyph, none the old dashed box.
Then `ph.mjs` (12), from the owner's iPhone screenshots: at 375 / 412 / 834 — Audit's four
periods on one line at one height, none wrapped; Cash reasons in an even 2-column grid, 44px, none
cut, a tap ticks one and leaves the free-text box empty; the till's cart bar absent on an empty
ticket and, with a dish, ≥6px above the tab bar (12px) with the assistant button ≥6px above it.
`more.mjs` (10): at 375×667 and 412×915, More opened from /audit, /controls, /settings and /reports
shows that section in view (within 15px of the sheet's middle, or as far as the list can scroll); a
section high in the list (Kitchen) is in view too — on a short phone that means a 257px scroll, not
the top, which the first version of the probe wrongly expected.
**Speed and scale — 2026-10-12.** `perf.mjs` times every in-app route twice (server TTFB and ready)
on the production build; `dq.mjs` times each Control room request alone. Before: Control room ~490 ms
(one request, the last six paid bills, ~450 ms — RLS called `auth_restaurant_id()` per row). After
0089–0091: Control room ~200 ms, every other screen 80–230 ms. `MSYS_NO_PATHCONV=1` is needed to pass
`ROUTES=/a,/b` from Git Bash, or it rewrites them into Windows paths. `mc.mjs` (6) — Master control
round trips; poll with a 1.5 s timeout per question, as a page being replaced never answers.
**Pantry from the kitchen — 2026-10-12.** `dry92.cjs` (14): as manoooo's owner in a rolled-back
transaction, a dish ×2 sent to the kitchen draws exactly −2× its recipe; start → ready → served draws
nothing more; cancelled while pending (through `cancel_line`) is credited back to net 0; cancelled after
Start cooking keeps its consumption; 'cook' mode draws only on Start and once; a property switched
cook → ticket mid-service still draws its pending lines; a line sent then billed draws once; a made-up
mode is refused (23514, inside a savepoint — a refused statement poisons the transaction otherwise);
Tomorrow lists an ingredient pushed under its reorder level with `why = reorder` and
`buy = need + 2×level − shelf`; every line says why; the migration is idempotent. `stk.mjs` (10): Menu →
Recipes shows "25 of 28 dishes move the pantry" with 28 rows (25 mapped, 2 the library knows, 1 by
hand); a mapped dish prints its plate in cook's units; one press sets the 2 up (27 in the database, 10
ingredients added — all put back); no sideways scroll at 412; Settings → Kitchen shows the switch with
the saved value, choosing *Start cooking* writes `stock_draw = cook`; Tomorrow tags "Tender coconut"
*below reorder level · reorder at 405.36 · 608.04 pcs* at 1440 and fits 412; the Pantry strip names it
and says the 10 level-less ones are not on the list; *Draft a purchase order* opens the Orders tab.
Restores the reorder level, the mode, the 41 recipe lines and removes the 10 added ingredients.
`apps/web/lib/recipes.test.ts` (7) is in `pnpm test` — 66 now.
`cb.mjs`: every checkbox and radio on 12 screens at 412 (touch) and 1440 — 24×24 and 22×22, the mark
drawn when checked (`::after` width > 0). It pushes one ingredient under its reorder level so
Tomorrow has a row, and puts it back. Before the fix: Tomorrow's box 8×24, Booking page 8×24,
Settings' radios 13×13 native.

## The self-test console — Master control → Testing (2026-10-12)

The app now tests itself from inside: `/admin/testing` runs seven suites and keeps every run in
`selftest_runs` (0093/0094). What each checks is in [admin-and-membership.md](admin-and-membership.md);
the budgets are the trade's — server answer under 600 ms good / over 1.5 s failing (Lighthouse's lab
TTFB figure), the header set a scanner such as securityheaders.com grades, anonymous reads of every
tenant table must be empty, signed-out visits must be sent to sign in. It is a monitor, not a
replacement for the gates and the probes here: it runs read-only checks against the live system, and
the browser suite reads what a frame shows (crash card, sideways scroll, missing image, unnamed
visible button, a link that errors) — it does not press buttons.

- `dry93.cjs` (10) — selftest_db's report; selftest_functions' 19 calls for manoooo with no failure
  and the master's acting context put back (none → none, and a set context → the same property); an
  owner refused by both (`42501 master only`; roll back to a savepoint before `reset role`, or the
  reset's own "transaction is aborted" error hides the refusal); the results table visible to the
  master and empty for an owner; anon cannot execute; idempotent.
- `tst.mjs` (10) — the Testing tab; the page with 7 suites, Run all and 7 Run buttons; one suite alone;
  Run all outside a property: every suite answers in 12–16 s, "89 passed · 5 warnings · 0 failed · 2
  skipped" (the warnings: 14 orders open over 24 h in the sample data, three server keys unset
  locally, legal facts). A closed menu's items keep their boxes while `visibility: hidden`, so the
  browser suite judges a button by `checkVisibility()` and names it by `textContent` — `innerText`
  is empty for a hidden element and three named items read as unnamed until that was fixed;
  8 runs kept; inside manoooo, Screens & buttons loads 14 property screens at 412 and 1280 (29 checks,
  none failing) and Speed times them (17 checks); the phone layout. It removes the runs it wrote.
  Wait on a single suite's own Run button, not Run all — the first version read the previous run. The `small` count flags `role=switch` (31px with a
7px `::before`) and the housekeeping pills (30px with a 44px hit area) — not real; `past` on
`/kitchen/board` is its own fixed overlay.

## Speed — 2026-10-13

The owner: "if loading is slow, make it fast; fix lag and hanging; a button or link should open in a fraction
of a second." Measured first, on the live site and on a local production build (phone = 4× slower CPU, 9 Mbps,
+60 ms), with the probes above.

- **Live, before:** one request at a time every screen answered in 110–290 ms (functions are in `bom1`, beside
  the database), but the first request after a quiet spell took 0.76 s and **six at once took 0.65–1.2 s**; one
  Reports load took 6.3 s — cold starts, a new instance for each request that arrives while another runs. A menu
  tap's first visit: laptop median 579 ms (Billing 1.2 s), phone 580 ms. Buttons that only change the screen:
  24–56 ms. Live screens left open: no long tasks.
- **Fixed:** Fluid compute (`vercel.json`, from the next deploy); IntentPrefetch; the offline warm-up at most
  every 30 minutes; the sidebar's forced layout on phones; 160 ms entrances without animated blur; no second
  render after eight revalidating actions; the pulse's history read once (0102). See shell-and-nav.md,
  design-system.md and data-and-rls.md.
- **After, local build (same machine, same database):** laptop menu tap, first visit click → screen median
  **160 ms** (p90 282; 443 / 1,540 with IntentPrefetch off), **fully on screen 204 ms** (was 456), a revisit
  116 ms (was 391); phone first visit **420 ms** (561 off), fully on screen 502 ms (was 636), revisit 295 ms
  (was 484). Buttons: median 40 ms on a laptop, 104–144 ms on the phone; the More sheet 176–336 ms on the
  throttled phone, the same on the old live build (296 ms) — its blur was tested and is not the cost.
  Generate bill, Mark paid, a cash move: one request each where there were two. `actcheck.mjs` 5/5,
  `motioncheck.mjs` 10/10, `install-probe.mjs` 54/54, 82/82 unit tests.
- **Still open:** Fluid compute is measured only after a deploy; the database is on Supabase's Micro compute
  (shared CPU — the same call 5 ms in one run and 52 ms in the next); every server action that revalidates still
  re-renders the page it was pressed on (Start cooking's request takes ~800 ms locally behind its optimistic
  screen); a realtime refresh can follow a change the page already shows.
