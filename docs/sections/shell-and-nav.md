# The shell — layout, nav and module gating

**Files** `app/(app)/layout.tsx` · `components/shell/Nav.tsx` · `TopBar.tsx` · `PageHeader.tsx` ·
`MasterBanner.tsx` · `packages/shared/src/constants.ts`
**Also** `components/ui/Theme.tsx` · `components/assist/**` · `components/ErrorRecovery.tsx` ·
`components/ServiceWorker.tsx`

## What it is

Everything around the page: the sidebar, the search bar, the theme switch, the bell, the Assist
panel, the master banner, and the rule that decides which screens a person can see at all.

## How it works

### Module gating — one function, four filters

```ts
modulesFor(type, role, enabled, allowed) =
    MODULES_BY_TYPE[type]          // does this kind of property have the screen?
  ∩ ROLE_ACCESS[role]              // may this role ever see it?
  ∩ (enabled ?? all) ∪ ALWAYS_ON   // has the master switched it on for this property?
  ∩ (allowed ?? ROLE_DEFAULT[role]) // did the owner leave the tick? (owner: everything)
                                    // dashboard is always granted
```

All four live in `packages/shared/src/constants.ts` so the web app and the mobile app agree. The
sidebar renders exactly what this returns.

`ROUTE_MODULE` in `app/(app)/layout.tsx` maps the first path segment to a module key and enforces
the same rule on the server, so a locked screen cannot be reached by typing its URL. A segment not
in that map is open to every signed-in person (e.g. `/membership`).

### There is deliberately no `loading.tsx`

Adding one next to `app/(app)/layout.tsx` makes **every screen in the app feel two and a half times
slower**, and it looks like an improvement while it does it.

React throttles how quickly a Suspense fallback may be replaced: once a skeleton has been shown it
stays for roughly 300 ms, so nobody sees it flash. That is right for a fallback that appears because
something is slow, and exactly wrong here, where it appears because something is fast. Measured,
moving between screens: **with the skeleton 331–348 ms; without it 74–131 ms** — the data was on the
device at ~110 ms and the screen did not change until ~330.

The tap is still acknowledged instantly: `<NavProgress>` in the root layout starts a bar on the
click itself, and the previous screen stays up rather than being replaced by a grey imitation of the
next one. **If one route is ever slow enough to need more, give that route its own `loading.tsx`.
Never give one to all of them.**

**The wait is taken before the click instead** (`IntentPrefetch.tsx`, mounted in `app/(app)/layout.tsx`,
2026-10-13). With no `loading.tsx`, Next's own link prefetch fetches nothing useful for these per-request
screens, so a first visit waited for the whole server render after the click. Now a finger touching a menu
link (`pointerdown`) or a mouse resting on one for 70 ms calls `router.prefetch(href)` — with the app
router's own cache that is a *full* prefetch — and the click takes the answer already in flight. Watched:
links inside `nav`, `aside` and the More sheet (`[data-more]`), and any link marked `data-prefetch`; never
other sites, downloads, `/api`, `/logout`, files, the page already showing, or a phone with Save-Data on.
Content lists are left out on purpose: a thumb dragging a list of order cards would fetch a screen per card.
Measured on one build (`perfx.mjs`, the switch is Save-Data): laptop with a 150 ms mouse rest, first visit
click → screen median **160 ms (p90 282) against 443 ms (p90 1,540)** without it; phone (4× CPU, 4G, a
90 ms tap) **420 against 561 ms**. A prefetched screen is reused for 30 s — `staleTimes.static` is 30 for
that reason (it was 180) — and any action that revalidates drops it.

### The sidebar at each width

| Width | Menu |
| --- | --- |
| < 768 | no sidebar; `BottomNav`: four sections and **More** (a `Sheet` with every section, the account, Master control and Sign out) |
| 768–1279 (every iPad, both orientations, and tablets) | a 76px **icon rail** with a **hamburger** on top |
| ≥ 1280 | the full 256px menu, always out; no hamburger |

The hamburger opens the whole menu as a **drawer over the page**: `Sidebar` holds `open`, the aside
gets `data-open`, and CSS (globals.css, "the sidebar" block) makes it `position: fixed` at its own
spot and 272px wide. `.nav-spacer` — the element right after the aside — keeps the rail's 76px in
the row so the page underneath does not move; `.nav-scrim` takes the click that closes it. It also
closes on Escape, on picking a screen (the `path` effect), and if the window grows past 1279.
Every link carries `title={label}`, so the rail's icons name themselves on hover.

