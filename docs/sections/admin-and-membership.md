# Master console, membership and about

**Routes** `/admin` · `/admin/compliance` · `/membership` · `/about`
**Files** `app/admin/**` (~1386 lines) · `app/membership/**` · `app/(app)/about/AboutBody.tsx`
**Reads** `restaurants`, `membership_keys`, `admin_log`
**Writes** `admin_overview`, `admin_property_detail`, `admin_create_property`,
`admin_update_property`, `admin_delete_preview`, `admin_delete_property`, `admin_act_as`,
`admin_stop_acting`, `admin_issue_key`, `admin_set_membership`, `admin_set_contact_email`,
`admin_reset_property_password`, `admin_login_id_available`, `admin_box_status`,
`admin_compliance_overview`, `master_set_modules`, `master_set_password`, `install_sample_estate`,
`sweep_expired_demos`, `redeem_membership`

## What it is

The console you — the vendor — use across every property on the platform. It is not part of a
property's app; it sits above all of them.

## How it works

**Testing** (`/admin/testing`, the fourth tab, `AdminNav`). A self-test console: *Run all tests* and
one *Run* per suite, each a list of checks that pass, warn or fail with what was seen, kept in
`selftest_runs` (0093, master-only) so the page opens on the last result of each. Eleven suites run on
the server (six described here; the five added on 2026-10-25 are under *The deep suites* below) through `POST /api/admin/selftest` (`{ suite, restaurant }`, master only): **Database**
(`selftest_db()` — round trip, migrations, RLS on every table, no bare policy, required functions,
triggers, indexes, integrity: negative stock, orders open > 24 h, paid bills vs payments, properties
without an owner, load, row counts), **Functions** (`selftest_functions(rid)` — 19 report and screen
RPCs for one property, timed, errors caught per call; it sets the master's acting context for the
calls and puts it back), **API & connectivity** (Supabase REST / Auth / Storage, the app's own routes,
the public storefront and queue, Wikimedia, which server keys are set), **Security** (the headers a
scanner grades, anonymous reads of ten tenant tables must be empty, anonymous `admin_overview`
refused, signed-out visits redirect to sign-in, this route without a session is 401, the nightly
sync without its secret is 401, no secret under a `NEXT_PUBLIC_` name, legal facts), **Speed** (server
time per screen and per database call against Lighthouse's lab budget — under 600 ms good, over 1.5 s
failing — property screens only while acting) and **Code checks** (money, dates, the bill, recipes,
the till search, run in place). The twelfth, **Screens & buttons**, runs in the master's own browser
(`TestingClient` → `runBrowser`): every screen in a hidden same-origin frame at 412, 834 and 1280 — crash
card, sideways scroll, images that did not arrive, unnamed buttons, a missing heading, where it
landed — then every internal link those screens offer is fetched; the result is kept through
`recordRun`. Nothing in any suite writes a property's data.

