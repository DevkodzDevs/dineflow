# Testing and the gates

> Nothing is "done" because it looks done. It is done when something measured says so.

## The gates — all four, every time

```
pnpm lint          # 0 errors (14 warnings are known and pre-existing)
pnpm typecheck     # clean
pnpm test          # 59 unit tests: lib/offline/outbox.test.ts (8) + lib/options.test.ts (7) + lib/security.test.ts (5) + lib/rates.test.ts (5) + lib/print/route.test.ts (4) + lib/dishPhotos.test.ts (8) + lib/tillSearch.test.ts (4) + lib/wa.test.ts (4) + lib/roomsuggest.test.ts (4) + lib/marketing.test.ts (4) + lib/bar.test.ts (3) + lib/schemaorg.test.ts (3)
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
| `walls.cjs` | 27 | database security (0084): as a low-role login and as an owner, through `set local role authenticated` + JWT claims in a transaction that is always rolled back — self-promotion, UPI change, free membership, deleting payments/invoices/the property, writing invites, editing bill or invoice totals, low role changing GSTIN, anon calling `box_apply`/`box_export`/`demo_user`/`seed_storefront`, reading `v_low_stock` — all refused; and what the app does (owner Settings/Tax, staff Neighbours, invoice bill-to, `create_invite`, `staff_login_domain`, `network_demand`, `forecast_day`, `session_bundle`, staff list) still works. `DRY=1` applies the migration inside each transaction first. |
| `t0085.cjs` | 7 | a box token cannot rewrite another property's menu item but still updates its own; anon and signed-in cannot call the OTA functions, the service role can; one `pay_…` ref cannot settle two bills, cash refs may repeat. |
| `testorder.mjs` | 3 | Channels → Send test order reaches this server's own webhook and records one order; **removes it**. |
| `perf.mjs` / `perf2.mjs` | 26 screens | load speed, laptop and phone (4× CPU, 9 Mbps, 60 ms): server time, DCL, LCP warm and cold, CLS, JS kB; `perf2` also prints FCP and the LCP element — **check that element**: once it was the error screen ("Nothing you entered has been lost"), which reads as a slow page. |
| `five.mjs` | 15 | four phone layouts at 412/834/1440, dark and paper: Neighbours' tabs an even 2×2 ≥44px (chips in one row above); the OTA card checks are superseded by `otalist.mjs` (the cards became a list); Reports' speed tiles equal height with one-line labels; Tax → Returns' stepper bar with the month centred, CSV full width under it, the card-title note under its title, no table for an empty month. Reads only. |
| `otalist.mjs` | 35 | Channels → OTA channels at 1920/1440/1194/834/412, dark and paper: one column, every row the list's full width and stacked; the count matches the rows; the actions on one row, trailing at 1194 and up and under the row below; nothing past a row's edge; initials tinted; Sync now · Add OTA on one row (an even pair on a phone); every button icon 14px; Edit/Remove 40×40 with a mouse, 44×44 on touch. Reads only. |
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
the other dishes drawing an outline glyph, none the old dashed box. The `small` count flags `role=switch` (31px with a
7px `::before`) and the housekeeping pills (30px with a 44px hit area) — not real; `past` on
`/kitchen/board` is its own fixed overlay.