**Settings and Help & support are the menu's last group** (owner, 2026-10-13 — the sidebar's foot had grown
to ~200px with Help, Install and Master control). The last `Group` holds Settings (when this person may open
it — it left *Manage*) and Help & support. It follows *Insights & control* directly and scrolls with the rest
of the menu (the owner asked for that over a first version that pinned it to the foot of the menu). **The sidebar's foot is now only *My attendance* (when on), *Master control* (admins, full
menu only — the collapsed rail hides it as it always did) and the account card: 68px, 112px with Master
control** (`navfoot.mjs`). Installing moved to the top bar's button, now at every width. Help & support is
not a module: no `ROUTE_MODULE` entry, no tick in Staff → Access. It is also a row in the More sheet's
account block on a phone (unchanged). While a reply from DineFlow is unread:
- the menu row has a red dot on its icon (all the rail shows) and a count beside the label (`NavItem.badge`);
- the More row says "N new", and the More button's count includes it.

It comes from `useSupportUnread(path)` — one `support_unread()` call shared by the sidebar and the tab bar, after the
screen is up. The error screen (`components/ErrorRecovery.tsx`) has a plain-link **Report this problem** →
`/help?kind=problem&from=<path>`. See [help-and-support.md](help-and-support.md).

**A hairline under every menu group but the last** (2026-10-13). `Group` renders `div.nav-group` (it was
`mb-5`). `.nav-group:not(:last-child)::after` is a 1px white-at-10% line with 12px above and 14px below,
inset 12px — 200px wide in the full menu. On the rail it is 36px wide (margin 8px), centred under the
icons. There the groups' titles are hidden, so the line is the only thing that shows where one group
ends. An empty group renders nothing, so `:last-child` is the last group actually shown. With Settings and
Help & support as their own last group: five lines for a hotel or resort, four for a restaurant. The sidebar is graphite in both themes, so the line is
white, not `--color-separator`. Probe: `navline.mjs`.

### Speed: where a screen change spends its time

