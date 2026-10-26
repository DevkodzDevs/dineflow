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
in that map is open to every signed-in person (e.g. `/membership`, `/home`).

**Where a person lands (2026-10-20).** `landingFor(role, held, position)` (`packages/shared/src/positionAccess.ts`):
everyone but the owner and a manager lands on **My day** (`/home`, [my-day.md](my-day.md)) — after signing in
(`startScreen` in `app/(auth)/actions.ts`), when they reach `/dashboard` (the logo, a link, a sign-in redirect), and
when they open a section they do not hold (`/home?locked=<key>`, which says so in one line). The owner and managers keep
the control room; a manager without it goes to `homeFor` as before. My day is the first row of the menu, the first
place on the phone's bar (`myDayFor` in `sections.ts`; the bar shows it plus three of the person's own) and in ⌘K.

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

**The tapped menu item lights at once** (`components/shell/useNavPath.ts`, 2026-10-20 — the owner: "options open
slowly"). The sidebar, the phone's tab bar and the More sheet light the item for the page you asked for from the click
itself (a capture listener on internal links), not when that page arrives 200–500 ms later on a phone; the real
pathname takes over as soon as it changes, or after 4 s if the navigation never lands. Measured the same day, phone
profile (`perfx.mjs nav,taps restaurant phone`, 4× CPU, 4G): live site first visit median 610 ms (p90 1,231), this
build 393 ms (p90 581) — the difference is the code not yet deployed.

**A tab-bar tap was a whole-page reload (found and fixed 2026-10-22, the owner: "a lightweight feel").** `useNavPath`
lit the tapped item from a capture-phase click listener — before React's own handler — and a `useSyncExternalStore` change
re-renders synchronously at the next microtask, still inside that click. On the phone's tab bar lighting a tab swaps its
icon for the lifted one (`TabIcon`), so the element under the finger left the page before `<Link>` saw the click: React
found no handler, nothing called `preventDefault`, and the browser loaded the whole document — every script, the layout
and the data again — on **every tab-bar tap**. The sidebar, the rail, the More sheet and Back only recolour, so they were
never hit. Now the store is set a tick later (`setTimeout(…, 0)`), and `TabIcon` is a module-level component (declared
inside `BottomNav` it was a new type every render, remounting every icon). Probe `reload59.mjs`: a mark on `window` must
survive each move — phone tab bar, More tiles, Back; tablet rail (touch); laptop menu — 13/16 before, **16/16** after.
**Rule: never change what is under the pointer from inside a click listener that runs before React's.**

**Taps answered from the device (2026-10-20, second pass — the owner: "every click opens with a delay").**
- **Warm-up** (`useWarmMenus` in `IntentPrefetch.tsx`): while the device is in use (a tap or key in the last 2 min,
  tab visible, not Save-Data / 2G) the phone bar's tabs, then the menu, are fetched ahead one at a time when the
  browser is idle — at most 8, again every 100 s. A kitchen TV left alone fetches nothing.
- **Show, then freshen** (`useFreshOnArrival`): a screen that appeared within 150 ms of its click came from that cache;
  it is re-read in the background 250 ms later (never while one of the page's own actions is answering —
  `actionBusy`), so what is shown is never more than a moment old. `staleTimes` is 120 s for that reason (was 30).
- **The animation library is out of the tap's way**: the page slide-in (`template.tsx`), every tile's rise (`Reveal`,
  so every `StatTile`) and the segmented control's thumb are CSS animations (`df-page`, `df-rise`, `df-thumb` in
  globals.css) — a CPU profile of a phone tap showed framer-motion measuring the page (`measureScroll`,
  `getBoundingClientRect`) for each one; the segmented thumb's `layoutId` slide is now a fade in place.
- Measured on a quiet machine, phone profile, first visit to a screen after 12 s of use (`warmtest.mjs`): median
  **403 ms** against **645 ms** on the live build (Control room 502 against 1,056). Later runs the same day were 2×
  slower for the live site too (the machine was busy), so compare like with like. `motioncheck.mjs` 10/10 after.

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

