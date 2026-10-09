# DineFlow — how to work in this repo

DineFlow is a hospitality platform for India: a restaurant POS and a hotel/resort PMS in one app.
Next.js 15 (App Router) · Supabase Postgres · pnpm monorepo (`apps/web`, `apps/mobile`,
`apps/desktop`, `packages/shared`, `packages/db`).

---

## Before you edit anything — read the section note first

1. Open **[`docs/sections/README.md`](docs/sections/README.md)** and find the file that covers the
   path you are about to touch.
2. **Read that note before you open the code.** It says what the section does, what it reads and
   writes, and which specific things have already gone wrong there.
3. Make the change.
4. **If the change makes the note wrong, fix the note in the same commit.** A stale note is worse
   than no note.

The path → note map lives in that README. Shortcuts for the most common ones:

| Path | Note |
| --- | --- |
| `app/globals.css`, `components/ui/**` | [design-system.md](docs/sections/design-system.md) |
| `app/(app)/dashboard/**` | [dashboard.md](docs/sections/dashboard.md) |
| `app/(app)/orders/**` | [orders-and-till.md](docs/sections/orders-and-till.md) |
| `middleware.ts`, `lib/auth.ts`, `app/(auth)/**` | [auth-and-session.md](docs/sections/auth-and-session.md) |
| `supabase/migrations/**` | [data-and-rls.md](docs/sections/data-and-rls.md) |
| anything, before claiming it works | [testing-and-gates.md](docs/sections/testing-and-gates.md) |

---

## Standing rules

**Changes are additive.** Do not disturb a section you were not asked to change. If fixing A
requires touching B, say so before you do it.

**Migrations.** Next number, additive only, RLS policy in the same file. Dry-run inside a
transaction you roll back, then apply with `node scripts/migrate.mjs`. Never edit or renumber an
applied migration.

**Gates, all four, every time:**

```
pnpm lint        # 0 errors (14 warnings are known)
pnpm typecheck
pnpm test        # 22 unit tests
pnpm build       # note: this clobbers .next and kills a running `next dev`
```

**Verify with evidence, not assertion.** "It looks right" is not a result. Run the suite, quote the
number. If a suite fails, check your probe before you change the screen — the assertion has been
wrong more often than the code. The browser suites are **not committed** — they are written per
session into the scratchpad; [testing-and-gates.md](docs/sections/testing-and-gates.md) records
what each one checks so you can rebuild rather than reinvent it.

**Tests restore what they touch.** `guests-test.mjs` prints
`put back: "…" restored to how it was found`. Match that.

**Check both property kinds and both themes.** A resort and a restaurant get different modules,
different tile counts and different flip tiles. Dark and paper are both real themes.

**Check five widths**: 1920, 1440, 1194, 834, 412 — and 44px touch targets on the touch ones.

**Commit only when it is done and verified.** Put the numbers in the message.

---

## Conventions

- `page.tsx` fetches and decides; `XClient.tsx` renders and interacts; `actions.ts` writes.
- A server component cannot hand a function across the boundary — not a callback, not a Lucide
  icon. Pass names and resolve on the client.
- Writes go through `security definer` RPCs with a pinned `search_path` that check the caller
  themselves. The browser does not write tables.
- Colours are tokens (`var(--color-tint)`), never hex. Note that `--color-saffron` and
  `--color-mint` both alias to the green tint in the dark theme — if you want amber, say
  `var(--color-orange)`.
- Money through `formatINR` — `{ whole: true }` for a menu price (₹280, not ₹280.00); a bill total
  keeps its paise. Dates through `todayIST` — the business day is `Asia/Kolkata`.
- Grid tracks are `minmax(0,1fr)`, with `min-w-0` on the item. Plain `1fr` will not shrink below
  its content and pushes things off a phone.
- Scratch files, scripts and screenshots go in the session scratchpad, never in the repo.

## Commit messages

Say what was wrong, what it is now, and how you know. End with:

```
Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

PR descriptions end with:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

## Known open items

- Seven legal facts in `lib/company.ts` are still `null` — blocks launch and blocks subscription
  checkout. [legal.md](docs/sections/legal.md)
- `node_modules/@supabase/auth-js` carries an unmanaged hand-edit that vanishes on `pnpm install`.
  [auth-and-session.md](docs/sections/auth-and-session.md)
- `components/shell/FlipRow.tsx` is imported by nothing.
  [shell-and-nav.md](docs/sections/shell-and-nav.md)
- Razorpay subscription checkout and Sentry are agreed but not built.
  [admin-and-membership.md](docs/sections/admin-and-membership.md)
- The browser suites are rewritten every session and never committed; `scripts/verify.mjs` carries
  paths from another machine and does not run.
  [testing-and-gates.md](docs/sections/testing-and-gates.md)
