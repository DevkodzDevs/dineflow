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
each card also has **Paste a link** (`[data-app-file-link]`, `[data-app-file-link-open]`, `-url`, `-version`,
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

## Paying DineFlow online, and the plans (2026-10-29, 0151/0152 — items 8 and 10)

**Plans & prices** (Master control → Keys, under the keys — `PlansCard.tsx`, `[data-plans]`): one row a kind of property —
**Restaurant** (restaurants) and **Hotel & resort** (hotels, resorts) — with a monthly and a yearly price (empty = not sold
online for that period) and an on-sale switch; `admin_set_plan` (master only, logged in admin_log). Seeded at ₹2,499 / ₹24,999
for both — the cheaper restaurant plan is the owner's number to type. /membership (its two cards, "N months free" worked out)
and the public front page (site.md) read them; a key's length is separate (30 / 365 days).

**Online payment** on /membership, on **DineFlow's own** Razorpay account (a guest pays a property on the property's keys —
that is lib/razorpay.ts and /pay): **Pay ₹X** on each card for the owner or a manager when the server has
`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` **and** `SUPABASE_SERVICE_ROLE_KEY` (`platformReady()`,
lib/platformPay.ts); without them the page is as before (keys and the support line). `/api/membership/order` →
`membership_checkout_begin` (the price is the plan's, never the browser's) → a Razorpay order for that amount →
`membership_checkout_order`. `/api/membership/verify`: the HMAC of "order|payment", the order is a membership order, the
payment is that order's and captured (an authorized hold is captured first) → `membership_paid` (amount = price; extends from
today or the current end; twice = once). `/api/webhooks/razorpay-platform` (payment.captured, signed with the webhook secret)
is the safety net. **Not run end to end here** — no Razorpay test keys or service-role key on this machine; the database side
is dry-run, the page with prices is `plans151.mjs`. The Plans card could not be opened without the master sign-in. A GST
invoice from DineFlow for the subscription needs the company's GSTIN (legal.md, item 11).

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
- **Crashes people saw (2026-10-29, 0149).** Master control → Testing, under the suites (`CrashList.tsx`,
  `[data-crash-list]`): the last 7 days of `client_errors`, newest first — *Crash* (red, a bug) or *Old tab* (amber, open
  across a deploy; it reloaded itself), the error's name and message (or the server's reference), the page with ids folded
  to `:id`, the property (or "a guest page"), the browser and device in a few words, how many times and when last. The same
  error on the same page within a day is one row with a count. Only the master can read the table; anyone's page writes
  it through `report_client_error` alone (30 an hour per person, 2,000 an hour in all; 30 days kept). A tab of its own was
  left out on purpose: the nav's row of seven stays as it is.
- **Shorter copy (2026-10-29, the owner: "maximum 3 or 4 words, try 2 or 3 — clean and neat").** Subtitles, hints, helper
  lines and empty-state hints cut to two–four words, or removed where they said the obvious. Error and refusal messages,
  steps to follow outside the app, printed and exported text, WhatsApp bodies and tooltips were left as they were.
- **The full record shows only the owner (2026-10-30, the owner: "staff details belong to the owner's and manager's pages").**
  `propertyDetail` keeps only `role = owner` users on the server — staff login IDs, emails and temporary passwords never reach the
  master's browser; a `staff_count` comes instead. The panel is **Owner login(s)** (`[data-owner-logins]`), "N staff logins · in
  the property's Staff screen"; Copy all copies the owner part and the count. **Fixed with it:** `admin_reset_property_password`
  always resets the first owner, but every user card had the reset button — pressing it on a staff card reset the owner's password.
  Only the first owner's card has it now. (The support ticket still shows who raised it — left in place.)
- **Copy one value at a time:** the reissue result, Manage → Owner login → New temporary password and the new-property result copied
  "id / password" together, and pasting into Password put both in. Each now has **Copy password** (`[data-copy-password]`), **Copy
  ID** (`[data-copy-id]`) and a separate, labelled **Copy both** (`[data-copy-both]`, two labelled lines).
- Suspend and the support desk's delete-screenshot / open-anyway now ask in the app's dialog (`ask`).

## Flow tests (2026-11-02, 0161 — the owner: "the testing flow as a complete automatic testing tool")
- **Where:** Master control's top bar → **Flow tests** (`/admin/flow-tests`, `AdminNav`, after Testing). Four ways in
  (`[data-mode]`): **Full application** (every flow, then every page for a restaurant and a hotel — also the head's
  *Start full test*, `[data-start-full]`), **By menu section** (one heading of the menu — its pages and the flows under it,
  `GROUP_FLOWS`), **By flow** (Sign-in & roles · Order · Billing · Cleaning & work · Room booking · Table booking · Guest pages ·
  Security & money — the stages of the *DineFlow — Full Application Testing Flow* document) and **One page** (any app page,
  on a restaurant or a hotel; a page one kind lacks cannot be picked for it).
