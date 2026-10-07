# Testing and the gates

> Nothing is "done" because it looks done. It is done when something measured says so.

## The gates — all four, every time

```
pnpm lint          # 0 errors (14 warnings are known and pre-existing)
pnpm typecheck     # clean
pnpm test          # 15 unit tests: lib/offline/outbox.test.ts (8) + lib/options.test.ts (7)
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