The page, top to bottom (redesigned 2026-10-12 after the owner found the first dashboard messy): a
**header** with the property picker, *Export PDF* and *Run all tests* (on a phone the picker takes its
own line — in one row *Run all* was squeezed to 46px and scrolled the page 9px, which the Screens suite
caught on its own page); **one overview panel** — while running, a progress bar naming the suite and
the percent (`[data-progress]`); then the health-score ring (a pass counts whole, a warning half, a
failure nothing; skipped not judged) with the verdict, the four totals in divided columns, and every
check as one stacked bar; **one Suites list** (`[data-suites]`) — a row per suite with its status
pill, a pass/warn/fail bar, "12/13 passed · 1 warn", time and age, *Run*, and a chevron that opens its
checks (each with its time) inline; and **Slowest answers** — the ten slowest server, API and database
timings on one axis (0, 600 ms, 1.5 s, max) coloured by budget. The Screens suite's whole-page frame
loads are left out of that chart: the 600 ms server budget does not apply to them and they painted
every bar amber. **Export PDF** (`exportPdf.ts`, `jspdf`, loaded only on press): a dark cover with
the score, the totals, the suite table, then every check in three columns (status chip, name in
165pt, what was seen) with zebra rows and page numbers, saved as `dineflow-self-test-YYYY-MM-DD-HHMM.pdf`;
₹, dashes and arrows become plain text (jsPDF's fonts are Latin-1). Probe `dash.mjs` (7): the
progress bar while running, the overview, 7 rows, the speed chart, a row's checks, a 104 KB 4-page
`%PDF-` file, and the phone layout — measured by element edges, since a mobile viewport widens to
fit and `scrollWidth − innerWidth` reads 0 there.

Added the same day: **Needs attention** (`[data-attention]`) — every warning and failure across the
suites, failures first, each with its suite; a tap opens that suite filtered to its issues. The
overview gains a **health trend** (`[data-trend]`, the score of each Run all — runs within three
minutes are one sitting — over the last twelve, with the change since the previous) and **response
figures** (`[data-latency]`: median, 95th percentile and the slowest of every timed server-side check).
Each suite row carries its **last eight results as dots** (`[data-history]`), and an open suite has a
**Show All / Issues** switch (`[data-filter]`). The page loads the last 200 runs for the history.
Probe `enh.mjs` (7): issue count = warnings + failures, dots on every row, the trend line, the three
figures, an issue tap opening its suite filtered, All restoring every check, nothing past a phone's
edge. It records the run ids that existed before and removes only its own.

**The deep suites (2026-10-25, 0142 — the owner: "upgrade all the testing tools, more master-minded tools").** Twelve
suites in five areas, each area a tile with its own score (`[data-groups]`, `.fill-tiles`; a tap opens its first suite
that is not clear):

| Area | Suites |
| --- | --- |
| Data & money | Database · **Money & data integrity** (`integrity`) · Functions |
| Security | Security · **Database security** (`dbsecurity`) |
| Speed & load | Speed · **Load test** (`load`) · **Database performance** (`dbperf`) |
| Live system | **Live operations** (`ops`) · API & connectivity |
| Screens & code | Code checks · Screens & buttons |

- **Money & data integrity** — `selftest_integrity()`: every paid bill adds up to the paisa by `generate_bill`'s own
  arithmetic (total = subtotal − discount − waived + service + promise fee + CGST + SGST + round-off), CGST = SGST,
  round-off within ₹0.50, bill and invoice numbers unique and the invoice series without gaps (GST rule 46), no zero or
  negative lines, lines added or cancelled after the bill was paid, payments above zero, unpaid bills already covered,
  void bills holding money, loyalty points negative or off their ledger, rooms booked twice for the same nights, stays that
  end before they start, negative rates and charges — and, over **every single-column foreign key between two property
  tables** (99 today, found from the catalogue, so a new table is covered without editing the test), rows that point at
  another property's row.
- **Database security** — `selftest_security()`: SECURITY DEFINER functions without a pinned search_path, master-only
  functions (admin_*, selftest_*, staff_set*, sweeps) anonymous may execute, a `using (true)` policy for anon or public on
  a table with restaurant_id, views without security_invoker, the attendance and support buckets public, key-shaped strings
  (Razorpay, Stripe, Anthropic, a JWT) in any function body, the master still on the password 0011 shipped
  (`master_password_is_default()`), more than three masters. Tables with row security and no policy are listed as the
  locked ones (reached only through functions).
- **Live operations** — `selftest_ops()`: online orders still new after 30 min, accepted and not picked up after 6 h,
  riders out 6 h, guests past check-out, reservations past arrival never marked, failed OTA syncs in 24 h, cash-ups off by
  more than ₹500 in 30 days, orders open and bills unpaid over a day, expired demos not swept — across every property.
- **Database performance** — `selftest_dbperf()`: table and index cache hit ratios (99% / 95%), foreign keys without an
  index (a warning above 10), tables over 5,000 rows read mostly by scanning, dead rows, unused indexes over 1 MB,
  connections against `max_connections`, sessions idle in a transaction, the five slowest statements in
  `pg_stat_statements` (warning over 1 s on average), the largest tables.
- **Load test** — bursts at once: 20 health checks, 10 sign-in pages, 8 `session_bundle` calls, 6 Master control loads;
  the median, 95th percentile, slowest and errors of each. Light enough for Supabase Micro; it writes nothing.
- The older suites grew: **Database** compares the server's and the database's clocks; **API** checks the service worker,
  that the support, grievance and privacy mail domains have an **MX record** (`node:dns`), and every server key the app
  reads (service role, cron, cloud URL, rate-limit secret, Resend, Anthropic); **Security** checks a nonce in script-src,
  16 tables read anonymously, an anonymous **write**, four master functions called anonymously, six signed-out screens,
  signed-out POSTs to /api/assist and /api/box/push, **CORS** (a stranger's origin is not allowed), `DINEFLOW_OTP_ECHO` off
  in production; **Speed** times 14 property screens and a cold and a warm answer; **Code checks** adds lakh grouping, GST
  halves and the IST day turnover; **Screens** adds the iPad width, tap targets under 40px on touch widths, script errors
  after load, fields without a label, images without alt, page weight (script KB, element count), 21 property screens and
  80 links.
- **Every warning and failure says what to do** — `Check.fix`, shown under the check (`[data-fix]`), in Needs attention,
  in the copied report and in the PDF ("Fix: …").
- **New and fixed**: `page.tsx` hands each suite's run before the last as name → status (`prev`); a check worse than
  then is **New** (`[data-change-tag=new]`, issues sort new first), better is **Fixed**; the overview says how many
  (`[data-delta]`), and a re-run in the page keeps the run it replaced as the comparison.
- **Tools** (`[data-tools]`): *Find a check* across every suite (`[data-search]`, results `[data-search-results]` with each
  check's suite as a button), **Re-run issues** (only the suites with warnings or failures, `[data-rerun-issues]`), **Copy
  report** (plain text: the score, then every issue with its fix — for a chat or a ticket), **JSON** (every check of the
  last runs).
- The route turns a suite that throws into one failing check ("The suite itself") instead of a 500, and has
  `maxDuration = 60`. The Slowest answers chart leaves out the deep scans (they read the catalogue, not a screen).
- **Before you edit:** keep every suite read-only. The four 0142 functions are master-only (`is_platform_admin()`), pin
  search_path, set their own statement timeout and refuse anon execute. A new check that counts something belongs in the
  SQL function; its words, level and fix belong in the route.


**Acting as.** `admin_act_as` puts a master inside one property; the rest of the app then behaves
exactly as that property's owner sees it, with the amber `MasterBanner` across the top saying so.
`admin_stop_acting` steps back out. **Everything done while acting is real and is logged** to
`admin_log` — that is what makes the feature acceptable at all. **It belongs to one sign-in**
(0095, 2026-10-13, see [data-and-rls.md](data-and-rls.md)). The same Master account can be inside
manoooo on the iPad and inside Tan Resort on a laptop. Open or Back on one never moves the other.
It used to be one value per account, and a menu tap on one device bounced to Master control
whenever another sign-in — a browser test among them — opened or left a property.

**Support** (`/admin/support`, the fifth tab, between Compliance and Testing): every Help & support request from
every property — counters, filters, the thread with replies and internal notes, status and priority, consent, and a
way into the property. The tab carries a red count of requests whose latest word is the property's and unread
(`admin_support_badge`, read in `app/admin/layout.tsx`). See [help-and-support.md](help-and-support.md).

**Module switches.** `master_set_modules` sets a property's `enabled_modules`, the third filter in
`modulesFor()` (see [shell-and-nav.md](shell-and-nav.md)). A property that opens a screen it is not
entitled to lands on `/dashboard?locked=1` and gets the "not switched on for this property" card.

**Membership.** `admin_issue_key` mints a key, `redeem_membership` on `/membership` turns it into a
live membership with an end date. `admin_set_membership` sets one directly. Expiry is what the trial
banner and the lockout read.

**Deleting a property** goes through `admin_delete_preview` first — it says exactly what will go —
and only then `admin_delete_property`.

**`install_sample_estate`** builds a whole demo estate; `sweep_expired_demos` clears sandboxes.

**App files by link (0129, 2026-10-20).** Supabase Free caps an upload at 50 MB and the Windows installer is ~78 MB, so
each card also has **or paste a download link** (`[data-app-file-link]`, `[data-app-file-link-open]`, `-url`, `-version`,
`-size`, `-publish`): a public https link ending in the platform's extension (the owner keeps the .exe on Cloudflare R2 —
docs/install-builds.md), the version read from the link's file name, an optional size in MB. `app_release_publish_link`
checks Master control, https and the extension; the row has `external_url` instead of `file_path`. The history says
Link or Uploaded; **Make current** works for both. The install screens hand a link out as it is
(`lib/installers.ts`, which reads `select=*` so it works before and after 0129).

**App files (`/admin/app-files`, 0128, 2026-10-20 — the owner: "simple and easy options to update").** The Android
`.apk` and Windows `.exe` every install screen offers. One card each: the current file (version, size, date, Test
download), a drop zone (`[data-app-file-drop]`, `[data-app-file-input]` accepts only that extension, ≤ 100 MB),
Version (read from the file name, must be new — `[data-app-file-version]`), optional notes, **Upload**
(`[data-app-file-upload]`), real progress (`[data-app-file-progress]`) and the result (`[data-app-file-msg]`), and
Earlier uploads with **Make current** (`[data-app-file-rollback]`). The upload goes **from the browser straight to
Storage** (XHR to `/storage/v1/object/app-files/<platform>/<name>` with the master's session — supabase-js reports no
progress, and a Vercel function refuses bodies over 4.5 MB), then the `publishRelease` action calls
`app_release_publish`, which checks `is_master()`, that the object is really in the bucket, the extension and that
the version is new. Storage's refusals are turned into sentences — above all the project-wide **Upload file size
limit** (Supabase → Storage → Settings, 50 MB by default; the Windows file is ~78 MB): raise it to 100 MB once. The
tab is the sixth in `AdminNav` (three across on a phone, six from `sm`). How to build the files:
[docs/install-builds.md](../install-builds.md).

## Before you edit

- **The overview warns while the master login still uses its shipped password** (0098,
  2026-10-13). `master_password_is_default()` bcrypt-checks the caller's own hash against the password
  0011 created it with (that password is in the repository); while true, a red `[data-default-password]`
  notice above the title opens *Change the master password* (stacked under the text on a phone). The
  sheet no longer prints the shipped password. On 2026-10-13 the live master login still used it.
- **`page.tsx` reads in the order it names them.** `access` (restaurants: id, enabled_modules, code)
  and `boxes` (`admin_box_status`) were destructured the other way round, so property codes never
  showed under the names, the Access sheet opened without the property's modules, and the *On a Box*
  filter counted nothing. Fixed 2026-10-13; `sec98.mjs` checks every code is shown.
- **Sample estate passwords** (0099): each new owner gets its own generated password, shown once in
  the sheet (*Copy all logins*); a login that already existed keeps its password and shows *unchanged*.
  They used to share one password printed in the repository's guides.
- **`sweep_expired_demos` is master-only** (0098) — it deletes sign-ins. The overview still calls it;
  "Try a demo" no longer does (`create_demo_sandbox` sweeps itself).

- **On an iPad Master control scrolls in its own frame** (2026-10-13). Its layout is not the app's,
  so the page scrolled and WebKit rubber-banded past the end of every screen: Testing showed a dark
  band under the last card. The root is `.admin-frame`. Under the same `@media` as the app's frame,
  html and body are locked, and the frame is `height: 100dvh; overflow-y: auto;
  overscroll-behavior: none`. It always has a pixel to scroll — an absolute 1px `::after` at
  `top: 100%` — so a short page (Compliance) takes the swipe too. `DeckScroll` (mounted here as
  well) keeps its place on back and forward. The pages' first levels carry `scroll-margin-top:
  100vh`, so a new page opens at its top. A mouse screen still scrolls the page.
  Probe: `fivefix.mjs`.
- **Testing's property screens need the master inside a property.** `/dashboard` and the rest
  redirect a master who is not acting, so Speed and Screens skip them with a note until *Open* is
  pressed; Functions does not — `selftest_functions` sets and restores the context itself. Keep the
  suites read-only: a test that writes tenant data is not a test. The browser suite's frames rely on
  `X-Frame-Options: SAMEORIGIN` / `frame-ancestors 'self'` — tightening either to DENY breaks it.


- **Open and Back are plain form posts, in the same tab.** *Open* posts the property id to
  `/admin/open` (route handler → `admin_act_as` → 303 `/dashboard`; a refusal comes back as
  `/admin?error=…` and shows at the top of the list, `[data-open-error]`). The banner's *Back to
  Master control* posts to `/admin/leave` (`admin_stop_acting` → 303 `/admin`). Both redirect with a
  **relative** `Location` so the browser never changes host. Why: acting-as is per sign-in (since
  0095; before that one value per account), and the tabs of one browser share a sign-in — Open used
  to open a new tab, which silently switched the first tab's property, and Back in one tab broke
  the other; on an installed iPhone app a new tab opened in Safari without the
  app's sign-in. And as onClick handlers both waited for hydration, so a tap in the first second was
  lost — "sometimes it doesn't work". Probe `mc.mjs` (6): five instant-tap round trips, same tab,
  ~0.6–1.0 s each way.


- **The Master control header is two rows on a phone**: shield, brand + email (truncating) and a
  40px sign-out on the first; `AdminNav` (client, `usePathname` + `useSearchParams` in a `Suspense`)
  as a 3-up tab bar on the second, the current section filled. One row from `md`. As a single line
  it ran 13px off a 390px phone and pushed sign-out out of reach. Tab icons drop below 420px so
  "Compliance" is not truncated.
- **The console is dense on purpose with a mouse (30–36px); under `pointer: coarse` its tabs, chips,
  search, actions and row Open/menu reach 44px** (`AdminToolbar.module.css`, `RowActions.module.css`).
- **The five figures above the toolbar fill every row** (`AdminToolbar.module.css` `.stats`, `[data-admin-stats]`,
  2026-10-24, the owner: "the bottom card must fill that empty space"). Two across left "Clients' sales today" alone
  beside a hole. Now a phone is 2 + 2 + the last full width, an iPad 3 + 2 halves (a six-track grid), a desktop 5 in a
  row. `pw/view93.mjs` checks each row starts and ends on the grid's edges at all five widths.
- **The estate: a table from an iPad up, cards on a phone, and a Table / Cards switch** (`PropertyCards.tsx`,
  `[data-estate-view]` at the end of the filter row; 2026-10-24, the owner: "ultra modern, user friendly", then "desktop
  to iPad must be the table by default, with a card / table toggle"). With no choice made, CSS picks by width — the table
  from 768px, cards below — so the first paint is right; a choice is kept on the device (`df-estate-view`) and wins at
  every width. The shared DataTable's phone mode (MEMBERSHIP / TODAY in caps down the left) is left for the other
  screens. Each **card**: the type icon in the status colour (a blue mark on its corner when it runs on a Box), the name
  (one line, …), code · type · users (one line, …), the status badge with the days left (red at 2 or fewer), a tray of
  Today / 30 days / Live (open orders, or rooms in use for a hotel or resort), and Open + ⋯ across the foot
  (`RowActions fill`, 44px). 1 across on a phone, 2 from 700px, 3 from 1100px, 4 from 1500px; 20 at a time with Show
  more. Card sums are a glance — ₹48,251, ₹12.8 L, ₹1.2 Cr, the exact sum in the title (`formatINR's whole` only drops
  ".00", so it rounds first). The **table** (`.estateTable`): Open at full strength (not the shared .55-until-hover);
  between 641 and 1179px Live and Users step out and a long name ends in … — with them the row ran 58px past an iPad
  and Open and ⋯ sat behind a sideways scroll. Its own "Search…" is gone: the toolbar's Find and chips filter both views.
  Probes: `pw/cards92.mjs` (52 — the cards in five themes, 360, 412, 834) and `pw/view93.mjs` (68 — the real AdminClient
  bundled with stand-ins for its actions and router, at 1920 / 1440 / 1194 / 834 / 412: the default per width, the
  switch, the choice across a reload, the table fitting with Open on screen).
- **A property's ⋯ menu is a sheet on a phone** (2026-10-24, the owner's iPhone: it hung off the ⋯ half over the next
  card, the name right-aligned and the items left). Under 640px `place()` does nothing and `RowActions.module.css` pins
  it 12px from each side above the home bar, the page dimmed, name and rows on one left edge, rows 56px+. With a mouse
  it is still the 268px menu under the ⋯; `text-align: left` because it renders inside the right-aligned actions cell.
  The rule that sets Delete apart is drawn above it (it was under). Probe: `pw/rowmenu91.mjs` (22 checks — a stand-in,
  as /admin needs the master login).