- **How it runs:** `lib/flowtest/catalog.ts` is the one list (flows, steps, `PAGES` from `sections.ts` `ITEMS` / `freshFor` /
  `endFor` under `MENU_GROUPS`, `planFor(mode)`). The screen calls `POST /api/admin/flowtest` once per step (`{ op: "step", id,
  ctx }`), so no request nears the host's limit and each result shows as it lands; then `finish` (sweep) and `save`
  (`selftest_runs`, suite `flow:<mode label>` — Testing's page leaves `flow:%` out). Each run makes **two throwaway demo
  properties** (`create_demo_sandbox`) and their staff (waiter, chef, cashier, cleaner; front desk, room attendant) through the
  owner's own `staff_create_login`, and works as them through the screens' own functions — `place_order`, the kitchen's
  status writes, `generate_bill`, `void_bill`, `settle_bill`, `issue_credit_note`, `clean_take` / `clean_assign` /
  `clean_auto_assign`, `create_booking`, `check_in`, `post_order_to_room`, `check_out`, `run_night_audit`,
  `reservation_set` — checking each result in the tables (the bill's arithmetic to the paisa, the table freed, the ticket off
  the pass …). Pages are fetched from the same deployment with the demo person's session cookie, redirects followed (HTTP and
  Next's meta refresh), and fail on a 5xx, the error screen or landing somewhere else; over 2.5 s is a warning.
- **The master's part** is `flowtest_admin(op, rid, ref)` (0161): `prepare` (every section on, cleaning and the 5-minute hand-out
  on, named *Flow test · Restaurant/Hotel*), `staff` (no forced password change), `free_table`, `age_job`, `finish` (expire and
  sweep — the logins go too). It refuses anything but a demo property and anyone but the master. A run left midway is swept
  when its demo expires (8 hours); the screen asks before the tab is closed while one runs. Ten demos an hour is the platform's
  limit — a run uses two.
- **Not covered by a flow test:** what happens only in a browser (the client-side sign-in hand-off, layout at widths, gestures) —
  the scratchpad browser suites keep those (testing-and-gates.md); and the live properties' own data, which it never touches.
- **Flow tests and 0166 (2026-11-03):** *Order flow* starts on free tables nobody is cleaning; *A second round on the same table* now
  checks that a second `place_order` is refused ("A busy table takes no second order"), adds the round with `order_add_items` and
  splits it off with `split_order` for Billing's void step. The hotel's meal for the folio picks a table that is not being cleaned.