**The menu's last group** (owner, 2026-10-13 — the sidebar's foot had grown to ~200px with Help, Install and
Master control; reshaped 2026-10-20). The last `Group` holds the property's Settings (the owner — it left *Manage*),
then `endFor(role)` from `sections.ts`: **`/me`** — a person's own profile settings, labelled "Settings" for everyone
who cannot open the property's Settings and "My profile" for the owner — **`/voice`**, "Feedback & complaints" (the
owner reads the same screen as "Staff feedback"), and **Help & support, for the owner alone** (the owner, 2026-10-20:
"Help & support only in the owner's menu; the staff get a feedback-or-complaints section to the owner instead";
`/help` sends anyone else to `/voice`). It follows *Insights & control* directly and scrolls with the rest
of the menu (the owner asked for that over a first version that pinned it to the foot of the menu). **The sidebar's foot is now only *My attendance* (when on), *Master control* (admins, full
menu only — the collapsed rail hides it as it always did) and the account card: 68px, 112px with Master
control** (`navfoot.mjs`). Installing moved to the top bar's button, now at every width. None of the last group is a
module: no `ROUTE_MODULE` entry, no tick in Staff → Access. On a phone they are rows in the More sheet's account block
(`[data-end=me|voice|help]`) — less whichever one the account row already is: the avatar opens `/settings` for the owner
and `/me` for everyone else (`accountHref` in the layout, which was null for anyone without Settings). Ctrl/⌘ K lists the
same rows; `G F` goes to Feedback & complaints, `G H` (the owner only, `owner: true` in `keymap.ts GO`) to Help. While a
reply from DineFlow is unread (the owner's menu only — nobody else has the row):
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
- **The offline warm-up copies no tables (2026-10-21).** It used to read menu items, categories, tables, rooms,
  ingredients and labourers into IndexedDB for every login before warming screens — nothing ever read them back
  (`useCached` had no caller), a housekeeper's phone fetched the menu and the pantry, and the master got every property's
  rows. It now warms only the screens the person holds, and nothing at all for a role with none of them.
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

**The bar is a floating capsule (2026-10-22 — the owner sent a picture: "like this image exactly").** It was docked
(2026-10-20), then rounded with "Lift" (2026-10-21: the open icon rose out of the bar in a green circle, labels under
every icon). Now `nav.tabbar` (`[data-tabbar]`, below md; the TAB BAR block in `globals.css`) is a capsule with fully
round ends, `--tabbar-row` (64px — 56 on the first day, the owner asked for it a little taller) tall, floating `--tabbar-gap` — `max(12px, the bottom safe area)` — above the foot and
12px in from each side; a solid `--color-bg-2` surface with a faint label-coloured edge and a soft drop shadow (graphite
in the dark themes, white in paper, a gold edge in royal). **Icons only**: four sections, **More** (☰, `Menu`), and
**the person's avatar** at the end — their initial in the tint, ringed in the ink colour — opening the profile card (`ProfileCard`, 2026-10-23) as the top bar's avatar does. Every icon is in the ink colour; the open one
sits on a soft pill (`.tab-pill`, the label colour at 9%, `[data-tab-pill]`), and a press shrinks the icon (CSS). Names
are each slot's `aria-label` and `title` (translated in Tamil and Hindi like any other), so the old two-line label rule
for long Tamil names is gone. The open pill is 48px tall and up to 60 wide, icons 26px, the avatar 34px; each slot is ≥54 wide even at 360. Counts (late kitchen tickets, Help replies) stay red pills
on the icon. **Don't put Tailwind's bare `group` on a slot**: globals.css has a `.group` card (background, border,
shadow) and every slot came out boxed — the slots use the named `group/tab`.
**`--tabbar`** = the capsule + its gap (0 from md). Every bottom offset on a phone reads it — change the row there, not
in these: `main`'s padding (`pb-[calc(var(--tabbar)+28px)]`), the till's cart bar (`[data-cart-bar]`, `--tabbar + 10px`),
the assistant's button (`--tabbar + 12px`; over the cart bar `--tabbar + 10px + 68px`), Settings' save bar
(`--tabbar + 12px`). Sheets (z-50) still open over the bar (z-30). Tablet and desktop are unchanged. Probe `pill64.mjs`
(43: 412/390/375/360 dark and 412 in the other four themes — floating, round, 6 named unboxed slots ≥44, icons only,
one pill behind the open section, the avatar's link; the end of /orders clears it; a tap moves in place and the pill
follows; More opens the sheet).

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
- **Each login loads its own data (2026-10-21, the owner: "housekeeping loads only housekeeping").** What the shell
  asks on every screen now follows the person's sections: the Help & support count (`support_unread`) only where Help is
  shown — the owner (`useSupportUnread(path, on)`), which also keeps the Supabase client off other logins' screens;
  Assist's 90-second snapshot reads only the parts the person's sections show (`reach()` in `lib/assist/data.ts` — a
  housekeeper 2 queries of 8, an employee none); the offline warm-up, the bell (`kindsFor`) and the menus already
  followed the modules. Measured (`roles50.mjs`, phone): browser→database calls after landing and one screen — owner 3,
  housekeeper 0, waiter 0, chef 2 (printers); warm-up — housekeeper /rooms /housekeeping, waiter /orders /orders/new
  /pulse, chef /kitchen /tomorrow /scan. Left as they were: `session_bundle` (one call; its late-ticket count is one
  indexed count) and the Control room's room queries for a restaurant (empty, parallel, the owner's screen only).
