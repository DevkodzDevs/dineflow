# Staff and labour

**Routes** `/staff` · `/labour`
**Files** `app/(app)/staff/page.tsx` · `StaffClient.tsx` · `app/(app)/labour/LabourClient.tsx` ·
both `actions.ts`
**Reads** `profiles`, `invites`, `labourers`, `labour_attendance`, `labour_payments`
**Writes** `create_invite`, `owner_set_access`, `staff_create_login`, `staff_login_details`,
`staff_login_domain`, `staff_request_contact_otp`, `staff_verify_contact`, `staff_reset_password`,
`labour_punch`, `next_labour_code`

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
width. Each person is one grid row — `[avatar] [minmax(0,1fr): name, code·email·phone, then a
wrapping line of state pills] [key button + Access]` — so state wraps under the name and can never
print over the buttons. Open invites and "Two ways in" sit beside the list from `xl` (1280) and in
two cards under it below that.

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
