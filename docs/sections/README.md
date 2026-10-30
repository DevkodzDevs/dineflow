# Section notes — read one before you edit

Every screen in DineFlow has a note in this folder. **Open the note before you open the code.**
It tells you what the section is for, what it reads and writes, and which specific things have
already gone wrong there — so you do not rediscover them.

Each note is short on purpose. If a note ever disagrees with the code, the code is right and the
note is a bug: fix the note in the same commit as the change that outdated it.

---

## Find your section

| If you are editing… | Read |
| --- | --- |
| `app/(app)/dashboard/**` | [dashboard.md](dashboard.md) |
| `app/(app)/orders/**` (incl. `orders/new`, the till), `app/(app)/tables/**`, `app/kiosk/**` | [orders-and-till.md](orders-and-till.md) |
| `app/(app)/kitchen/**` | [kitchen.md](kitchen.md) |
| `app/(app)/menu/**`, `components/menu/**`, `lib/dishPhotos.ts` | [menu.md](menu.md) |
| `app/(app)/billing/**`, `app/(app)/invoices/**` | [billing-and-invoices.md](billing-and-invoices.md) |
| `app/(app)/frontdesk/**` | [front-desk.md](front-desk.md) |
| `app/(app)/rooms/**`, `app/(app)/reservations/**`, `app/(app)/facilities/**` | [rooms-and-reservations.md](rooms-and-reservations.md) |
| `app/(app)/housekeeping/**` — Room status (the menu's name since 2026-10-30) | [housekeeping.md](housekeeping.md) |
| `app/(app)/cleaning/**` — tables and rooms after every guest, who took them | [cleaning.md](cleaning.md) |
| `app/(app)/work/**` — every job on the property, routed to its department; `cleaning/JobCard.tsx`; `app/(app)/work-records/**` — the owner's and managers' record | [work.md](work.md) |
| `app/(app)/guests/**`, `app/(app)/customers/**` | [guests-and-customers.md](guests-and-customers.md) |
| `app/(app)/inventory/**` | [inventory.md](inventory.md) |
| `app/(app)/staff/**`, `app/(app)/labour/**`, `app/(app)/attendance/**`, `app/attend/**`, `lib/attendance.ts`, `components/attendance/**` | [staff-and-labour.md](staff-and-labour.md) |
| `app/(app)/online-orders/**`, `app/(app)/channels/**` | [online-and-channels.md](online-and-channels.md) |
| `app/(app)/connections/**` — every outside link in one page, the owner's; `app/track/**`, `app/ride/**` — the customer's and the rider's delivery pages | [connections.md](connections.md) · [online-and-channels.md](online-and-channels.md) |
| `app/(app)/reports/**`, `app/(app)/pulse/**`, `app/(app)/tomorrow/**`, `app/(app)/proof/**` | [reports-and-forecast.md](reports-and-forecast.md) |
| `app/(app)/settings/**` | [settings.md](settings.md) |
| `app/(app)/expenses/**`, `app/(app)/tasks/**` | [expenses-and-checklists.md](expenses-and-checklists.md) |
| `app/(app)/chain/**`, `app/(app)/payroll/**`, `components/shell/OutletSwitcher.tsx` | [chain-and-payroll.md](chain-and-payroll.md) |
| `app/(app)/controls/**`, `app/(app)/audit/**`, `app/(app)/intelligence/**`, `components/ui/ReasonDialog.tsx` — the "Insights & control" | [controls-and-intelligence.md](controls-and-intelligence.md) |
| `app/(app)/tax/**` | [tax-and-compliance.md](tax-and-compliance.md) |
| `app/(app)/scan/**` | [scan.md](scan.md) |
| `app/(app)/neighbours/**` | [neighbours.md](neighbours.md) |
| `app/dine/**`, `app/book/**`, `app/queue/**`, `app/checkin/**`, `app/pay/**`, `app/record/**`, `app/feedback/**`, `app/screen/**`, `app/get`, `app/offline` | [guest-facing.md](guest-facing.md) |
| `app/(auth)/**`, `app/account/**`, `middleware.ts`, `lib/auth.ts` | [auth-and-session.md](auth-and-session.md) |
| `app/page.tsx` (the public front page), `app/for/**`, `app/blog/**`, `components/site/**`, `lib/site/**` | [site.md](site.md) |
| `app/admin/**`, `app/membership/**`, `app/(app)/about/**` | [admin-and-membership.md](admin-and-membership.md) |
| `app/(app)/lock/**`, `components/shell/DisplayLock.tsx`, `lib/displayLock.ts` — Display lock: a device pinned to one page | [display-lock.md](display-lock.md) |
| `app/(app)/help/**`, `app/admin/support/**`, `lib/support.ts`, `components/support/**` — Help & support | [help-and-support.md](help-and-support.md) |
| `app/(app)/voice/**`, `lib/voice.ts`, `components/voice/**` — Feedback & complaints, the staff to their owner | [staff-voice.md](staff-voice.md) |
| `app/(app)/me/**` — My profile: each person's own details, sign-in and this device | [my-profile.md](my-profile.md) |
| `app/(app)/home/**` — My day: where staff land; their work, checklists, attendance, leave and pay | [my-day.md](my-day.md) |
| `app/legal/**`, `lib/company.ts` | [legal.md](legal.md) |
| `app/api/**`, `lib/assist/**` (Assist: topics, health check, documents) | [api-routes.md](api-routes.md) |

## Cross-cutting — read these when the change is not inside one screen

| If you are touching… | Read |
| --- | --- |
| `app/globals.css`, `components/ui/**`, `lib/motion.ts`, `lib/say.ts`, `lib/service.ts` — any shared visual change, the Dining screens' colours and words; the themes; the whole app in Tamil / Hindi — `lib/i18n/**`, `public/i18n/**`, `scripts/i18n-check.mjs`, `docs/i18n-brief.md` | [design-system.md](design-system.md) |
| `components/shell/**`, `app/(app)/layout.tsx`, the sidebar, module gating, **adding a `loading.tsx`**; installing — `lib/install.ts`, `components/InstallApp.tsx`, `public/manifest.json`; speed — `lib/useLive.ts`, `lib/liveRefresh.ts`, `lib/offline/**`, `next.config.ts`, `vercel.json` | [shell-and-nav.md](shell-and-nav.md) |
| `supabase/migrations/**`, `supabase/pending/**`, RLS, any new table or RPC, `lib/scoped.ts` (the master's pinned reads) | [data-and-rls.md](data-and-rls.md) |
| Anything, before you say it works | [testing-and-gates.md](testing-and-gates.md) |

New section? Copy [`_TEMPLATE.md`](_TEMPLATE.md) and add a row above.

---

## The shape of the app, in one screen

```
apps/web/app/
  (app)/…        the signed-in app. One folder per screen:
                   page.tsx       server component — fetches, decides, passes plain data down
                   XClient.tsx    "use client" — all the interaction
                   actions.ts     "use server" — the writes, each one an RPC call
  (auth)/…       login, signup, join, forgot
  dine|book|queue|pay|record|get    guest-facing, no session required
  legal/…        terms, privacy, refunds, contact
  admin/…        the master console across every property
  api/…          webhooks, sync, health — see api-routes.md

apps/web/components/
  ui/            the kit: Button, Card, Sheet, StatTile, Flip, DataTable…
  shell/         Nav, TopBar, PageHeader, MasterBanner
  receipt/       the printed bill

apps/web/lib/    auth, supabase clients, format, print, offline, ai, razorpay
packages/shared/ constants, roles, modules, billing maths, GST — used by web and mobile
supabase/migrations/   numbered .sql files, applied in order (0001–0099)
supabase/pending/      a migration waiting for its deploy — see data-and-rls.md
```

## Five things true of every screen

1. **`page.tsx` fetches, the client component renders.** Server components cannot hand functions
   across the boundary — not a callback, not a Lucide icon. Pass names or plain data and resolve on
   the client. (This has broken the dashboard once; typecheck does not catch it.)
2. **Writes go through `actions.ts` → a Postgres RPC.** Not through table writes from the browser.
   The RPC is `security definer` with a pinned `search_path` and does its own permission check.
3. **Every table is scoped by `auth_restaurant_id()`.** A query that forgets the tenant does not
   leak — RLS refuses it — but it does return nothing, which looks like a bug. See
   [data-and-rls.md](data-and-rls.md).
4. **A property is a restaurant, a hotel or a resort,** and `modulesFor()` decides which screens
   exist. Do not assume rooms exist. Do not assume tables exist.
5. **Phones and iPads are first-class.** Every change is checked at 1920, 1440, 1194, 834 and 412,
   and every tap target is 44px on a touch screen. See [testing-and-gates.md](testing-and-gates.md).
