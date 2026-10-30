# Staff and labour

**Routes** `/staff` · `/labour` · `/attendance` (staff self-punch) · `/attend/[token]` (a labourer's own link, no sign-in)
**Files** `app/(app)/staff/page.tsx` · `StaffClient.tsx` · `StaffGrid.tsx` · `app/(app)/labour/LabourClient.tsx` ·
both `actions.ts` · `staff/StaffPositions.tsx` · `packages/shared/src/positions.ts` · `staff/StaffAttendance.tsx` · `app/attend/actions.ts` · `lib/attendance.ts` ·
`components/attendance/PunchPanel.tsx`
**Reads** `profiles`, `invites`, `labourers`, `labour_attendance`, `labour_payments`, `staff_attendance`,
`attendance_punches`, the private `attendance` bucket (selfies, signed URLs)
**Writes** `create_invite`, `owner_set_access`, `staff_create_login`, `staff_login_details`,
`staff_login_domain`, `staff_request_contact_otp`, `staff_verify_contact`, `staff_reset_password`,
`staff_set_position` (0107), `labour_punch`, `labour_mark`, `staff_mark`, `staff_punch_code`, `next_labour_code`; service role only:
`_attend`, `attendance_passkeys`, `attendance_challenges`

## What it is

Two different kinds of people. **Staff** sign in and use the app — they have a `profiles` row, a
role and a set of allowed modules. **Labourers** do not sign in; they are daily workers who are
punched in and paid, tracked in `labourers` / `labour_attendance` / `labour_payments`.

## How it works

**Roles** come from `@dineflow/shared`: `ROLE_ACCESS` says which modules a role may ever see,
`ROLE_DEFAULT` says which it gets out of the box, and `owner_set_access` records the ticks the owner
actually left for one person (`profiles.allowed_modules`). The owner sees everything their property
has enabled.

**A job's default is its own screens (2026-10-20, 0126 — the owner: "each job sees only what it needs; the internal
controls follow the job").** `ROLE_DEFAULT` (and `role_modules.default_set`) was the whole ceiling for a job role; it is
now the job's screens only — waiter: Orders, Reservations, Pulse, Customers; cashier: Billing, Orders, Invoices, Online
orders, Customers, Reservations, Pulse; chef: Kitchen, Menu, Tomorrow, Scan; store: Pantry, Scan, Tomorrow; front desk:
Front desk, Rooms, Guests, Facilities, Housekeeping, Reservations, Invoices, Customers; housekeeping: Housekeeping, Rooms;
an `employee` (guard, gardener, helper): nothing — Work and Checklists are everyone's and `homeFor` lands them on Work;
a supervisor lost Reports. Gone from the defaults: Channels, Labour, Reports, Neighbours, Front desk-for-a-cashier and
Scan for the floor. **Ceilings did not move**: the owner can still tick any of them for anyone, and their ticks win. The
position lists (`positionAccess.ts`) lost Scan for the floor and back-of-house jobs and the gardener lost Housekeeping;
the guard, cleaner, kitchen steward and maintenance helper hold no module. 0126 moved everyone still on a position list
*exactly as the Staff screen wrote it* to the narrower one; a hand-changed list was left alone (dry run `dry126.cjs`, 33).
**The Access sheet shows the real default** (`byDefault` in `StaffClient.tsx`): with no ticks it showed every ceiling
section switched on, which was never what the person opened (a supervisor's default has always been narrower).

Final visibility is `modulesFor(type, role, enabled, allowed)` — property type ∩ role access ∩ the
master's enabled set ∩ this person's ticks — the control room only for the owner, and for a manager the owner ticks it
for (the *Control room* switch in Access, owner only; [dashboard.md](dashboard.md)). See
[shell-and-nav.md](shell-and-nav.md).

**Two ways in.** `create_invite` sends a join code (`/join`). `staff_create_login` makes a login
directly with a temporary password and a short domain; the person is forced to change it on first
sign-in (`must_change_password`). Contact verification and reset run on OTP RPCs.

**Labour** is a punch clock: `labour_punch` records in/out against a labourer code
(`next_labour_code` allocates one), and payments are recorded against attendance. `/scan` can punch
a labourer from an ID card.

**The Staff page layout** *(history: the list before the cards; `[data-state]` is the facts panel now — 2026-10-20 below)*. A toolbar on top (head count, "n not signed in", "n email
unconfirmed" on the left; Invite with a code and Add staff on the right), then the list at full
width. Each person (`[data-person]`) is a grid `44px · minmax(0,1fr) · auto`: the avatar, name over
code·email·phone, and the buttons (`[data-actions]`: a key square and Access — a square on a phone,
the word from `sm`) on one line, centred together; under the name, spanning to the right edge, a
wrapping line of 28px state chips (`[data-state]`). The role and its access are one chip
("Housekeeping · default access" / "· 6 sections"); *Not signed in* (clock, orange wash), *Email
unconfirmed* (mail, red wash) and *Off* (ban, red wash) carry their own icon, and every chip's text
is `--color-label` — the hue is only the icon and the wash, so it reads in paper too. On a phone the
old pills broke into three ragged lines ("role default" on its own) and the buttons floated halfway
down the row; now it is at most two lines at 412. State can never print over the buttons. Open
invites and "Two ways in" sit beside the list from `xl` (1280) and in two cards under it below
that. Probe: `staffrow.mjs`.

## Before you edit

- **A switch sits on the right of its words, on one line, at every width (2026-10-20, the owner's "switch alignment
  placing is not good").** Access, Add staff and *Active* use `SwitchRow` (top of `StaffClient.tsx`): title over a
  wrapping description on the left (`min-w-0`), the switch on the right, centred, 64px rows with a hairline between
  (`divide-y` on the `.group`); the whole row is a `<label>` whose control is a real `button role="switch"`
  (keyboard and screen reader too — it was a bare `<span onClick>`). The Control room row is the same with an icon
  square (`[data-control-room-switch]`, the switch keeps `[data-control-room]`). **Do not put these back on
  `.group > .row`**: under 640px that rule wraps and gives the words 100%, which dropped every switch onto a line of
  its own under its description.
- **A staff card's middle is one facts panel (2026-10-20, the owner: "not good — make it modern and tidy").** The loose
  chips (role · access, a red *Email*, *Not signed in*, *Off*) and the loose code · phone · since · → manager line are
  one soft panel (`[data-state]`, `--color-fill`, 16px radius, hairline). Across its top, **Access**: a shield in the
  department's hue, the role in bold and how its sections were set as a quiet pill (*position access* / *default* /
  *6 sections · custom*; none for the owner) — `[data-access]`. Under it two even columns (`minmax(0,1fr)` each, never
  a hole): **Phone** written as it is read out (`phoneOut`: 98450 11223, +91 98450 11223), **Staff code**, **Email**
  (`[data-email-state]`: *Verified* green, *Not verified* amber with the old "cannot reset their own password" title,
  *—* with none) and **Joined** (month and year). Each is `Fact`: a 28px tinted circle, a 10.5px caption, the value
  truncating. A hairline row under them appears only for what needs saying — *Not signed in* (orange dot), *Off* (red
  dot), → their manager. Every value is `--color-label`; the hue is only in the circles and dots, so it reads in all
  five themes. The owner's own card has the same panel.
- **People as cards or as a data grid (2026-10-22, the owner: "a datagrid; a row shows that person; the job-based list in
  the grid; don't disturb the card design; desktop to iPad the grid, mobile the cards").** People has a **Cards · Table**
  switch beside the search (`[data-staff-layout]`, `[data-staff-layout-pick=cards|table]`). The cards are exactly as they
  were — their markup moved, unchanged, into `personCard(p, close?)` so the details sheet can show the same card. **The
  default is CSS, not script**: until a device picks, the cards are `md:hidden` and the grid `hidden md:block`, so every
  iPad (768 up) and laptop opens on the grid and a phone on the cards with nothing corrected after load; a pick is kept on
  the device (`localStorage` `df-staff-layout`, read after mount). **The grid** (`StaffGrid.tsx`, `[data-staff-grid]`) is
  grouped by job — a band per department (`[data-staff-group]`, its icon on its colour and a count), people under it by
  level then name — with **Group by job** (`[data-staff-group-toggle]`) — **off at first since 2026-10-23** (the owner), so the grid opens as one flat list and the toggle groups it; every column sorts
  (`[data-sort]`); the department chips and the search filter it as they filter the cards. Columns come with the room the
  grid has (container queries, so a laptop's 256px sidebar counts): Name (avatar with the state dot, the title under it)
  and **Today** always — *Off*, *Not signed in*, *On duty · 9:05 am*, *Left · 6:10 pm*, *Not in today* from today's
  `staff_attendance` (page.tsx passes it as `duty`); Department from 36rem; Level and Phone (a `tel:` link that does not
  open the row) from 46; Access (the role, and how its sections were set — `howOf`) from 58; Staff code and Email from
  78; Joined and Reports to from 90. **A row** (`[data-staff-row]`, click, Enter or Space) opens a sheet
  (`[data-staff-detail]`): the person's card (its Call / Sign-in / Access close the sheet first, then open their own),
  **Today**, **Can open** (their sections, or the role default trimmed to the property), and **Reports to / Their team**,
  each person a tap that opens them. The search row sits under the view tabs below `lg` — beside them at 834 the search
  shrank to its icon. Probe `staff67.mjs` (29). Read-only on manoooo as its General Manager, signed out after.
- **The department chips are one compact rail from md (2026-10-22, the owner: "ultra modern, compact — desktop to iPad").**
  They wrapped into two or three rows of bordered pills on a laptop or an iPad. `DeptRail` (end of `StaffClient.tsx`,
  `[data-dept-rail]`, the scroller `[data-dept-chips="rail"]`) is one row in a soft track like the view switch above it: the
  chosen chip raised on the card colour with a shadow, the rest plain words with their department icon on its colour and a
  quiet count. Past the room it slides: the edge it continues past fades (a mask on the scroller) and a round arrow sits
  there, only then (`[data-dept-prev]` / `[data-dept-next]`, 70% of the width a press); choosing a chip scrolls it into
  view. Chips are 36px with a mouse and 44px on a touch screen (`pointer-coarse:`). Below md the old row stays as it was
  (`[data-dept-chips="phone"]`); both share one `chips` list.
- **A staff card's foot has Call (2026-10-20).** Anyone with a phone on the list, except yourself, gets **Call**
  (`tel:`, green phone, `[data-call]`) as the first section, before *Sign-in* and *Access* (or alone, on a card you do
  not manage). Equal sections with hairlines (`@container`): from 19.5rem of card the icon sits beside the word,
  narrower it goes over it, so three fit a 412 phone.
- **A day labourer can be given a job (0113).** `jobs.labourer_id` — a supervisor gives it from the Work board's *Give
  to…* (labourers after the people), anyone takes and finishes it *for* them, and the done row says so. Labourers have no
  sign-in, so nothing rings for them. New positions: Plumber, Electrician, AC / Refrigeration Technician (Engineering,
  `employee`); the fixers, guards and the gardener start on `/work`. [work.md](work.md)
- **Positions are not roles (0107, 2026-10-17).** A *role* opens screens; a *position* says what someone is — department,
  title, level 1–7 (Leadership · Head of department · Assistant head · Supervisor · Senior staff · Staff · Trainee &
  helper). The catalogue is `packages/shared/src/positions.ts` (5 tests): 15 departments and ~100 titles tagged by
  property type — the Indian hotel ladder (GM → heads → assistants → supervisors), the kitchen brigade (Executive Chef →
  Head Chef → Sous → Junior Sous → CDP → DCDP → Commis I/II/III → helper/trainee) and the service brigade (F&B Manager →
  Restaurant Manager → Senior Captain → Captain → Senior Steward → Steward → busser/trainee); a resort adds recreation
  and spa, a restaurant has no front office and its Restaurant Manager heads service (`levelFor`). A resort gets 98
  positions in 14 departments. `profiles` keeps `position` (the key), `position_title` (their own), `department`,
  `reports_to`, `joined_on`; `staff_set_position` applies the access rule (rank above them, or the owner — who may set
  their own) and refuses a manager on another outlet and a reporting loop.
- **Each position opens its own sections (2026-10-17)** — job-based defaults, as Toast ("each job carries a default
  permission set … individual overrides"), Cloudbeds (suggested privileges by role) and Petpooja (a biller takes orders
  and settles bills; the manager cancels and discounts) do it. `packages/shared/src/positionAccess.ts` lists, for every
  position, the sections it opens (`null` = everything its role allows: owners, GM, managers) and its start screen —
  a Commis opens Kitchen + Scan and starts on Kitchen, a Cashier Billing/Orders/Invoices/Online/Customers and starts on
  Billing, a Steward Orders/Pulse, a Front Office Associate the front desk, a Room Attendant Housekeeping/Rooms, a
  Security Guard Scan. Every list sits inside its suggested role's ceiling (a test checks all of them), and is trimmed
  to the property kind and to what the property has switched on. **Add staff** ticks them when a position is chosen
  (`[data-position-preset]` shows them); **Access** shows what the position usually opens — green *Matches*, or amber
  with **Use these** (`[data-use-position-access]`) when the person's sections differ; a card's role chip says
  *position access*, *n sections · custom* or *default*; the **Positions guide** opens a position to its sections
  (`[data-guide-detail]`, the start screen marked with a house). **Signing in** goes to the position's start screen
  when the person holds it (`startScreen` in `app/(auth)/actions.ts`), else the control room. The "Insights &
  control" links stay role-based. Probe: `posaccess.mjs` (15).
- **The Staff page design (2026-10-17, the owner's "ultra modern").** No PageHeader: the client draws a header card
  (`[data-staff-hero]`, a soft tint glow) with *Invite* / *Add staff* and four figures (`[data-stat]`: Team, On duty
  today — `page.tsx` counts punched-in-not-out, Departments, Needs a hand = not signed in + email + no position); a
  segmented switch (People · Team chart · Positions) and a round search (name, title, code, department; 3+ digits
  search phones). **People are cards** (`[data-person]`, 1 → 2 → 3 → 4 columns at sm/xl/1700px): a 4px department
  colour strip, initials on the department's colour (`Avatar`, a dot: green active, orange not signed in, red off),
  title, department with its icon (`DeptIcon`), a level badge `L3`, a facts panel (`[data-state]`, see 2026-10-20 below),
  and *Call* / *Sign-in* / *Access* (or the owner's *Your position*) across the foot. The **chart** opens on
  *Reporting lines* (a tree from `reports_to`, connector lines) when anyone has a manager, else *By level* (a rail with
  a node per level). The **positions guide** has a search and level chips; each department is a card with its icon on
  its colour, "n filled here", and a ladder whose node is filled in the department's colour where someone holds it,
  with their initials beside it. Checked with no sideways scroll at 1920, 1440, 1194, 834 and 412.
- **The Staff page has three views** (`[data-staff-view]`): *People* (department chips with counts, rows sorted by
  department then level, the title line `[data-position-line]` in the department's colour), *Team chart* (one band per
  level, cards with "reports to"; people with no position under *Not placed yet*) and *Positions guide* (the whole
  ladder for this kind of property, indented by level, with "n here" and the access each suggests). Add staff asks
  the position first and suggests its access (`suggestedRole`, never above what the appointer may give); Access holds
  the same fields; the owner's own row has *Position*. Probe: `staffpos.mjs` (21).
- **Staff functions follow the outlet** (0107 `acting_profile()` reports the outlet this sign-in is working in). Before,
  an owner in a second outlet would have invited into, or added logins at, their home outlet.

- **Invite codes are twelve hex characters** (48 bits, 0098; were eight — 32 bits with unlimited tries).
  The join form takes up to 40.
- **`staff_verify_contact` answers a wrong code** with `{ok:false, error}` instead of raising, so the
  five-tries count sticks; `verifyStaffContact` shows `error`. Codes and temporary passwords come from
  the cryptographic generator (`_random_digits`, `gen_temp_password`).
- **`staff_login_domain(property)`** answers for the caller's own property only (Master control: any).
- **Do not put the add/invite actions back in a side column.** At 1024–1279 a 340px column and a
  row of pills could not both fit: the column slid off the screen and the pills overlapped
  ("Not signed in" printed over "Owner"). Measured after the change: 0 spills and 0 overlapping
  text pairs at 1920, 1440, 1366, 1280, 1194, 1024, 834 and 412.

- **Never change a role or a module set from the client.** `owner_set_access` checks the caller
  outranks the target; that check is the whole security model for delegation.
- **An owner cannot be demoted by a manager,** and nobody can grant a module the property does not
  have enabled. Both checks live in the RPC.
- **A labourer is not a user.** No `profiles` row, no sign-in, no RLS identity of their own.
- **Temporary passwords are enforced server-side** (`enforce_temp_password_lockout`). Do not add a
  client-side bypass for testing.

## Verify

```
pnpm --filter @dineflow/web typecheck
node toolbars.mjs        # the labour rail at 4 widths
node diag.mjs "/staff@1280|/staff@1024|/staff@412"   # 0 spill, 0 overlapping text
                         # (Git Bash: prefix MSYS_NO_PATHCONV=1 or it rewrites /staff into a path)
```

Sign in as a non-owner on a demo property and confirm the sidebar matches the ticks.

## See also

[auth-and-session.md](auth-and-session.md) · [shell-and-nav.md](shell-and-nav.md) ·
[admin-and-membership.md](admin-and-membership.md)

- **A labour card's month is a small calendar** (`MonthDots` in `LabourClient.tsx`): the month name
  and a legend, then M–S across and one 28px cell per day with its number, Monday first — solid
  green (`--color-green`, `--color-on-tint` text) on days worked, grey on days not, today ringed in
  the tint; only the weeks up to this one are drawn, so early in the month the card stays short. It
  was 31 thin dark-grey bars with no numbers, unreadable on a dark card. Cells use `rounded-[8px]`
  (`rounded-lg` is 22px in this theme and turned them into pills). Probe: `lab.mjs` (4 checks; marks a
  worker present and restores their attendance).
- **The squares beside *Mark present* / *Mark absent* are the main button's height** (2026-10-13):
  *Pay* (`[data-pay]`, banknote) and, when a phone way is on, *Punch link* (`[data-punch-link]`). They
  are 40×40 with a mouse and 44×44 on touch, with a 20px icon on the grey `outline` fill. They were
  14px icons on a bare `ghost` button — the owner could barely see them on an iPad. They use the
  default size with `!h-10 !w-10 !px-0 !rounded-xl`, **not `size="sm"`**: sm's `!px-4` beats `!px-0`
  and squeezes the icon. The touch floor (`.btn` min-height, the icon-only min-width) makes them
  44×44. Probe: `labicons.mjs`.
- **The month calendars can be hidden** (2026-10-13). They are shown by default. A *Month calendar*
  switch (`[data-cal-toggle]`, a 44px `Switch` row right-aligned above the cards) hides every card's
  `MonthDots` and leaves the header, the status line and the buttons. A 354px card becomes 178px. The
  setting is remembered on the device (`localStorage` `df-labour-cal` = "0" or "1", read after
  mount so the server render and the first paint agree), not on the property: one person's iPad can
  keep the board compact while the manager's laptop shows the calendars. Probe: `fivefix.mjs`.

## Attendance — four ways, the owner chooses (0086, 2026-10-11)

`restaurants.attendance_methods` (default `{manual,qr}`) says which ways a person may be marked
present; only the owner changes it (Settings → Attendance, `set_attendance_settings`, which checks
`auth_role() = 'owner'` itself). **A way that is off is refused in the database, not just hidden** —
`labour_mark`, `staff_mark` and `_attend` each check it.

| Way | Who does it | Path |
| --- | --- | --- |
| Manual | owner / manager / supervisor (staff); any staff (labour) | Labour card *Mark present* → `labour_mark`; Staff → *Attendance today* → `staff_mark` |
| QR badge | whoever holds the scanner | `/scan`: `df:lab:<code>` → `labour_punch`, `df:staff:<staff_code>` → `staff_punch_code` (first scan in, next out) |
| Fingerprint / Face ID | the person, on their own phone | a passkey (WebAuthn, `@simplewebauthn` v13), platform authenticator, user verification required |
| Selfie + location | the person, on their own phone | a photo (shrunk to 640px JPEG in the browser) and a GPS fix inside `attend_radius_m` of `attend_lat/lng` |

**Who is punching is decided on the server, never by the browser.** A labourer by the secret
`labourers.punch_token` in their link (`/attend/<token>` — Labour → a card's link button → QR, Copy,
WhatsApp); a staff member by their session (`/attendance`, *My attendance* in the menu, shown only
when fingerprint or selfie is on). `lib/attendance.ts` does the WebAuthn verification and the distance
check, then calls `_attend`, which the service role alone may execute. **So both phone ways need
`SUPABASE_SERVICE_ROLE_KEY` on the server**; without it the punch pages and Settings say so in words.
A challenge is used once and lives 5 minutes; a replayed assertion is refused. The distance test
gives the phone's own accuracy (capped at 100 m) the benefit of the doubt.

**What a passkey proves.** That someone enrolled on *that device* unlocked it. On the worker's own
phone that is the worker; on a shared tablet it is anyone enrolled there — the screens say the
fingerprint never leaves the phone. Selfies are kept (private bucket `attendance/<property>/<date>/…`)
and shown as thumbnails in Labour → *Today's punches*, so a manager can check a face against a name.

Every punch, whatever the way, writes a line to `attendance_punches` (method, direction, distance,
photo). `labour_attendance` / `staff_attendance` keep one row per person per IST day with
`method_in` / `method_out`.

- **Direct writes to `labour_attendance` are refused** (restrictive policies, 0086). The Labour page's
  *Mark present* used to upsert straight into the table; it now calls `labour_mark`. Anything new that
  marks attendance goes through an RPC.
- **The Permissions-Policy header allows `geolocation=(self)`** (`next.config.ts`). It was `()` —
  nothing asked for a location then — and the browser refused every location request on the site
  with "disabled in this document by permissions policy". Camera is not needed: the selfie uses a
  file input with `capture="user"`.
- **WebAuthn will not take an IP address as its RP ID.** Test on `localhost`, not `127.0.0.1`. The RP ID
  is the request's host, so a passkey made on one domain does not work on another (the production
  domain and a preview URL are different keys).

Probes: `att.mjs` (21) and `wa.mjs` (5) — see testing-and-gates.md.

## Leave (0127, 2026-10-20)

A person asks for leave on their **My day** (`/home` → Leave): first and last day, a kind (casual, sick, earned, unpaid,
other) and a reason if they like. `leave_request` refuses a request overlapping their own waiting or approved leave,
more than 60 days, more than a year ahead or more than a week back. They may withdraw it while it waits, or an approved
one before it starts (`leave_cancel`). **Leave requests** on this screen (`StaffLeave.tsx`, `[data-staff-leave]`) lists
the waiting ones first with Approve / Not approve and a note, then the last few decided — the owner and managers see
the whole property's, a supervisor their own team's (the team rule is `_my_dept()`'s); `leave_decide` checks the same
and nobody decides their own. The decision reaches the person on their Leave tile and on the bell (`leave` kind,
lib/notify.ts); a new request reaches whoever decides it. There are no balances yet — the tile counts days taken this
year. See [my-day.md](my-day.md).

- **Flap numbers (2026-10-20)** — design-system.md, *Flap numbers*. "On duty today" on the Staff summary is a shuffling flap count.

## Attendance: how many across, the register, leave by itself, and leave up the ladder (2026-10-23)

- **One, two or three across** (three by default; the pin keeps another on this device, `df-view:attendance-cols`).
- **On leave by itself**: anyone with approved leave today shows *On leave · Casual (till …)* in violet — nobody marks it;
  Present stays there for someone who came in anyway. page.tsx reads today's approved leave (what 0135 lets them see).
- **The register** (*Register* tab, `[data-att-register]`) — the owner, managers, and a supervisor the owner gave Staff to: a
  row per person, a column per day of the month — **P** present, **L** approved leave, **A** absent (a past day with no punch
  and no leave, from the day they joined), today tinted — with the month's P · L · A at the end, the months either side, and
  a CSV of what is shown. Read a month at a time (`attendanceMonth` in actions.ts).
- **Leave goes up the ladder (0135)**: `_leave_decides` — the owner anyone's; a manager anyone below a manager (not another
  manager's); a supervisor (either rank) only staff below both supervisor ranks in their own team (not another supervisor's);
  anyone a person reports to, when they rank below them. It decides `leave_decide` and what `staff_leave`'s policy shows, so
  the bell follows it. Dry run `dry135.cjs` (18).
- **Add staff asks for an emergency contact** (0134): name and number, optional; `staff_set_emergency` — the rule of
  `staff_set_position` (a supervisor or above, someone below them; the owner anyone); 6–15 digits. The person can change it
  on My profile (0125's own columns). Dry run `dry134.cjs` (9).
- **Note**: `staff_attendance` is readable by everyone on the property (`staff_attendance_read`); the register is shown only to
  the people above, but the rows themselves are not narrowed — unchanged, worth a look.
- **Short copy** (2026-10-23): subtitles and hints cut to a few words.

- **Temporary passwords are the owner's** (0136, 2026-10-23, the owner: "only the owner, always; the owner can enable it
  for a manager; otherwise no one"). `staff_create_login` and `staff_reset_password` refuse anyone but the owner or a
  manager with `profiles.can_issue_passwords`; `staff_login_details` shows the sign-in ID as before but the temporary
  password only to those (`can_issue`). The owner turns it on per manager in Access (`[data-password-right]`,
  `staff_set_password_right`). The page passes `canIssue`: without it there is no **Add staff** (Invite with a code is the
  one button) and no **Reset their password**.
- **The sign-in slip, redrawn** (`Credentials`, `[data-credentials]`): the login ID and the temporary password on rows with
  round copy keys, the password large and spaced, a "3 days" tag; no password → one line ("Own password set…", and who
  can reset it). The old "What happens next" card is a one-line foot, shown only with a password.
- **Attendance head on a phone** (`[data-att-head]`): the title no longer breaks ("Attend / ance"); Today | Register take
  their own full-width row under 640px.
- **Positions → Level** chips slide in a `ChipRail` with arrows (`[data-level-rail]`) on phone and iPad; wrap from lg.

- **Access → Assist (AI)** (0138, `[data-assist-switch]`): the owner or a manager switches the AI helper on for someone below a
  supervisor (`staff_set_assist`); the top three have it always.
- **Access → Connections / Reports** (0140, `[data-grant-switch=connections|reports]`, the owner only, on a manager or a
  supervisor; `staff_set_grant`): the two owner's screens, given per person (connections.md). Saved at once, like Assist.
- **Two ways in, as buttons (2026-10-24, the owner: "design").** `[data-two-ways]` is two tiles, each with its icon, what it does and a chevron: **Add staff** (`[data-way=add]`, only with `canIssue`, opens Add staff) and **Invite with a code** (`[data-way=invite]`, opens the invite sheet). It was two grey sentences.
- **Labour, iPad and desktop (2026-10-24; the phone is unchanged).** No labourers yet is `Empty`'s sm+ form (the hard hat).
  QR labels with nothing to print says which (`[data-labels-empty=rooms|products|labour]`) and where to add them; the phone
  keeps "Nothing to print yet."
- **Staff's Cards · Table is the app's ViewSwitch (2026-10-25)** (`[data-view-switch=staff]` inside `[data-staff-layout]`;
  `df-view:staff`, the old `df-staff-layout` read as pinned). **Wages & payments** gained Cards · Table
  (`[data-view-switch=wages]`, `[data-wage-cards]` / `[data-wage-table]`): cards below md — the worker, Pay, days and hours,
  earned and paid, the balance in red when owed — and a bar with how many workers and what is left to pay. The 720px table
  scrolled a phone sideways.
- **Labour's tabs on a phone (2026-10-26, the owner: "not looking good").** In the toolbar's sliding track the tabs were cut
  ("…ments") and the badge field sat half off the screen. Under sm the three tabs are one full-width segmented row with short
  names (Today · Wages · QR labels, `[data-labour-tab]`) and the badge code its own full-width row (`[data-badge-form]`, a 48px
  field and scan key). From sm the track is as it was (the wrapper is `display: contents`).
- **Shorter copy (2026-10-29, the owner: "maximum 3 or 4 words, try 2 or 3 — clean and neat").** Subtitles, hints, helper
  lines and empty-state hints cut to two–four words, or removed where they said the obvious. Error and refusal messages,
  steps to follow outside the app, printed and exported text, WhatsApp bodies and tooltips were left as they were.

## 2026-10-30
- **Attendance's cards across work on an iPad (the owner: "the grid option is not working").** Three across began at 1280px, so a
  1194 iPad showed two whatever was picked. The columns follow the panel (`@container/att`): two from 36rem, three from 52rem;
  where three cannot fit (an iPad upright) the Three across button is hidden, so every button that shows does something.
- **Labour: the calendar switch is the app's ViewSwitch with the pin (the owner: "add the default pin here").** *Calendar |
  Compact* (`df-view:labour-cal`; `[data-view-switch="labour-cal"]`, the calendars `[data-month-dots]`); a device that had switched
  the old toggle off (`df-labour-cal = 0`) keeps Compact as its default.
- **Pay fills in the amount (the owner: "add the amount by their position; change it if needed").** `PayAmount`: the balance owed
  this month, else one day at their rate; chips for 1 day, 1 week and the balance; the rate and skill beside them; still a field
  (`[data-pay-input]`, `[data-pay-pick]`). Adding a labourer: the skill fills its usual day's wage (`wageFor` — what this property
  pays that skill now, else a common rate) until the wage is typed.
