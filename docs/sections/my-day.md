# My day — where staff land

**Routes** `/home` (`?locked=<module>` when they were sent here from a section they do not hold)
**Files** `app/(app)/home/page.tsx` · `HomeClient.tsx` · `actions.ts` · `app/(app)/staff/StaffLeave.tsx` ·
`packages/shared/src/positionAccess.ts` (`landsOnMyDay`, `landingFor`) · `components/shell/sections.ts` (`myDayFor`)
**Reads** `profiles`, `jobs`, `checklists`, `checklist_runs`, `staff_attendance`, `staff_leave`, `staff_pay`,
`staff_advances`, `my_payslips()` (0127), `voice_unread()` (0124)
**Writes** `leave_request`, `leave_cancel`, `leave_decide` (0127), `checklist_tick` (via `tasks/actions.ts`)

## What it is

The owner (2026-10-20): "when a staff member signs in, straight to their own dashboard". Everyone but the owner and a
manager lands here — a waiter, a chef, a cleaner, a supervisor — and sees their own day at a glance: the greeting with
their job and team, whether they are in, and six tiles that each open in full.

## How it works

- **Landing.** `landingFor` — staff → `home`, the owner and managers → the control room (or `homeFor` for a manager
  without it). Used by `startScreen` after sign-in and by the app layout for `/dashboard` and for locked sections. The
  page itself sends the owner, a manager and Master control to `/dashboard`.
- **One round trip** (`page.tsx`, one `Promise.all`): profile, open jobs on them (`assigned_to` or `taken_by`, pending
  or in progress), jobs they finished today, active checklists (filtered to the ones naming their team, job or position,
  or everyone — a supervisor's RLS hands them every list), attendance since the earlier of the month's first day and a
  week ago, their leave, pay rate, unrecovered advances, finalised payslips, and unread answers from the owner.
- **Tiles** (`[data-home-tile=work|lists|attendance|leave|salary|messages|me]`):
  - *My work* — open count, given / in progress / done today, the next three by priority; a red **n new** badge
    (`[data-home-new-work]`) for jobs given to them since they last opened the tile (`df-home-work-seen:<id>` in
    localStorage). Full view: every open job, Open Work.
  - *My checklists* — duties ticked of the day's total and a bar. Full view: tick them here (`checklist_tick`).
  - *Attendance* — days present this month, the last seven days, today's in/out. Full view: the month calendar with in
    and out times and approved leave; Punch in/out when phone attendance is on.
  - *Leave* — days taken this year, the next approved leave or how many wait, a badge for a decision in the last
    three days. Full view: the request form (`[data-leave-form]`) and the history with Withdraw.
  - *Salary* — an estimate so far this month (monthly rate × days present ÷ days in the month, or the day rate × days
    present), the rate, advances to come off, the last payslip. Full view: advances and payslips, each a PDF.
  - *Messages* — the owner's unread answers on Feedback & complaints → `/voice`. *About me* → `/me`.
- **Status pill** (`[data-home-status]`): on leave today, in since…, out at…, or not punched in yet.

## Before you edit

- The salary figure is an **estimate** and says so: PF, ESI, paid weekly offs and advances come off in the owner's
  payroll run; the payslip is the final word. Staff cannot read `payroll_runs`, hence `my_payslips()`.
- There is no shift time, so "late" and "absent" are not shown — only days present. Add a shift before adding them.
- The greeting's hour is set after mount (IST) so the server's HTML and the first client render agree (React #418).
- `/home` is in no module: do not add it to `ROUTE_MODULE`.

## Verify

```
node dry127.cjs            # 30 checks, rolled back — leave for self/other/supervisor/manager/owner/anon, my_payslips
pnpm test                  # positions.test.ts: staff land on My day, the owner and managers do not
```

- **Flap numbers (2026-10-20)** — design-system.md, *Flap numbers*. "In since" shows its time on flap tiles; the checklist tile's figure is a `FlapPercent`; attendance and messages figures shuffle; the "n new" work badge is a `FlapMini` (its number kept sr-only).