- **Back, on every screen (2026-10-22, the owner: "a proper back button on every page, in a place that disturbs no
  one, at every size").** `BackButton` (components/shell) is the first thing in the top bar — sticky, so always in
  reach, never over the page: a 36px round icon at every width since 2026-10-23 (no word — the owner: "just the icon"; a fine ring, a top highlight, the arrow leans left on hover; a 44px tap ring via ::before, not `tap-square`, which grew it to 40/44);
  Master control's header has the same, dark. It is not drawn on the person's home (`landingFor` — the Control room, or
  My day for staff; `/admin` for the master). It goes to the screen you came from, never out of the app: a per-tab trail in
  sessionStorage (`df-trail`, `step()` in lib/back.ts) — the browser's own back only when the Navigation API shows that
  screen is the entry behind, else it opens it; nothing on the trail (a page opened straight) → one level up
  (`parentOf`: /orders/new → /orders, a section → home), and going up replaces the trail's last screen so the next Back
  climbs again. **Not `history.state`** — Next rewrites the entry's state on its own refreshes and the numbers drifted
  (Back left the app; tried first). The pages' own back links went (bill, folio, help thread, invoice, payouts, the till,
  an order, Settings → Screens and Table QR, Pulse QR); the kitchen TV board keeps its ✕ — it covers the top bar.
  `lib/back.test.ts` fails if a staff screen draws its own Back again. Probe `back53.mjs`.
  **On a phone, where Back shows, the DineFlow wordmark steps aside** (TopBar `backShown`; its flex space stays): at 360–412 the
  two did not fit beside the icons and the wordmark ran under Install (caught by `back53.mjs` checking every item in the bar
  against every other — the first version checked only Back against the buttons). On home, Back is not drawn and the
  wordmark is there. Tables’ "x min ago" text carries `suppressHydrationWarning`, like the till’s (React #418).
- **`Assist`** — the AI panel, lazy-loaded (`AssistLazy`). Talks to `api/assist` (NDJSON since 2026-10-21 — see
  api-routes.md, *Assist*). The empty panel: *Check for problems* and *Make a PDF* (topic chips from `topics`, only
  what the role holds), the insights, three suggestions, and the privacy line. A reply can carry a live thought line
  (`.assist-thought`, then folded), step chips, finding cards (`[data-finding]`: level, area, what, Why, Fix, the fix
  button and *Open <screen>*; a tapped fix turns to *Fixed*), PDF cards (`[data-assist-pdf]`: Download, and Share where
  `navigator.canShare` takes files) and action buttons. While it works the header line runs a light (`.assist-scan`)
  and *Stop* aborts the stream.
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
- **(History — superseded the same day by *One install option per device*, below: the browser install and the other
  platform's file are no longer drawn beside a device's own file.)** **The app as a file, one click — `.apk` and `.exe` (2026-10-20; the owner: "a single-click install for the
  .apk and .exe, not only the published installs").** `InstallPanel` now ends with `DownloadFiles`
  (`components/shell/DownloadFiles.tsx`), so all four places get it: on an **Android phone** the `.apk`, on a
  **Windows PC** the `.exe`, is the big tint button *first* (`[data-download=android|windows]`), then "or install
  from the browser" and the plan as before (the browser's one-tap install stays); the other file sits under
  *Another device*; an iPhone, iPad or Mac (which cannot run either) gets both quietly under *For Android phones and
  Windows PCs*. Each is a real `<a href download>`; a file that does not exist keeps its slot greyed — "Coming soon —
  the build is being prepared" (`[data-download-soon]`). **Which files exist** is `/api/download` →
  `availableDownloads()` (`lib/installers.ts`, async since 0128): the file uploaded on Master control → App files
  (`app_releases`, public Storage, kept 60 s) wins; then `NEXT_PUBLIC_APK_URL` / `NEXT_PUBLIC_EXE_URL` (or the older
  `NEXT_PUBLIC_DOWNLOAD_ANDROID` / `_WINDOWS`; versions `NEXT_PUBLIC_APK_VERSION` / `_EXE_VERSION`); else the
  file this machine built, streamed by `/api/download/<key>` (the newest `DineFlow-Setup-*.exe` in
  `apps/desktop/dist`, `apps/android-app`'s signed release APK). `/get` dropped its own two file rows for these. The
  Android app is new — `apps/android-app`, a Trusted Web Activity (~600 KB) with
  `public/.well-known/assetlinks.json`; how to build, sign and host both: [docs/install-builds.md](../install-builds.md).
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
also lists **Outlets** (owner, manager — every supervisor's too until 2026-10-20), **Payroll** (owner, manager),
**Expenses** (0105, the drawer's people of the money teams — below), **Checklists** (0105, everyone), **Cleaning** (0111;
since 2026-10-20 the service and housekeeping teams and the front desk — below) **Work** (0113, everyone) and **Work
records** (0116, owner and managers) — `FRESH` in `sections.ts`. The phone bar may carry Cleaning and Work (`Nav.tsx` offers them beside the modules); `lib/bar.ts`
`DEPT_PRIMARY` puts a generic role's department first (an `employee` in Engineering starts on Work, one in Housekeeping
on Cleaning), with `dept` from the session (0115).

**A screen inside another section can be a menu row of its own** (2026-10-20): `ITEMS` rows are typed `Section` and may
carry `mod`, the module whose tick opens them — **Join by QR** (`pulse-qr` → `/pulse/qr`, mod `pulse`) after Pulse and
**Order board** (`order-board` → `/kitchen/board`, mod `kitchen`) after Kitchen. Sidebar, More sheet and Ctrl/⌘ K filter
with `modOf(item)`; the route itself is gated by the layout's `ROUTE_MODULE` on its first segment, so nothing else
changed. Such a row never fills a gap on the phone bar by itself — only when pinned (`fills` in `BottomNav`). **The lit
row is `isOn(path, href)`, not `path.startsWith(href)`**: a row owns its path and what is under it except a deeper
row's own, so /kitchen/board lights Order board and not Kitchen, and /work-records no longer lights Work too (the bare
`startsWith` lit both). Pins are now checked against what the bar may carry (`onBar`), so a pinned Cleaning or Work
board counts as pinned in Edit bar (it was filtered by modules and dropped).

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
- **A table's call is a card, not a toast (2026-10-23, the owner: "a proper notification with the detail").** The
  `service_calls` INSERT looks up the table's name and zone (`tableOf`, cached) — the alert says *T2 wants the bill ·
  Main · asked 1:41 pm*, not "A table…". Every device that hears calls (Owner's phone, Till / waiters; not the Front desk
  station) shows `CallAlert` (`components/shell/CallAlert.tsx`): table, zone, time, minutes waiting, **Later** (hides it
  here) and **On my way** (`answerCall` → `service_call_done` for that table, so the guest's tile turns *On the way*). The
  row's UPDATE to done takes the card off every other device. No backdrop — a waiter mid-order finishes first; bottom on
  a phone above the tab bar, top-right from `sm` at 104px (clear of the top bar); three at most, then "+n more on
  Orders". The phone buzzes (`lib/buzz.ts`). Its words are in the Tamil / Hindi dictionaries. `staffcall.mjs`, 22 checks
  (2026-10-23, against `next start`, signed in as manoooo's waiter): the card in ~0.3–0.5 s at 412 and 1440, naming
  table, zone and time; 44px buttons; On my way → done in the database in <0.4 s and the guest's `dine_call_status` says
  done; answered on another device → the card leaves in ~0.25 s; Later hides it and the call stays open on Orders; all
  five themes read (title ≥14:1, time line ≥6.5:1). A seeded staff login lands on /account/password once its temporary
  password is old — the probe opens the app's own grace window (`profiles.temp_access_until`) for 15 minutes and puts
  it back, never the password.
- **The bell** (`NotificationBell`) replaced the link to /kitchen. Its count is unread events + late
  KOTs; the panel lists late tickets first, then events; closing it any way marks them read. Its
  footer, *Sound & alerts*, opens the device settings as a sheet — so a waiter or cook without
  Settings can still choose their tone.
- **Settings are per machine** (`lib/notify.ts`, `localStorage["df-notify"]`): a station (Front desk ·
  Kitchen screen · Till / waiters · Owner's phone) sets the tone and which alerts; changing either
  makes it Custom. A device never set up guesses: phone → Owner's phone, otherwise a restaurant's
  till or a hotel's front desk. Six tones are synthesised with WebAudio (no files); a browser makes
  sound only after a gesture, so the provider arms `armAudioUnlock()` (`lib/notify.ts`): pointerup, touchend, click and keydown
  for the whole visit — **not pointerdown**, which a touch screen does not count as a gesture (that was why phones and iPads
  were silent, 2026-10-23). It also asks for a `playback` audio session (`navigator.audioSession`, with a moment of silence
  through an `<audio>` element for older Safari) so an iPhone's silent switch does not mute the alerts, and resumes any
  state that is not `running` (iOS leaves a context `interrupted`).
  On iPhone, system notifications need the Home Screen app. Nothing here is Web Push — a closed app
  hears nothing.
- **The phone wordmark** "DineFlow" in the top bar is a link to `/dashboard`, like the sidebar's
  logo; the layout sends a role without the control room to its first section.
- **"My attendance"** sits above *Install the app* in the sidebar's foot, and above Master control in the More sheet, only when
  the owner has turned on Fingerprint or Selfie (`attend` from `app/(app)/layout.tsx`, never while
  Master control is acting). `/attendance` is not a module in `ROUTE_MODULE`, so every role can open it.
- **"Insights & control"** is a fifth group in the sidebar and the More sheet (`FRESH` in `sections.ts`): Intelligence,
  Cash & controls, Audit trail. They are **not modules** — no `ROUTE_MODULE` entry, no `role_modules`
  row, no tick in Staff → Access. `FRESH[].roles` decides who sees the link; each page redirects the
  rest (`/dashboard?locked=…`) and its RPCs check the role again. See
  [controls-and-intelligence.md](controls-and-intelligence.md).
- **The control links follow the job (2026-10-20 — the owner: "the menu shows only what each job and position needs;
  the internal controls follow the job too").** A `FRESH` row may name the teams it is for (`depts`); then the owner, a
  manager, a supervisor with no team (who runs the whole floor, as on Work) and the people of those teams see it, plus
  any job in `anyDept`. The person's team is `deptOf(role, department, position)` — the one set on them, else their
  position's (`POSITIONS[].dept`), else their role's (the database's `_my_dept()` rule) — worked out once in the
  layout and handed to the sidebar, the phone bar and Ctrl/⌘ K. Now: **Intelligence, Audit trail, Outlets** — owner and
  managers (supervisors lost them); **Cash & controls, Expenses** — owner, manager, and the supervisors and cashiers of
  the money teams (service, front office, finance, management): not a kitchen or engineering supervisor;
  **Cleaning** — the service and housekeeping teams and the front desk: not a chef, a guard, a gardener, a bellboy;
  Payroll and Work records unchanged; Checklists and Work everyone's. **Each page asks the same question**
  (`seesFresh(key, role, dept)`): `/controls` and `/expenses` → `/dashboard?locked=…`, `/cleaning` → `/work` (open to
  everyone, so no loop), `/intelligence`, `/audit` and `/chain` check owner/manager. The RPCs and RLS behind them are
  unchanged (the audit trail's policy still lets a supervisor read through the API; the screen is no longer theirs).
  The modules a job opens by default narrowed too (0126; [staff-and-labour.md](staff-and-labour.md)). Tests: five in
  `lib/positions.test.ts`; the matrix of every role and the main positions before/after is in the 2026-10-20 session
  report (`m126/before.txt`, `after.txt` in the scratchpad).

- **Flap numbers (2026-10-20)** — design-system.md, *Flap numbers*. The More sheet's Help count is a mini flap tile; tab-bar counts (`[data-tab-count]`) and the bell's count (`[data-bell-count]`) stay red pills — a flap is unreadable at badge size.

- **One install option per device (2026-10-20 — the owner: "proper install option for all devices, don't show
  unwanted install options").** `installPlanFor(env, state, files)` in `lib/install.ts` (7 tests) decides the ONE way,
  and every surface draws only it — the top bar's icon (`InstallButton`), the sign-in row (`InstallRow`), the install
  sheet, Settings → Install on this device (`InstallApp`) and /get:

  | Device | Shows |
  | --- | --- |
  | running as the app (any display-mode, iOS standalone, DineFlow's Android app — referrer `android-app://cloud.dineflow.app`, kept for the visit in sessionStorage `df-shell` — or the Windows app — UA `Electron/` / `DineFlowDesktop/`) | nothing; Settings says "installed" and keeps one row to /get |
  | installed from this browser before | "Installed — open it from its icon" (+ "Not there? Install it again") |
  | Android, .apk available | "Download for Android (.apk)" only — not the browser's install as well |
  | Windows, .exe available | "Download for Windows (.exe)" only |
  | Android / Windows, no file yet | the browser's install (one tap, or the menu's taps, or one tap to Chrome / Edge) |
  | iPhone / iPad (iPadOS as a Mac with touch points) | Share → Add to Home Screen, drawn — never a file |
  | Mac, Linux, Chromebook | the browser's install (prompt, Chrome/Edge's address-bar icon, Safari → Add to Dock) — never a file |

  Other devices are ONE compact row, "Install on another device → /get" (`[data-install-other]`); the old list of
  both files under every panel (`DownloadFiles`) is gone. `offersInstall()` hides the top-bar icon and the sign-in row
  once installed, and on a computer whose browser cannot install (Firefox, unknown). A one-tap browser prompt runs from
  the icon only when the browser's install IS the device's way; with a file, the icon opens the sheet. Hooks:
  `data-install-plan=<android|windows|ios|desktop|installed>` and `data-install-primary=<apk|exe|browser|installed|installed-here>`
  on the panel root (`data-steps` keeps the browser plan). The Windows app adds ` DineFlowDesktop/<version>` to its user
  agent (`apps/desktop/main.cjs`) — in the next .exe build; until then `Electron/` does the same job.

- **The menu's headings, rearranged (2026-10-21, the owner: "rearrange every menu under a heading that suits it").** The
  groups are one list, `MENU_GROUPS` / `menuGroups(rows, lead)` in `sections.ts`, used by the sidebar and the phone's
  More sheet alike (each had its own lists before). *Dining* had held eleven unrelated rows, *Manage* and *Insights &
  control* a mix of money, people and reports. Now, in order: (no heading) My day / Control room · Tomorrow · Scan —
  **Rooms & stays** (hotel, resort) Front desk · Rooms · Housekeeping · Guests · Facilities — **Guests & tables**
  Reservations · Pulse · Join by QR · Customers — **Orders & kitchen** Orders · Online orders · Kitchen · Order board ·
  Billing — **Menu & stock** Menu · Pantry — **Team & work** Staff · Checklists · Cleaning · Work · Work records · Labour ·
  Payroll — **Money** Invoices · Expenses · Cash & controls · Tax & GST — **Reports & insights** Reports · Intelligence ·
  Audit trail — **Business & growth** Outlets · Channels · Proof of business · Neighbours — then the last group as before
  (Settings, My profile / Settings, Staff feedback / Feedback & complaints, Help & support). Who sees a row is unchanged
  (`modulesFor`, `freshFor`); an empty group is left out; a row no group names lands in a last *More* group so a new
  section is never lost. `ITEMS`' order is untouched — the phone bar still fills from it. The hairline count above is
  now one per group shown (eight for a restaurant owner, nine for a hotel or resort). `lib/menu-groups.test.ts`: every
  row a person may open appears exactly once, for seven roles × three property kinds. shots44.

- **The phone bar, sample 2 "Lift" (2026-10-21 — five samples, `barsamples.mjs`; a mix of "Lift" with a centre + and Quick
  actions was built, shown and dropped by the owner the same day).** The open tab's icon lifts out of the bar in a green
  50px circle ringed 5px in the page colour (a notch), its label green under it (`.tabbar-lift` pops it into place; off
  under reduced motion); the others are icon over label. The bar is rounded (`border-radius: 12px` — 24px at first, then 8, then the owner settled on 12, a hairline all
  round) and stands **3px off the foot** and **2.5px in from each side** (`bottom-[3px] left-[2.5px] right-[2.5px]` on the nav; `--tabbar` adds the 3px, so every bottom offset
  still clears it). Four tabs and More, pins up to four, as before. shots47: 4 of 4 (412 / 360, dark and paper — the
  bar's foot 3px above the screen's, 12px corners, no +).

## The sidebar's six looks and the fold (2026-10-23)

The owner: "a minimise for the left bar — icons only — and five or six designs to choose from, fitting every section and
every screen; the iPad keeps its own as its default; the phone is not touched". `lib/sidebar.ts` (3 tests in
`sidebar.test.ts`) holds the looks — **Classic** (`full`, 256px), **Compact** (212px, 36px rows), **Icons** (`rail`, 76px),
**Icons and words** (`dock`, 96px, a small word under each icon), **Floating** (248px on a rounded card 12px off the
edges) and **Floating icons** (`float-rail`). `html[data-sidebar]` carries the look; `SIDEBAR_BOOT` sets it in `<head>`
before the first paint (beside THEME_BOOT and LANG_BOOT): the device's choice (`localStorage df-sidebar`), else `rail`
under 1280 and `full` from 1280 — exactly the old split, so nothing moved for anyone who chooses nothing; the Sidebar keeps
that default in step on resize. globals.css (the sidebar block) draws every look from 768 up — **below 768 nothing
changes** (the bottom bar). The icon looks keep the ☰ drawer and the spacer. **The fold** (`[data-sb-fold]`, the foot of
the menu over the account card): an open look folds to its icon look (Floating to Floating icons), an icon look unfolds to
the one it came from (`df-sidebar-was`). **Menu style** — My profile → This device (`SidebarPicker`, six drawings, *As the
screen* to go back to the default; hidden on a phone). The menu row's word carries `.nav-label` (the dock shows it).

## The avatar opens the profile card (2026-10-23)

The owner: "a click on the profile first shows the name, the position, when they started here and the rest".
`components/shell/ProfileCard.tsx`: the top bar's avatar (`[data-my-profile]`, now a button) and the bottom bar's
(`[data-tab="me"]`) open a sheet before any page — the person in their colour, title and team, then joined (date and "2 yr 3
mth here"), access, staff code, reports to, phone, email (verified or not), the emergency contact, languages and their line
about themselves; **Edit my profile** (/me) and, for the owner, **Settings**. Read when it opens (`myCard` in me/actions.ts),
so no screen carries it. It went straight to Settings (or /me) before.
- **Short copy** (2026-10-23): the install sheet, Send install link and Menu style hints cut to a few words; the step-by-step install instructions (InstallPanel, IosGuide) are unchanged.

- **One profile circle on a phone, a slim Master bar** (2026-10-23, the owner: "why two profile icons — one is enough"):
  below md the top bar's circle (`[data-my-profile]`) is hidden — the bottom bar ends in the same circle, opening the same
  ProfileCard. `MasterBanner` under 640px is one pill-shaped line: "Master mode · <property>" and an **Exit** key (the
  long "viewing … as its owner", "real and logged" and "Back to Master control" from sm up; `.long` / `.short` in
  `MasterBanner.module.css`).

- **Menu style from the sidebar itself, and in Settings** (2026-10-23, the owner: "the sidebar designs are still not applied" —
  they were, locally, but never deployed; and the only way to choose was My profile). The foot now has the fold key and a
  **Menu style** key side by side (`.sb-tools`, `[data-sb-style]`; one over the other on the icon looks), which opens the six
  looks in a sheet (`SidebarPicker inSheet`); Settings → Appearance shows the picker too. The top bar hides its Ctrl K hint
  under 1024px, where the search line is short. sb74: 76/76 — six looks × 1920/1440/1194/834 × restaurant and resort, the
  default (icons under 1280, classic above), the fold both ways, the Menu style key, the phone untouched.

### Speed pass — 2026-10-23 (the owner: "the first load is too slow")

Measured first (`perf75.mjs` live and local, `qtime.mjs`, `explain.cjs`, `nav76.mjs`):
- **Live, a first visit to the control room: first paint 4.3 s.** The server began answering at 0.57 s but finished the
  page at 3.3 s (a fresh instance loading the route's code for the first time), and 371 kB of script came on top (react-dom
  53 kB, Next 46 kB, framer-motion 40 kB — the app's own share is small). The same screen warm: 0.5 s. Other screens cold
  0.8–2.0 s, warm 0.3–0.7 s.
- **Not the database:** `session_bundle` runs in 2.8 ms inside Postgres; each REST call is 80–190 ms from a desk in India,
  nearly all of it the trip, and Vercel (bom1) sits beside Supabase (ap-south-1). The control room's twelve reads together:
  ~240 ms.
- **Fixed — what is not the screen waits for it** (`lib/idle.ts`, `whenSettled(fn, after)`: after the load event and an
  idle moment): Assist's insights (2.5 s after the first screen, 0.9 s after later ones), `/api/download` (1.5 s), the
  support count (1.2 s), and the screen warm-up (3 s, was a fixed 1.5 s from mount). A first load went from ~50 requests to
  ~40, with no `/api/assist` or `/api/download` beside it. Screen to screen locally (frame-timed): median 303 ms.
- **Tried and taken out — a Suspense boundary round the page in the layout.** The shell painted sooner, but the screen
  itself arrived later on every route (the control room's LCP 0.76 → 2.9 s, Menu 0.49 → 2.6 s) and taps slowed to
  0.6–2.2 s. Same lesson as the loading.tsx above: **do not put a boundary round `{children}`.**
- **Left for the owner (outside the code):** make **dineflow.cloud** the primary domain in Vercel → Domains (every visit to
  the bare name is a 308 to www first: +0.2–0.4 s); confirm Fluid compute is on (Settings → Functions); a free uptime
  check on `https://www.dineflow.cloud/api/health?deep=1` every 5 minutes keeps an instance and its database path warm;
  the Supabase compute size (Micro) is the owner's call. pg_cron / pg_net are not installed and were not turned on.

- **The phone's top bar is the top of the screen** (2026-10-23, the owner on an iPhone: "the top bar and the start of the
  page are not visible properly"). Under 768px `.topbar` is one solid bar, square and edge to edge, pinned at 0 and padded
  by the safe area — the clock and battery sit on the bar's colour, never on the page; no glass (`!important` over
  `.material`), the same shape pinned or not. Master mode's band takes the safe area when it is above the bar. iPad and
  laptop keep the floating card. round79: 412 × four screens at rest and scrolled, a 47px emulated safe area, 834/1440 unchanged.
- **The language menu on a phone** opens as a full-width panel under the bar (`[data-lang-panel]`, fixed, 12px in) — anchored to
  the button's right edge it ran off the left of the screen.
- **The opening splash** (`lib/splash.ts` SPLASH_BOOT in <head>, the SPLASH block at the end of globals.css): only when
  DineFlow runs as an app (display-mode standalone/fullscreen, iOS `navigator.standalone`, the Android app's
  `android-app://` referrer), once per launch (sessionStorage `df-splash`). The logo scales in with a soft green glow and a
  widening ring, "DineFlow" rises under it; it leaves once the page has loaded and 1.1 s have passed (4 s at most), fading
  in 0.35 s. Drawn from pseudo-elements of <html> and <body> — nothing in React's tree. `?splash=1` shows it in a tab.
  The logo (16 kB) is fetched only when the splash shows.

- **The error card retries once by itself** (2026-10-24, the owner: "after login the app shows This screen did not load").
  The evening before, the shared database was overloaded by a full-app test run for a few minutes; every screen in that
  window fell to the card and stayed there. `ErrorRecovery` now reloads once after 1.5 s ("Reconnecting…",
  `[data-error-retrying]`), at most once a minute (sessionStorage `df-retried-after-error`); a second failure inside the
  minute shows the card, so a real bug cannot spin. A stale build still reloads at once, as before. **Lesson for testing:**
  dev and live share the database — never run parallel browser suites against it; one browser, paced.

- **Master mode on a phone: one head** (2026-10-24): `.app-head` wraps the band and the top bar; under 768px with the band in it,
  it is one solid sticky head from the very top (the band takes the safe area, the bar sits under it). Elsewhere it is
  `display: contents`.
- **The ready bubbles** (`components/shell/ReadyDock.tsx`, mounted for anyone with Orders): an amber parcel bubble for takeaway,
  delivery and online tickets that are Ready, a green bell for the dine-in tickets the person took (supervisors and up: all), each
  with a count and a soft ring, above Assist on the right; a tap lists them with **Handed over / Served** (`setKotStatus`). Read
  after the screen settles, then live on a `kots` channel and every minute; never on the kitchen's screens.
- **Assist is for the top three, and whoever is given it** (0138): owner, manager, supervisor, or `profiles.assist_access` (the
  owner or a manager switches it in Access). The layout leaves the button out and `/api/assist` (and `/act`) answer 403
  otherwise. **Drag the bubble onto the close mark** that appears at the foot of the screen to put it away on that device
  (`df-assist-hidden`); My profile → This device → Show Assist brings it back; ⌘J still opens the panel.
- **Launching is emerald, never black** (2026-10-24, the owner: "a black screen when the app opens again"). The phone's own
  launch screen comes first: `manifest.json` `background_color` is #0b4a35 (it was #17171c, the black), and the iPhone
  and iPad get launch images — `public/splash/<w>x<h>.png`, 19 sizes from the SE to the 16 Pro Max and the iPads, drawn
  by `pw/launch97.mjs`, linked from `LAUNCH_IMAGES` (lib/splash.ts) as `apple-touch-startup-image`. iOS reads them when
  the app is added to the home screen: **an app added before this keeps a black launch until it is removed and added
  again**. Then the service worker's launch loader if the page is slow (guest-facing.md), then the in-app splash — the
  same emerald, the logo (its own dark tile) in a spinning ring, "DineFlow" — which now leaves once the document is
  parsed and at least 0.6 s have passed (at most 3 s); it waited for every image and 1.1 s. `lib/splash.ts` is outside the
  translation check (its strings are media queries).
- **A menu row an owner-given grant opens** (0140, 2026-10-24): `Section.grant` — Connections (`/connections`, no module; under
  *Business & growth*) and Reports (a module *and* the grant). `rowsFor(mods, role, grants)` in sections.ts is the one filter
  for the sidebar, the phone bar, Go to and `G` + letter (`G X` → Connections); the layout gates the same two segments.
  `grants` ride with the session (`session_bundle`). See connections.md.

- **A locked device has no menu (0141, Display lock — [display-lock.md](display-lock.md)).** When the `df-lock` cookie holds a
  lock the property still allows, the `(app)` layout renders no Sidebar, TopBar (so no Back), BottomNav, Assist or `Keys`,
  wraps the page in `[data-lock-area]` and mounts `DisplayLock` (the guard, the *Locked* pill, the unlock); on a view lock the
  ReadyDock is left out too. The middleware's `lockRedirect` sends any other page back to the locked one. With no cookie the
  layout renders exactly as before. "Display lock" (`/lock`) is a "fresh" link for the owner and managers, under *Devices*.
- **The sidebar on a touch screen (2026-10-25 audit).** Menu rows (and My attendance) are 42px with a mouse and 44px under
  `pointer: coarse`; on the folded rail the fold key is 44 wide (40 with a mouse) and the account link at least 44 wide. Measured
  with real touch emulation (`mobile: true` + touch at 1194 and 834): nothing in the sidebar under 44. The top bar's Back is
  36px drawn with an invisible `::before` making the target 44 — a box-measuring probe reports 36; that is by design.
- **The installed iPad app sits under the status bar, not behind it (2026-10-25, the owner: "the time, day and date and the
  battery look collapsed over the top, and the bottom shows an empty band — iPad only").** Installed, iOS draws the page from
  the top of the screen under a see-through status bar (black-translucent, viewport-fit=cover), but 100dvh there is the screen
  less the status bar: the frame (100dvh from y = 0) put the clock and the battery over the card's top edge and the sidebar's
  first key, and ended a status bar short of the bottom — the dark page showed as a band. `SPLASH_BOOT` (lib/splash.ts) now
  sets `html[data-app]` before the first paint whenever DineFlow runs as an app, every launch. In the iPad frame block
  (globals.css, `any-pointer: coarse` and 768 up) `html[data-app]` pins `body .deck` from `--sat` (=
  `env(safe-area-inset-top)`) to the bottom of the screen (`position: fixed`), so the status bar sits on the frame's own
  colour; the card's minimum is `calc(100% - 23px)` of that frame (not dvh), the sidebar is 100% of it (the floating looks
  100% − 24px), the icon looks' open drawer runs from `--sat` to the bottom, the pinned top bar sticks at the frame's top
  (`top: 0`; its env() offset and `::before` band were for a frame that started under the clock), and Master control's
  `.admin-frame` is pinned the same way. A browser tab (no data-app) and a phone (under 768) are unchanged.
  Probe `pw/ipadapp143.mjs` (testing-and-gates.md).
- **A table's QR order rings like a call (2026-10-27, the owner: "notify the table section, orders and the kitchen").** For
  whoever hears table calls, an `online_orders` INSERT with a table and status new becomes a `CallAlert` card of kind
  `order` (violet, "T1 placed an order", items · total) with **Later** and **Accept · to kitchen** (`acceptOnline` — the KOT it
  makes rings the kitchen as every ticket does). It waits 1.5 s first and is dropped if the order was already accepted (a
  channel set to accept by itself) or refused; an UPDATE out of `new` takes the card off every device. Those staff no longer
  also get the *New online order* toast for it. The Calls setting's hint says so.
