# The shell — layout, nav and module gating

**Files** `app/(app)/layout.tsx` · `components/shell/Nav.tsx` · `TopBar.tsx` · `PageHeader.tsx` ·
`MasterBanner.tsx` · `FlipRow.tsx` · `packages/shared/src/constants.ts`
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
- **`MasterBanner`** — the amber "viewing X as its owner" strip when a master is acting as a
  property. Everything done under it is real and logged.
- **`PageHeader`** — the title block each screen passes its own copy into.
- **`Theme`** — `dark` | `paper` | `system`. Until a person chooses, the app follows the device
  (`system` is the default when there is no cookie). A choice (top-bar switch or Settings) is applied
  at once, written to the `df-theme` cookie, and saved to their login through `set_my_theme`
  (`user_prefs`, migration 0078). `session_bundle` returns it as `theme`; `ThemeSync` in the app
  layout adopts it, so a device that has never seen the person opens in their theme. `THEME_BOOT` in
  `<head>` sets it before paint; `ThemeKeeper` in the root layout restores it whenever React re-applies
  the server's `data-theme="dark"` (the old "one page dark, the rest light" bug). Probe: `theme.mjs`.
- **`Assist`** — the AI panel, lazy-loaded (`AssistLazy`). Talks to `api/assist`.
- **`FlipRow`** — a shared three-tile split-flap row. **Currently imported by nothing**; the
  `StatTile` change covered the screens that needed it. Use it or delete it, do not leave it as a
  third way to do the same thing.

## Before you edit

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
- **The rail range lives in one media query** (`768px`–`1279.98px`) and the hamburger is drawn by
  CSS (`.rail-only`), not by JavaScript — move the breakpoint there, and only there.
- **The spacer must stay the aside's next sibling** (`aside[data-open] + .nav-spacer`). Put anything
  between them and opening the drawer slides the page 76px left.
- **The page does not bounce: `html, body { overscroll-behavior: none }`.** On `html` alone iPad
  Safari still rubber-banded past the end of a short screen and showed empty page under the app.
  Keep it on both. It also stops the browser's own pull-to-refresh, which on a till would reload a
  half-typed ticket — the app's pull-to-refresh below re-fetches data instead.
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