## Data (2026-11-05, 0172 — the owner: "our own storage, database, files, backups and data handling, linked to Master control, a menu in the top bar; mostly free — anything paid finished with a test")
- **Why:** the live project is on Supabase **Free**, which keeps **no backup at all** (App files' own code says so: "Supabase Free will not
  take 50 MB a file"). DineFlow now keeps its own.
- **Where:** top bar → **Data** (`/admin/data`, `AdminNav`, after App files — eight tabs, four to a row on a phone). Master only:
  `requireAdmin` on the page, `is_master` in `api/admin/data`, and every 0172 function checks for itself.
- **Files:** `app/admin/data/page.tsx` reads `data_overview`, `data_server`, `data_settings_get` and `data_backups` (and times those four
  calls — the Server tab's *Answer time*); `DataClient.tsx` (the protection strip, the six tabs, Storage, Server, `BackupNow`),
  `BackupsPanel.tsx` (Backups, Restore), `CarePanel.tsx` (Clean-up, Off-site & plans), `bits.tsx` (`api()`, `when`, `useNow`, Meter, Tile,
  Panel, Note, Spark), `actions.ts` (`saveDataSettings`), `Data.module.css`. The engine is `lib/backup/`: `format.ts` (the file),
  `plan.ts` (restore order, what to prune), `s3.ts` (Signature V4 by hand — no SDK), `supabaseApi.ts` (Supabase's Management API, the plans),
  `providers.ts`, `bytes.ts` (the two a client may import), `run.ts` (server-only: backup, check, prune, delete, off-site, restore).
- **The strip** (`[data-data-guard=ok|warn|bad]`): *Data is backed up* (newest full backup under 30 h and checked) / *Last backup n days ago* /
  *No backup yet* / *The last backup failed its check*; then last backup, nightly, off-site, last download — and **Back up now**.
- **Storage:** database against Free's 500 MB, files against 1 GB, rows, sign-ins; growth from `storage_snapshots` (one row a day, written by
  `data_overview`) with "full in about n days"; the ten biggest tables (*Show all*); each property's rows and its share of each table's bytes;
  the buckets; the largest files; space by schema.
- **Backups:** nightly switch (says *Waits for CRON_SECRET and SUPABASE_SERVICE_ROLE_KEY on Vercel* until both are set), keep the newest
  3–60 (default 14), stored files in or out and how many MB of them; *Download the newest* with a weekly nudge; the list with **Download**
  (a 10-minute signed link; remembered as `last_download_at`), **Check**, **Off-site** (when set up) and Delete (asks); **Export one property**
  (its rows from every table and its own files, with keys, tokens, codes and passwords left out — `SECRET_COLUMN`).
- **The file** (`format.ts`): gzip of newline JSON — header, each table in pages of 2 000, the sign-in list (no password hashes), the stored
  files as base64 (each under the cap, the lot under the cap; the rest listed as *skipped*), a footer with every table's rows and SHA-256.
  The file's own SHA-256 is in `data_backups`. **Check** re-reads the file and proves both. `data_settings` is never exported (its secrets).
  At 2026-11-05: 116 tables, 52 561 rows, 2 files — 21.6 MB of JSON in a **3.5 MB** file, **20 s**. Supabase Free takes 50 MB a file; past
  that the run says so (lower the files cap or turn files off).
- **Restore** brings back **missing** rows only: open a backup, tick tables, *See what is missing* (it adds the tables they depend on, marked
  *needed*), type **RESTORE**, *Bring back n rows*. A row that is there is never changed or deleted. Rows go back with their own ids, numbers
  and dates; the table's triggers are switched off for the call so stock, tickets and totals are not run twice; foreign keys stay checked.
  Never restored: sign-in state, codes, throttles, the migration list, `platform_admins`, the backup tables. Each restore is in `admin_log`.
  A whole-database disaster restore is not this — that is Supabase Pro's dashboard, or a new project from the file.
- **Server:** connections of max, cache hits, answer time, uptime, longest query, deadlocks, rollbacks, temp files, transaction-ID age, unused
  indexes, statement timeout; who is connected; tables with dead rows; the slowest statements (`pg_stat_statements`).
- **Clean-up:** seven rules with a preview count and their own minimums (`data_cleanup`): print jobs (≥ 7 days — 5 132 sat *queued* on
  2026-11-05, 5 038 of them over 30 days), self-test runs, crash reports, scan log, channel sync log, used codes, throttle hits. *Clean* /
  *Clean all* ask first; *Every night* runs a rule after the nightly backup. Never cleaned: bills, orders, payments, invoices, stock, guests,
  bookings, staff, the audit trail, Master control's log.
- **Off-site & plans:** what is free and what is paid (Supabase Free / Pro $25 / point-in-time); the off-site store — Cloudflare R2 or
  Backblaze B2 (free to 10 GB), Amazon S3 (paid) or any S3-compatible — with **Test connection** (writes, reads back and deletes a test file,
  each step timed) and *Copy the newest now*; a Supabase access token with **Test** (`GET /v1/projects/{ref}/database/backups` — on Pro it
  lists the daily backups; a bad token is told apart from no backups). Buying Pro is done in Supabase's dashboard, not here.
- **Before you edit:**
  - **No `toLocaleString` or `Date.now()` in render here.** `when()` builds India time by hand and "ago" counts from `overview.at` until the
    page has mounted (`useNow`) — otherwise the server and the browser write different text and React throws #418.
  - A secret (the off-site key, the Supabase token) is written by `data_settings_set` and read only by `data_secrets` on the server; the page
    gets "set" and its last four. A blank box keeps it; *Forget* / *Remove* clear it. The settings log never holds one.
  - A backup is one request (`maxDuration` 300). If it ever nears that, page it across requests rather than raising the limit.
  - Restore takes the table's lock for its call (500 rows) — fine for a deleted order; do not run a big one in the dinner rush.

## Data → Servers (2026-11-05, 0173 / 0174 — the owner: "three kinds — our own server, my laptop, outside like Supabase; a Server connection button; a warning before the change; add, delete, copy, backup perfect; a dashboard and controls for each; an AI option")
- **The idea.** The live database always stays on Supabase. A *server* is a machine that keeps DineFlow's backups: your own
  server, your laptop, or the cloud (Supabase's own storage). The **Server connection** (top right of every Data page,
  `[data-server-connection]`) says which one Back up now, the nightly and Restore use; picking another asks first (`ask`,
  danger tone) and is logged (`data_server_switch`). Whichever is not connected keeps what it has.
- **Data is now routes, not tabs** (`app/admin/data/layout.tsx` → `DataShell`: a rail on ≥1100px, a chip row below): Overview ·
  Servers · Backups · Records · Restore · Database health · Clean-up · Outside copies & plans · Advisor. `?tab=` is gone.
- **The node** (`public/data-node/dineflow-data-node.mjs`, served at `/data-node/`, with `install-windows.ps1` and
  `install-linux.sh`): one file, Node 20+, nothing to install. It opens no port and never holds the database password — every
  minute it POLLS `data_node_call(token, fn, args)` (anon, by token), takes the commands Master control queued (backup, verify,
  delete, prune, restore, restore_preview, report), does them, and reports back with its inventory and a machine report (host,
  OS, disk, memory, uptime). It backs up straight from the database by token (the same file format as the cloud's — `format.ts`
  ported), writes to its disk (`DINEFLOW_NODE_DIR`, default `./dineflow-backups`), checks the file after writing, runs its own
  nightly at 02:00 on its clock while `nightly` is on and it is not paused, and prunes to its keep count. Settings in a `.env`
  beside it. `--check` says whether it connects. On 2026-11-05 a full backup from this laptop took **9 s** (3.53 MB).
- **Servers** (`/admin/data/servers`, `ServersClient`): three sections — Own server, Laptop, Outside · Supabase — each server a
  card (online/offline/never connected, backups, last backup, disk free with a meter, machine, Dashboard, Connect). **Add** asks a
  name, makes the server and shows the **token once** inside the setup steps (`Setup.tsx`: Node, download, the `.env` to copy,
  the installer command, come back). `?add=laptop|own` opens it (the dialog's Add links).
- **A server's dashboard** (`/admin/data/servers/[id]`, `ServerDashboard`): hero (status, machine, node version), tiles (disk,
  files held, memory, up for), **Controls** (nightly, keep 7–365, pause, name, note), **Actions** (Back up now, Check every file,
  Prune, Fresh report, Restore from here, Rotate token, Setup, Remove — Remove needs `confirm: "REMOVE"` in the route and leaves
  the files on the machine), **Files on this server** (Restore / Check / Delete each), the **Job log**. A job is queued and the
  page polls `command` every 2 s (`useCommand`); an offline server's jobs wait. The cloud's dashboard shows its own controls and
  the database health instead.
- **Backups** shows the connected server's: the cloud's as before; a node's files with Back up now, Check all, Export one property
  (kept on the node), Restore / Check / Delete. **Restore** from a node (`NodeRestore`): the table list comes from the backup
  record's manifest; *See what is missing* queues `restore_preview`, RESTORE queues `restore` — the node reads its own file and
  sends rows through the gateway, which accepts only the tables that command named.
- **Records** (`/admin/data/records`): every backup on every server (`data_records`) — when, what, server, size, rows, state
  (checked / check failed / file gone / outside copy) — with search, server, kind and state filters and a CSV; then **Activity**
  (`data_activity`: the `data_*` rows of admin_log, in words, with who).
- **Advisor** (`/admin/data/advisor`, `lib/backup/advisor.ts` + `advisor-rules.ts`, `api/admin/data/advisor`): findings from
  rules over the whole picture (no backup / stale / check failed; the cloud's nightly off or waiting for Vercel keys; a node
  offline, paused, nightly off, disk under 10%, failed jobs, not seen for two days; backups in one place; no download for a week;
  database past 80% / 95% of Free; over 1 000 rows to clean; damaged records; health — cache, connections, XID age), serious first.
  A question is answered by Claude (`askJson`, effort medium, the facts and findings as the brief) when `ANTHROPIC_API_KEY` is
  set, else from the rules (`rulesAnswer`: safety, servers, space, clean-up, last night, or the findings in order). It only reads;
  every step is a link to a screen. Six suggested questions.
- **Before you edit:**
  - A node refusal is **returned** (`{error}`), not raised — an exception would roll back the hit that counts a wrong token
    (sixty in ten minutes close the door). The node treats `{error}` as a failure.
  - `data_node_call` sets `dineflow.node` for the call and clears it before returning; `_data_caller()` and `data_restore_rows`
    accept it. A node may restore only through a taken restore command naming the table.
  - A deleted or pruned file leaves the inventory and its record at once (the `done` of delete/prune, or 0174's `deleted` in the
    next poll for the node's own nightly prune).
  - Twenty jobs waiting on one server is the cap; a job taken over an hour ago and never finished is failed at the next poll.
  - The nightly on the cloud still needs `CRON_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` on Vercel; a node's nightly needs neither.