- **Compliance totals are compact rows on a phone** (label left, figure right), cards from `sm`.
- **The full-record sheet** (`PropertyDetail.tsx`) is a header card (type icon, name, type · logins ·
  records, Copy all) then one `Panel` per section — title, "N of M filled in", Edit and Copy in its
  header strip. Each `Row` is its own container: label over value below 28rem of card, side by side
  above. **Values must wrap**: `.num` is `white-space: nowrap` (globals), and a UUID set in it ran 40px
  out of the sheet on a phone — identifiers (id, slug, login, GSTIN, PAN, FSSAI) use the sans face,
  `break-all`, and a copy button; and `font-mono` is Oswald in this theme, not a monospace. Any ISO
  timestamp reads as an IST date; empty reads "Not set". Buttons are 36px, 44px under a finger.
- **The status filter is five tiles on a phone** (`@container (max-width: 560px)` at the end of
  `AdminToolbar.module.css`): one row, `repeat(5, minmax(0,1fr))`, count large over a short name (All
  · Active · Trial · Expired · Box), the colour as a corner dot and a 3px bottom bar on the one that is
  on; the "N properties / N of M shown · Clear" line sits above them. They were wrapping pills, two
  rows over one. Each button carries `aria-label="<full label>, <count>"` because on a phone its full
  label is hidden and the short one is `aria-hidden`. iPad and desktop keep the chips.

