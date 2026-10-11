# Staff and labour

**Routes** `/staff` · `/labour` · `/attendance` (staff self-punch) · `/attend/[token]` (a labourer's own link, no sign-in)
**Files** `app/(app)/staff/page.tsx` · `StaffClient.tsx` · `app/(app)/labour/LabourClient.tsx` ·
both `actions.ts` · `staff/StaffAttendance.tsx` · `app/attend/actions.ts` · `lib/attendance.ts` ·
`components/attendance/PunchPanel.tsx`
**Reads** `profiles`, `invites`, `labourers`, `labour_attendance`, `labour_payments`, `staff_attendance`,
`attendance_punches`, the private `attendance` bucket (selfies, signed URLs)
**Writes** `create_invite`, `owner_set_access`, `staff_create_login`, `staff_login_details`,
`staff_login_domain`, `staff_request_contact_otp`, `staff_verify_contact`, `staff_reset_password`,
`labour_punch`, `labour_mark`, `staff_mark`, `staff_punch_code`, `next_labour_code`; service role only:
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

Final visibility is `modulesFor(type, role, enabled, allowed)` — property type ∩ role access ∩ the
master's enabled set ∩ this person's ticks, with `dashboard` always granted. See
[shell-and-nav.md](shell-and-nav.md).

**Two ways in.** `create_invite` sends a join code (`/join`). `staff_create_login` makes a login
directly with a temporary password and a short domain; the person is forced to change it on first
sign-in (`must_change_password`). Contact verification and reset run on OTP RPCs.

**Labour** is a punch clock: `labour_punch` records in/out against a labourer code
(`next_labour_code` allocates one), and payments are recorded against attendance. `/scan` can punch
a labourer from an ID card.

**The Staff page layout.** A toolbar on top (head count, "n not signed in", "n email
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
