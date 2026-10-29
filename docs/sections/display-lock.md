# Display lock

**Routes** `/lock` (the setting) · any page, when a device is locked to it
**Files** `app/(app)/lock/page.tsx` · `LockClient.tsx` · `actions.ts` · `components/shell/DisplayLock.tsx` · `lib/displayLock.ts`
(+ `displayLock.test.ts`) · the lock's lines in `middleware.ts` and `app/(app)/layout.tsx`
**Reads** `restaurants.display_lock` (through `session_bundle`)
**Writes** `display_lock_set`, `display_lock_note` (0141); the `df-lock` cookie

## What it is

The owner's "display lock" (2026-10-25): pin a device — a counter tablet, a till, a TV — to one page. Two kinds:

- **Static display (`view`)** — the page shows and scrolls; nothing on it can be tapped, typed into or focused.
- **Work on one page (`work`)** — that page and its own steps work (Billing → the till → the bill → the invoice); the menu,
  the top bar, the tab bar, Back and every other page are gone.

Only the **owner, a general manager or a manager** (role `owner` / `manager` — a General Manager's position carries the
manager role) turns a page's lock on, locks a device, or unlocks one.

## How it works

- **The setting** — `/lock` lists every page the person can open, under the menu's headings (`menuGroups`), minus
  `NEVER_LOCK` (settings, the lock page itself, the person's own pages, Connections). Each row: a switch (on/off) and, when on,
  its kind and **Lock this display**. Every change asks first in a sheet: *Turn on lock: Billing?* (with the kind to
  pick), *How Billing locks*, *Turn off lock: Billing?*, *Lock screen to Billing?*. The setting is
  `restaurants.display_lock = { "<page key>": "view"|"work" }`, written only by `display_lock_set` (role checked in the
  database; logged `display.allow` / `display.disallow`).
- **Locking** — `lockThisDisplay(key)`: the role again, the page must be on; logs `display.lock`; sets the httpOnly cookie
  `df-lock` = `<key>.<mode>.<property id>` for a year; the browser then loads the page.
- **On a locked device** — the middleware sends any page outside the lock back to it (`lockRedirect`; sign in/out, the forced
  password change and the offline page pass). The layout renders no Sidebar, TopBar (and its Back), BottomNav, Assist or
  keyboard shortcuts, wraps the page in `[data-lock-area]`, and mounts `DisplayLock`: a link out of the lock is stopped (a
  hint says *This display is locked to Billing*); a pathname outside it is replaced; on a view lock every element of the
  page takes no pointer except scrolling boxes (so the page and its rails still scroll), focus is dropped and only scroll keys
  pass; call cards and the food-ready dock stay away. A pill (bottom right) says *Locked · Billing · View only / Work*.
- **A work lock's steps** (`FLOW`): Orders → /orders, /billing, /tables, /invoices; Tables → the same; Billing → /billing,
  /orders, /invoices; Online orders → /online-orders, /orders, /billing, /invoices; Front desk → /frontdesk, /invoices;
  Reservations → /reservations, /orders; Kitchen → /kitchen (the board too). Any other page: itself and its sub-pages.
- **Unlocking** — the pill → *Unlock this display*: a manager types **their own** sign-in ID or email and password.
  `releaseDisplay` checks it on a separate client (the device's own sign-in is untouched, as the kiosk's leave does),
  counted by `login_gate` / `login_failed` in a bucket of the lock's own property (`display-lock:<rid>` — one shared bucket let
  anyone block every property's unlock) when the service key is set; the person must be owner/manager of the property that
  set the lock; the `display.release` line is written **on that manager's own sign-in** (0143: only an owner or manager can
  write either line, so a waiter cannot forge "released by the GM"); deletes the cookie; the page reloads with the menu back.
- **A stale lock** — this property turned the page off or changed its kind: the layout ignores it and `StaleLock` deletes
  the cookie, so every display locked to it is released the next time it loads. `clearStaleLock` checks that itself — it
  refuses a lock that still holds (2026-10-25 audit: it used to delete any lock, and its id ships in every page).
- **Another property's lock holds.** Signing out (`/logout` passes the lock) and in to a different property does not free the
  device: the layout honours the cookie in the kind it was set, and only an owner or manager **of the property that set it**
  (`lock.rid`) can release it.

## Before you edit

- `LOCK_PAGES` in `lib/displayLock.ts` duplicates the sections' keys and hrefs (the middleware cannot import `sections.ts` —
  it pulls in the icons). `displayLock.test.ts` fails if they drift. A new section: add it to both.
- The cookie is the lock. It is httpOnly; only the lock's server actions set or delete it. Clearing the browser's site data
  removes it — and the sign-in with it, so the device needs a sign-in again.
- A view lock must keep scrolling: never put `inert` or `pointer-events:none` on the scroll container itself (the page, or the
  iPad's `.deck-card`) — only on what is inside `[data-lock-area]`.
- Unlocking needs a password typed on the device. A manager who signed in with an OTP only cannot unlock — they set a
  password in My profile first.

## Verify

```
pnpm --filter @dineflow/web test        # displayLock.test.ts — 4
node dry141.mjs                          # 0141 in a rolled-back transaction — 14
node lock25.mjs                          # the browser: set, lock, guard, release, both kinds, five widths
```
- **Shorter copy (2026-10-29, the owner: "maximum 3 or 4 words, try 2 or 3 — clean and neat").** Subtitles, hints, helper
  lines and empty-state hints cut to two–four words, or removed where they said the obvious. Error and refusal messages,
  steps to follow outside the app, printed and exported text, WhatsApp bodies and tooltips were left as they were.