- **The membership status line is prose, not a flex row.** As `flex items-center` every text run
  became its own column ("Active / . / Yearly / plan · renews by"). The "2 months free" pill wraps
  under "Yearly" rather than leaving its card.

- **Every admin RPC must check `is_master` inside the function.** The route being under `/admin` is
  not a permission.
- **Acting-as must stay visible.** Never suppress `MasterBanner`, and never let a test leave a
  session acting — every suite here ends with `admin_stop_acting` in a `finally`, **called with the
  suite's own sign-in** (since 0095 it steps out only the sign-in that calls it; a fresh token's call
  steps out nothing), and then signs that sign-in out (`/auth/v1/logout`).
- **A delete is irreversible.** The preview step is required, not a nicety.
- **A master's own password reset for a property (`admin_reset_property_password`) is a serious
  capability.** It is logged; keep it that way.
- **`/about` is the in-app version/credits page**, not marketing. Keep it factual.

## Not built yet

Razorpay **subscription** checkout on `/membership` — DineFlow charging a property for its own
membership — is designed but not implemented, and is blocked on the seven blanks in
`lib/company.ts` (see [legal.md](legal.md)). Note the distinction: a property's *guests* pay on the
property's own keys; a property pays DineFlow on DineFlow's.

## Verify

```
node audit-isolation.mjs    # acting-as must not widen what a tenant can reach
pnpm --filter @dineflow/web typecheck
```

Act as a property, confirm the banner, do something, confirm the `admin_log` row, stop acting.

## See also

[auth-and-session.md](auth-and-session.md) · [shell-and-nav.md](shell-and-nav.md) ·
[legal.md](legal.md) · [data-and-rls.md](data-and-rls.md)
- **Short copy** (2026-10-23): /membership and /about subtitles and hints cut to a few words.
- **Properties' Table · Cards is the app's ViewSwitch (2026-10-25)** (`[data-estate-view]` holds `[data-view-switch=estate]`;
  `df-view:estate`, the old `df-estate-view` read as pinned). The `.view` / `.viewBtn` rules in AdminToolbar.module.css are
  no longer used.