Measured 2026-10-08. The live site's response headers read `X-Vercel-Id: bom1::iad1::…` — the edge
in Mumbai, **the server functions in Washington DC** (Vercel's default; nothing set a region). The
Supabase project answers this machine in India in ~60 ms (connect 14 ms), so it is in Mumbai. Every
screen therefore crossed the world once to reach the function and then 2–3 more times for its
queries (middleware `getClaims`, the `session_bundle` RPC, the page's own `Promise.all`), at roughly
a quarter of a second each: the 1–2 s "click and wait" people felt.

- **`apps/web/vercel.json` pins functions to `bom1`** — next to the database and the users. Do not
  remove it; if the database ever moves, move this with it.
- **`experimental.staleTimes: { dynamic: 30, static: 180 }`** in `next.config.ts` keeps a screen the
  browser rendered for 30 s, so going back to it is instant. Server actions revalidate the paths they
  change, which evicts those at once; live screens re-read through `useLive`.
- Measured on a production build served from India (a stand-in for `bom1`), tapping sidebar links:
  first visit median **134 ms** (103–222), revisit median **21 ms** (11–37). Probe: `navperf.mjs`.

**2026-10-13 — the live site, and what was left** (`perfx.mjs`, `ttfb.mjs`, `par.mjs`, `cpuprof.mjs`; the
numbers are in testing-and-gates.md):

- **The live stalls were cold starts.** One request at a time, every live screen answered in 110–290 ms; the
  first after a quiet spell took 0.76 s, and **six at once took 0.65–1.2 s** (one Reports load took 6.3 s) —
  each request a browser sends while another is running started a fresh instance. Both `vercel.json` files now
  set **`"fluid": true`** (Fluid compute: one warm instance serves many requests at once, and instances are
  kept warm longer). It takes effect on the next deploy; check Settings → Functions shows Fluid on.
- **The offline warm-up runs at most every 30 minutes per device** (`df-warmed` in localStorage,
  `lib/offline/OfflineProvider.tsx`). On every opening of the app it fetched up to eleven whole screens in the
  background, right when the person's own first taps were being sent.
- **The sidebar no longer measures itself on a phone.** `useKeepMenuInPlace` (Nav.tsx) read the active row's
  rectangle in a layout effect on every screen change — below 768px the sidebar is `display: none`, yet that
  read forced a layout of the whole new screen inside the commit, before it could paint: ~50 ms of every tab
  bar tap on a mid-range phone (CPU profile). On a phone it now returns at once (`matchMedia`, no layout); on
  a fresh load it still restores the menu before the first paint; between screens it checks the row after the
  new screen has painted.
- **Screens arrive in 160 ms, not ~370** (`pageV`, design-system.md): content was on screen ~120 ms after a
  laptop click but the page spring took it to ~450 ms before it stood still (~640 ms on a phone). Click →
  fully on screen, first visit: laptop **456 → 204 ms**, phone **636 → 502 ms**; a revisit **391 → 116 ms** and
  **484 → 295 ms**.
- **After a server action that revalidates, never call `router.refresh()`.** The action's own response
  carries the re-rendered page (Next re-renders the current route whenever an action revalidates), so the
  refresh rendered the same page a second time — Generate bill, Mark paid, Void, Fire, Move, Cancel a dish,
  a cash move and the night audit all did. `actcheck.mjs` shows each screen changing from the action's answer
  with no second page request. A screen that listens to realtime (an order, a bill) may still refresh once
  when the change arrives; that is the listener, not the button.
### Speed pass — 2026-10-18 (the owner: "no lag, no hang, every click in a fraction of a second")

Measured first (`perfx.mjs`, `ttfb.mjs`, the build's chunk manifest, `restlat.mjs`, `cookchk.mjs`), then fixed:

- **Supabase was back in every screen's first load.** `lib/supabase/lazy.ts` exists so the browser client (~235 kB)
  never sits in the signed-in shell — but the Help & support unread badge (`components/support/useUnread.ts`, in the
  menu on every screen) and `shots.ts` imported `lib/supabase/client` directly, and that put it back. Both go through
  `getClient()` now. **Shell JavaScript 944 → 692 kB.** Nothing imports `lib/supabase/client` except `lazy.ts` — keep
  it so (`grep -rn 'supabase/client"'` should find only lazy.ts).
- **Menu shipped the 220 kB recipe library** to show "a standard recipe is ready" — page.tsx now finds the plates for
  this property's dishes and sends only those (menu.md). **Menu's own JavaScript 234 → 76 kB.**
- **A live screen no longer refreshes over its own tap's answer** (`lib/liveRefresh.ts`, 3 tests). A write came back
  over realtime and the listener started a second whole render 400 ms later while the action's answer — which already
  carries the change — was still arriving. `calmRefresher` holds a refresh while one of the page's own server actions
  is in flight and for 1.2 s after (it counts them by the `next-action` header on `fetch`), coalesces bursts, and keeps
  refreshes `minGap` apart. `useLive` and the order screen's channel both use it; the order screen also signs its socket
  in before joining (it refreshed on every single event and joined unsigned).
- **One tap no longer freezes a board.** Kitchen, Cleaning, Work and Housekeeping each had one `useTransition` whose
  `pending` disabled every button on the screen while any one tap was answering (0.4–1.8 s measured on the kitchen).
  The kitchen's moves are optimistic and hold nothing; Cleaning and Work cards and Housekeeping rooms/tasks each wait on
  their own key (`busy[id]`). Rule: **a board's buttons never share one `pending`.**
- **Four screens ask for the session and their data together** (Outlets, Cash & controls, Intelligence, Online
  orders): they waited for `requireSession()` before starting queries that RLS and the RPCs check anyway; the role gate
  runs when both are back. One round trip instead of two.
- Not the app: the database answers a trivial request in a median 75 ms but sometimes 350–500 ms (Supabase **Micro**,
  shared CPU) — the rare 1–2 s first visit is that. A larger compute size is the owner's call (CLAUDE.md, open items).
- After, local production build: repeat visits median **61–67 ms** laptop (was 121), **214 ms** phone (was 295); taps on
  buttons median **48 ms** (worst 80); idle screens no long tasks; the kitchen board's buttons free 60 ms after a tap.

### The phone's navigation

`BottomNav` shows four sections and **More**, chosen by `barFor()` in `lib/bar.ts` (unit-tested in
`lib/bar.test.ts`): the person's own pins if any are usable, else their role's day (`ROLE_PRIMARY` —
waiter: orders, kitchen, pulse, reservations; chef: kitchen, menu, pantry; cashier: billing, orders,
invoices; housekeeping: housekeeping, rooms, scan; front desk: front desk, rooms, guests,
reservations; store: pantry, scan, labour), else the property default (restaurant: dashboard,
orders, kitchen, billing; hotel/resort: dashboard, front desk, rooms, orders) — always filtered to
what they may open and filled from the menu order. Pins are set in More → **Edit bar** (up to four,
numbered; Reset clears them) and kept per device in `localStorage` (`df-bar-pins`), as Square POS
does. **Late kitchen tickets** (`session.lateKots`) show as a red count on Kitchen, or on More when
Kitchen lives there. Research behind this (Square, Toast Go, Petpooja Captain, Mews, Cloudbeds,
OPERA Cloud; Material and Apple HIG): 3–5 destinations, no scrolling bar, no actions in the bar,
badges only for what needs attention. Probe: `bar.mjs`. More opens a `Sheet` titled Menu
with *every* allowed section as 3-up tiles grouped like the sidebar, then the account card (to
`/settings` when allowed), Master control for admins, and **Sign out** (POST `/logout`). More is
lit while the current page lives under it; the sheet closes on navigation. The old bar was one
sideways-scrolling strip of every section — five fitted, nothing said it scrolled — and a phone
had no way to sign out at all. Probe: `more.mjs` (hotel 390 dark, restaurant 375 paper).

### The rest of the shell

- **`TopBar`** — search, theme switch, the bell (count comes from `session.lateKots`, already in
  the session bundle — no second query), the avatar.
  **Pinned, it runs edge to edge** (2026-10-12): `sticky top-[env(safe-area-inset-top)]`; a 1px marker
  above it and an IntersectionObserver set `data-stuck` once it reaches the top, and
  `.topbar[data-stuck]` (globals.css) pulls it out over the main column's padding to the sidebar's
  edge and over the frame's 12px gutter to the screen's right (`--bx` / `--br` per breakpoint: 16/16,
  32/44 from 768, 48/60 from 1536), grows its own padding by the same so nothing inside moves,
  squares it, slims it (5px above and below instead of 8 — the 6px goes to its bottom margin so the
  page does not jump) and puts a hairline under it; a `::before` band fills the iPhone status bar in the
  installed app. At rest it is the floating card. The till's sticky rows measure it
  (`bar.offsetHeight + 12`) — they assumed `top-4` before. Probe: `tbar.mjs` (5 widths + the till, 11).
- **`MasterBanner`** — the amber "viewing X as its owner" strip when a master is acting as a
  property. Everything done under it is real and logged.
- **`PageHeader`** — the title block each screen passes its own copy into.
- **`Theme`** — `dark` | `paper` | `colour` (0117) | `bright` (0118) | `royal` (0119) — the last two worn as `data-theme="paper"` +
  `data-palette="bright" | "royal"` (`lib/themeLook.ts`) | `system`. `THEME_BOOT` and `ThemeKeeper` set and hold both attributes. Until a person chooses, the app follows the device
  (`system` is the default when there is no cookie). A choice (top-bar switch or Settings) is applied
  at once, written to the `df-theme` cookie, and saved to their login through `set_my_theme`
  (`user_prefs`, migration 0078). `session_bundle` returns it as `theme`; `ThemeSync` in the app
  layout adopts it, so a device that has never seen the person opens in their theme. `THEME_BOOT` in
  `<head>` sets it before paint; `ThemeKeeper` in the root layout restores it whenever React re-applies
  the server's `data-theme="dark"` (the old "one page dark, the rest light" bug). Probe: `theme.mjs`;
  `langtheme.mjs` for the colourful theme. `system` resolves to dark or paper only — colourful is always a choice.
- **`FullLanguage`** (root layout, 2026-10-18) — the whole app in Tamil or Hindi; `LANG_BOOT` in `<head>` beside
  `THEME_BOOT`. See design-system.md, *The whole app in Tamil or Hindi*. `sw.js` caches `/i18n/` (the dictionaries,
  content-hashed) cache-first like `/_next/static/`.
- **`Assist`** — the AI panel, lazy-loaded (`AssistLazy`). Talks to `api/assist`.
- **`FlipRow` was deleted (2026-10-10).** It was imported by nothing — `StatTile` covers the screens
  that needed split-flap tiles. Do not bring back a third way to do the same thing.

## Before you edit

- **The language button** (2026-10-15): the top bar has `LangButton` before the theme button — a small menu of
  English / English + தமிழ் / English + हिन्दी for whoever uses the device; it shows அ or अ when one is on. The app
  layout reads the `df-lang` cookie into `SayProvider` (`components/ui/Say.tsx`) so the first paint already has the
  second line. See design-system.md (Simple Service).
- **The keyboard** (owner, 2026-10-15: every Dining section by keyboard). `components/shell/Keys.tsx` (mounted in
  the app layout) is the one listener; `keymap.ts` is the table it reads and its `?` sheet prints. Everywhere:
  **Ctrl/⌘ K** opens *Go to* (type a few letters of any section this person may open, ↑ ↓, Enter — the top bar's
  "Go to a section" opens it too; it used to show ⌘K and do nothing), **G + letter** goes to a section (D O N R P
  L C K B M I T S H), **N** a new order, **?** the list for this screen. On a list (`items` per screen: Orders'
  tables and tickets, Billing, Reservations `data-res`, Pulse `data-table`, Online orders `data-online`,
  Customers `data-customer`, Menu `data-dish`, Pantry `data-ing`, Billing, the till's dishes) **↑ ↓ ← →** (and J K) move a tint outline
  (`[data-kbd-on]`) by where things sit on screen, **Enter** opens it (`open` selector, else the item or its
  first button), **Esc** lets go; the till adds one with Enter and takes one off with Backspace. **/** focuses a
  screen's search (`search`; the till keeps its own), **Ctrl Enter** presses `data-kbd-primary` (the bill's
  Generate / Mark paid; the till keeps its own Ctrl Enter), **[ ]** change the Reservations day; the kitchen
  keeps 1–9 and R. Nothing fires while typing in a field, with a dialog open, or with Alt. Adding a list:
  give it an entry in `SCREENS`, not a new listener. Probe: `keyscheck.mjs` (17).
- **`app/(app)/error.tsx` keeps the shell up when one screen fails** (`ErrorRecovery inline`): the
  sidebar, tab bar and top bar stay, with *Try again*. Before, only the root boundary caught it and
  one failing screen replaced the whole app with a bare card. (Still **no** `loading.tsx` — see
  above.)


- **More opens on the section you are in** (`[data-more]`, `sheetRef` in `BottomNav`): 80 ms after
  it opens, the sheet's own `.sheet-body` scroller brings the `aria-current="page"` tile to its
  middle (smoothly; not `scrollIntoView`, which also nudges the page behind). If the tile is already
  in view nothing moves. It used to open at the top every time, so after choosing Audit trail or
  Settings and coming back, the current section was below the fold (2026-10-12). Probe `more.mjs`.


- **The page is as wide as `--page-max` (1760px, `globals.css`)**, set on the inner `div` of `<main>`
  in `app/(app)/layout.tsx`. It was 1280: on a 1920 screen that left ~190px of empty ground either
  side of every page. At 1920 the content is now 1556px (main 1652 less the 48px `2xl:px-12`); at
  1440 and below the main column is already under 1280, so nothing there changed; a 2560 monitor
  stops at 1760 so lines and cards do not stretch. Grids are `auto-fill`, so wider means more
  columns, not wider cards.

- **The sidebar is not the permission system.** Hiding a link does not protect a route; the RPC
  behind it does its own check. Never rely on the nav for access control.
- **Do not add a screen without adding it to `MODULES_BY_TYPE` and `ROLE_ACCESS`.** A route with no
  module entry is reachable by URL and invisible in the nav, which is the worst of both.
- **`ALWAYS_ON` bypasses the master's enabled set.** Adding to it is a product decision.
- **`.ink-panel` deliberately sets no `position`** — an unlayered rule here would beat Tailwind's
  `.sticky` and unstick the sidebar.
- **Installing — one engine, four places** (2026-10-13). `lib/install.ts` works out, from the user agent
  (and an iPad's touch points), the device, the browser and the shortest way in (`installPlan`; 10 unit
  tests over ~30 real user agents). `useInstall` (`components/shell/useInstall.ts`) adds whether the browser
  has offered its one-tap install (`window.__dfInstall`, caught in `<head>` by `INSTALL_CAPTURE` — which now
  lives in `lib/install.ts`: imported from a client module, the root layout would carry the panel into every
  page), whether this is the installed app, and `df-app` in localStorage (set when the app is installed or
  opened as the app, cleared when the browser offers again — a browser only offers when it is not installed;
  on Android `getInstalledRelatedApps()` can set it too). `InstallPanel` draws the plan, and it is the same in
  the install sheet, `/get`, Settings → *Install on this device* and the sign-in page (`InstallRow`):
  - the browser's offer → one big *Install DineFlow* button (`data-install-now`); accepted, it says where the
    icon is;
  - Chrome, Edge or Samsung Internet before its offer → that browser's own two or three taps (`menu`);
  - Windows in Firefox, Opera… → **one tap to Edge** (`microsoft-edge:<url>`, `data-open-edge`; Edge comes
    with Windows); Android in UC, Mi or Opera Mini, or inside Instagram or Facebook (`; wv)`) → **one tap to
    Chrome** (`intent://…;package=com.android.chrome;S.browser_fallback_url=…`, `data-open-chrome`); Firefox
    on Android → its menu, or Chrome; Firefox on a Mac or Linux → copy the address into Chrome or Edge;
  - iPhone or iPad — Safari, and Chrome, Edge or Firefox from iOS 16.4 → the drawn steps (`IosGuide`); before
    16.4 in another browser → Safari; inside Instagram or WhatsApp → ⋯ → Open in Safari, and Copy;
  - Mac Safari → File → Add to Dock (Safari 16 or older → Chrome or Edge);
  - installed from here already → "Installed on this PC — open it from your Start menu and taskbar" with *Not
    there? Install it again*; opened as the app → "You're in the app".
  It replaced three copies that disagreed: one said only Safari can add to an iPhone's Home Screen (wrong since
  iOS 16.4), the Settings card said Firefox does not install on Android.
  **Where it opens from:** the download button in the top bar (`InstallButton`) — at every width since the
  sidebar's *Install the app* row was removed (owner, 2026-10-13; `InstallEntry` is gone), and hidden once
  installed (standalone): **one click runs the browser's install** where it has offered it, otherwise it opens
  the sheet; Settings; and the sign-in page. It is **not** in the phone's More sheet — the owner had that row
  removed (2026-10-12). **The sheet is portalled into `<body>`**: rendered inside the sidebar it opened
  behind the page, and inside the sticky top bar the tab bar and the assistant's button covered it. Don't
  write "⋯" or "⋮" as text — the font draws them as dashes; use the `Glyph` with the Lucide icon.
  **On iPhone and iPad the steps are drawn, not listed** (`IosGuide.tsx`): four screens in the app's tokens —
  the browser's bar with Share ringed, the share sheet with *Add to Home Screen* ringed, the Add dialog with
  *Open as Web App* on and *Add* ringed, and the Home Screen with the DineFlow icon — Next/Back, dots, and a
  swipe. The owner could not follow three lines of text. **The first screen follows the browser**: Safari's
  Share in the bottom bar (iPhone) or top right (iPad); Chrome's at the right end of its address bar, at the
  top; Edge's and Firefox's inside their menu (⋯ / ≡), bottom right. Every iOS browser then hands over to the
  same share sheet. Keep each target and its label inside the 248px drawing — a target at the right edge uses
  `top-end` / `bottom-end`, which anchor the label's right side — and the step count out of it. A true one-tap
  install on iPhone is not possible for a web app — it needs an App Store app (see `apps/mobile`). Probe:
  `install-probe.mjs`. See [guest-facing.md](guest-facing.md) for `/get` and the manifest.
- **The rail range lives in one media query** (`768px`–`1279.98px`) and the hamburger is drawn by
  CSS (`.rail-only`), not by JavaScript — move the breakpoint there, and only there.
- **The spacer must stay the aside's next sibling** (`aside[data-open] + .nav-spacer`). Put anything
  between them and opening the drawer slides the page 76px left.
- **On an iPad-size touch screen the frame scrolls, not the page** (globals.css, `@media screen and
  (any-pointer: coarse) and (min-width: 768px)`). `html, body { overscroll-behavior: none }` (kept,
  in base) does **not** stop WebKit — every iPad browser — from rubber-banding the page itself: past
  the end of any screen the whole app lifted off a band of empty frame (the Assist button and the
  rail's avatar rode up with it, the tell of a page bounce; in Chrome the page ends 12px under the
  card on every screen). WebKit does honour it on an inner scroller, so there html and body are the
  screen's height with `overflow: hidden`, and `body .deck` is `height: 100dvh; overflow-y: auto;
  overscroll-behavior: none` — nothing left to bounce. Things that depend on it:
  - **`body .deck`, never `.deck`:** `<html>` carries the class too (root layout); a bare `.deck`
    rule made the root a scroller and `querySelector(".deck")` returns `<html>`.
  - **The card is top-aligned with a one-screen-plus-one-pixel minimum** (`align-items: flex-start`,
    `min-height: calc(100dvh - 23px)`). The extra pixel is on purpose (2026-10-13): with nothing to
    scroll, WebKit does not treat the frame as a scroller, a swipe on a short screen (Neighbours, the
    Audit trail) went to the page behind it and the whole app bounced off a dark band. Before that: a fixed-height flex row stretched it to exactly one screen
    and the page spilled out under it.
  - **A new page opens at its top:** Next.js scrolls the new segment's first node into view (with
    the window it first sets the document to 0, which does nothing here); a `scroll-margin-top: 100vh`
    on the first three levels under `.deck-card > div` (the `(app)` template's motion div, then the
    page) makes that land on 0 instead of under the sticky top bar.
  - **Back/forward land where you were:** `components/shell/DeckScroll.tsx` remembers the frame's
    position per address and restores it on popstate; the browser only restores the page's own. It
    finds `body .deck` or `body .admin-frame` — Master control has the same frame on an iPad
    (2026-10-13), see [admin-and-membership.md](admin-and-membership.md).
  - **A dialog freezes the frame:** `Sheet` sets `overflow: hidden` on html; `html[style*="overflow:
    hidden"] body .deck` follows it.
  - **Pull to refresh still works:** `Gestures` only starts a pull when `innerCanScrollUp` finds no
    scrolled ancestor — the frame is one. Sticky things (rail, top bar, Settings save bar) stick to
    the frame; fixed ones are unaffected; print is `screen`-only.
  - **Phones keep the page scroll** — locked, the phone's address bar would never collapse.
  Confirmed in Chrome's emulation only (`deck.mjs`); the bounce itself is WebKit's and has to be
  checked on the iPad once deployed.
- **Gestures (`components/shell/Gestures.tsx`, mounted once in the `(app)` layout, coarse pointer
  only).** *Pull to refresh:* at `scrollY 0`, a downward drag (damped ×0.5) past 72px shows a ring
  that fills with the tint; letting go runs `router.refresh()` in a transition and the ring spins
  until it lands — server data again, client state (typed fields, a ticket) kept. *Edge swipe:* from
  within 28px of the left edge, 84px of travel goes `router.back()`; from the right edge,
  `router.forward()`; an arrow slides out of that edge and fills when letting go will navigate.
  **Edge swipe is on only in the installed app** (`display-mode: standalone` or iOS
  `navigator.standalone`): Safari's edge swipe and Android's system back already do it in a browser,
  and both firing would skip a screen. Neither starts in a field, a `[role=dialog]` (sheets have
  their own drag-down), `[data-no-gesture]`, while the body is scroll-locked, or — for the pull —
  inside an inner scroller that is not at its top. Listeners are passive; nothing calls
  `preventDefault`.
- **Inside the app the body is the frame's dark (`body:has(.deck-card)`), in both themes.** Left at
  the theme's page colour (#ecece7 in paper), iPad Safari showed it as a light band under the card
  whenever its toolbar collapsed and the screen grew past the frame's `min-h-dvh`. Headless Chrome
  never reproduces this — its viewport does not change mid-scroll — so test it by forcing the body
  taller than the frame (`below.mjs`) rather than by looking for a gap.
- **The theme cookie is read in `<head>`.** Anything that decides layout from the theme must be CSS,
  not JavaScript, or it flashes.

## Verify

```
node dashcheck.mjs       # the shell is on every page it measures
node toolbars.mjs        # 24 checks across six screens
node nav.mjs             # 834/1024/1194/1279: icon rail, 44px hamburger, opens over the page
                         # without moving it, Esc / scrim / picking a screen close it;
                         # 1280/1440: full menu, no hamburger; 412: bottom bar
pnpm lint && pnpm typecheck && pnpm build
```

Sign in as a non-owner on a demo property and confirm the sidebar matches the ticks.

## See also

[design-system.md](design-system.md) · [auth-and-session.md](auth-and-session.md) ·
[staff-and-labour.md](staff-and-labour.md)

## The outlet switcher (0106)

`components/shell/OutletSwitcher.tsx` sits in the top bar after Go to, only when `session.outlets` has two or more:
the current outlet's name, a list of the others (own first, then city and membership), and *All outlets, live*
(→ `/chain`). Choosing one calls `switchOutlet` and reloads on `/dashboard`. On a phone it takes the DineFlow
wordmark's place (`max-sm:flex-1`; the wordmark hides) — both did not fit at 412 and overlapped. "Insights & control"
also lists **Outlets** (owner, manager, supervisor), **Payroll** (owner, manager), **Expenses** and **Checklists**
(0105), **Cleaning** (0111, every role but the kitchen and the store) **Work** (0113, everyone) and **Work records** (0116, owner and managers) — `FRESH` in
`sections.ts`. The phone bar may carry Cleaning and Work (`Nav.tsx` offers them beside the modules); `lib/bar.ts`
`DEPT_PRIMARY` puts a generic role's department first (an `employee` in Engineering starts on Work, one in Housekeeping
on Cleaning), with `dept` from the session (0115).

## Notifications (the bell)

- **`NotifierProvider`** (`components/shell/Notifier.tsx`, inside `ToastProvider` in the `(app)`
  layout, given `mods` and the property type) opens one realtime channel, `df-notify`, 1.5s after
  paint, and listens only for the sections this person holds: `online_orders`, `reservations`,
  `bookings` (not `is_block`), `kots` and `housekeeping_tasks` INSERTs, plus a `kots` UPDATE to
  `ready` within the last minute ("Food ready"), and since 0103 `service_calls` ("A table wants the bill" ·
  water · calling a waiter) and `guest_feedback` rated 3★ or less ("Low rating · 2★"); since 0111 `table_cleanings`
  ("T4 to clean") and, for this person only (`me`, the profile id from the layout), a table or room task given to
  them in the last minute ("Given to you · T4" — kind `assigned`, which needs no module), and since 0112 a room
  finished by someone else ("Room 104 is clean", kind `roomdone`), and since 0113 a job raised for this person's
  department ("High · Tap leaking", kind `job` — supervisors hear every department's; the person's `dept` comes from the
  layout, so `session_bundle` had to carry `department`, 0115) and a job finished ("Done · Tap leaking — Room 104 —
  Washer replaced", kind `jobdone`: the raiser and the department's supervisors). `kindsFor(modules, role)` decides which kinds a
  person can have; listeners are bound **once per table and event**, and `kinds` is keyed by the modules' contents so
  a refresh does not re-join the channel ([cleaning.md](cleaning.md)). These are the tables in the
  `supabase_realtime` publication; RLS decides which rows arrive. Each event the device has switched
  on gets its tone, a toast, and a line in the bell's list (kept in `sessionStorage`, 40 at most);
  with permission and while the tab is hidden, also a system notification through the service
  worker (`sw.js` `notificationclick` focuses the app and opens that section).
- **The bell** (`NotificationBell`) replaced the link to /kitchen. Its count is unread events + late
  KOTs; the panel lists late tickets first, then events; closing it any way marks them read. Its
  footer, *Sound & alerts*, opens the device settings as a sheet — so a waiter or cook without
  Settings can still choose their tone.
- **Settings are per machine** (`lib/notify.ts`, `localStorage["df-notify"]`): a station (Front desk ·
  Kitchen screen · Till / waiters · Owner's phone) sets the tone and which alerts; changing either
  makes it Custom. A device never set up guesses: phone → Owner's phone, otherwise a restaurant's
  till or a hotel's front desk. Six tones are synthesised with WebAudio (no files); a browser makes
  sound only after the first touch, so the provider unlocks audio on the first pointerdown/keydown.
  On iPhone, system notifications need the Home Screen app. Nothing here is Web Push — a closed app
  hears nothing.
- **The phone wordmark** "DineFlow" in the top bar is a link to `/dashboard`, like the sidebar's
  logo; the layout sends a role without the control room to its first section.
- **"My attendance"** sits above *Install the app* in the sidebar's foot, and above Master control in the More sheet, only when
  the owner has turned on Fingerprint or Selfie (`attend` from `app/(app)/layout.tsx`, never while
  Master control is acting). `/attendance` is not a module in `ROUTE_MODULE`, so every role can open it.
- **"Insights & control"** is a fifth group in the sidebar and the More sheet (`FRESH` in `Nav.tsx`): Intelligence,
  Cash & controls, Audit trail. They are **not modules** — no `ROUTE_MODULE` entry, no `role_modules`
  row, no tick in Staff → Access. `FRESH[].roles` decides who sees the link; each page redirects the
  rest (`/dashboard?locked=…`) and its RPCs check the role again. See
  [controls-and-intelligence.md](controls-and-intelligence.md).
