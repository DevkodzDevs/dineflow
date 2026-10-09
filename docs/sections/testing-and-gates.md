# Testing and the gates

> Nothing is "done" because it looks done. It is done when something measured says so.

## The gates — all four, every time

```
pnpm lint          # 0 errors (14 warnings are known and pre-existing)
pnpm typecheck     # clean
pnpm test          # 38 unit tests: lib/offline/outbox.test.ts (8) + lib/options.test.ts (7) + lib/rates.test.ts (5) + lib/wa.test.ts (4) + lib/roomsuggest.test.ts (4) + lib/marketing.test.ts (4) + lib/bar.test.ts (3) + lib/schemaorg.test.ts (3)
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
| `perf.mjs` / `perf2.mjs` | 26 screens | load speed, laptop and phone (4× CPU, 9 Mbps, 60 ms): server time, DCL, LCP warm and cold, CLS, JS kB; `perf2` also prints FCP and the LCP element — **check that element**: once it was the error screen ("Nothing you entered has been lost"), which reads as a slow page. |

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
