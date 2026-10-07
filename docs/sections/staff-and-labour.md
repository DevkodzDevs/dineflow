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

## Before you edit

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
```

Sign in as a non-owner on a demo property and confirm the sidebar matches the ticks.

## See also

[auth-and-session.md](auth-and-session.md) · [shell-and-nav.md](shell-and-nav.md) ·
[admin-and-membership.md](admin-and-membership.md)
