# Work (every job on the property, routed to its department)

**Routes** `/work` · the Cleaning board `/cleaning` shows the same tables and rooms · the kitchen ticket names its cook
**Files** `app/(app)/work/page.tsx` · `WorkClient.tsx` · `actions.ts` (`addJob`) · `app/(app)/cleaning/JobCard.tsx` (the card,
the done row, the column — shared with Cleaning) · `app/(app)/cleaning/actions.ts` (take / done / give back / give to /
labourer / drop) · `lib/bar.ts` (`DEPT_PRIMARY`) · `components/shell/Notifier.tsx` + `lib/notify.ts` (kinds `job`, `jobdone`)
**Reads** `work_board` (= `clean_board` + `work`, `labourers`, `cooks`, `rooms`, `tables`, `me_dept`), `jobs`, `kots.started_by`
**Writes** `job_add`, `job_assign_labour`, `job_cancel`, `clean_take` / `clean_done(…, p_note)` / `clean_release` /
`clean_assign` with kind `'job'` (0113); `_kot_who` stamps `kots.started_by / ready_by / served_by`

## What it is

The cleaning loop (0111) for every kind of work. A leaking tap, a lawn, a spill, extra towels, a banquet setup, a restock, a
patrol — anyone raises it, it goes to the department that does it, the people there hear about it on their own phones,
one of them takes it on their own login, finishes it (with a note of what was done), and the board keeps who, when and
how long. A supervisor gives a job to a person or to a day labourer, sees every department's waiting and late counts, and
reads *Today by person* — jobs finished, and the kitchen's tickets cooked. The design follows what hotel maintenance desks
and restaurant task tools do: department routing, priority tiers with response targets, lateness in red, guest impact,
the raiser told when it is done, recurring rounds.

## How it works

- **A job** (`jobs`): title, details, `category` → a default `department` (`_job_department`: repair / grounds →
  Engineering, cleaning / guest_request → Housekeeping, kitchen, service, stock → Stores, security, event → Banquets, admin
  → Management, other → anyone), `place` (a room, a table, or words), `priority` 1–4 with a response target
  (`_job_target`: P1 30 min, P2 2 h, P3 8 h, P4 3 days — `due_at` unless one is given), `guest_impact`, `repeat_days`
  (done → the next opens, due that many days on, same person, `source = 'repeat'`), `note` (what was done / why dropped),
  `created_by`, and the same `assigned_to / by / at`, `taken_by / at`, `done_by / at` as the cleaning jobs, plus
  `labourer_id` for a day labourer (no sign-in: whoever finishes it does so *for* them). `_job_who` stamps who and when on
  every path. Trigger `_job_repeat` opens the next round.
- **Who may do what**: anyone signed in raises a job (`job_add`) and takes one not given to someone else; giving a job to a
  person or a labourer is for owner / manager / supervisor / supervisor 2 (`_clean_may_assign`), so is `job_assign_labour`;
  *Drop* (`job_cancel`) is for whoever raised it, is on it, or a supervisor — the check coalesces nulls, because
  `null = me` would otherwise slip through `not (…)`. Done with a note: `clean_done(p_kind, p_id, p_note default null)` —
  the two-argument signature was dropped and replaced (one function, a default), so the old calls still work.
- **The board** (`work_board`, one call): every cleaning job (under Housekeeping and Service), every job, each room out
  of order as Engineering's *Repair · Room n* (its `housekeeping_tasks` row of kind `maintenance`, taken and done through
  the same buttons; `hk_done` puts the room back on sale), the labourers (on duty from `labour_attendance`), the cooks
  (tickets started today by `kots.started_by`), and the rooms and tables a job can name. Tiles: Waiting · On it · Late
  (red when any) · Done today. Chips: All · Mine · Late · one per department with its open count and *n late*; a worker
  starts on their own department, a supervisor on All. Columns: Waiting (late first, then mine, then the most urgent,
  then the oldest) · On it · Coming up (pending and not due for six hours or more — tomorrow's round) · Done today.
  *New job* is a sheet: what, kind, for (department), where (rooms / tables / words), how urgent (the four tiers with
  their targets), a guest is waiting, details, by when, repeats, and — for a supervisor — give it to (people, then
  labourers).
- **The card** (`JobCard`): the title, *place · department · raised by*, the details, pills (Urgent / High / Low with
  the target, Guest waiting, Guest arriving today, VIP, Every day), *Given to … by … · time* (a labourer says so),
  *… is on it · since · n min*, then the one move — *I'll take it*, *Done*, *Done with a note* (jobs), *Give back*,
  *Not needed* (tables), *Drop* (jobs) — and the supervisor's *Give to…* (people on duty first, then whose work it is,
  then day labourers). The footer is one wide primary button (take / done / the status) plus two 44px icon buttons:
  ⋯ (`data-more`) opens *Done with a note*, *Give back*, *Not needed*, *Drop*; the person-plus (`data-give-open`) opens
  the *Give to…* select. Both panels stay in the DOM, hidden, so probes can reach `data-assign` and the rest. Late: past `due_at` (a cleaning job without one keeps the 15 / 45-minute rule of thumb) — the time
  turns red, the tile red, the card's edge red.
- **Alerts** (`Notifier.tsx`; who can have each is `kindsFor`): `jobs` INSERT → *High · Tap leaking* (kind `job`) for the
  people of that department, every supervisor, and everyone when it is for anyone — not the raiser, not the one it was
  given to (they get *Given to you*), not a repeat's next round; `jobs` UPDATE to done within the last minute → *Done ·
  Tap leaking — Room 104 — Washer replaced* (kind `jobdone`) for whoever raised it and the department's supervisors
  (owners and managers hear every department's). The person's department reaches the layout through `session_bundle`
  (0115 — it carried no `department` before, so no worker's phone could match a job to them).
- **Where people start** (`positionAccess.ts`, `lib/bar.ts`): a Plumber, Electrician, AC Technician, Technician,
  Carpenter, Gardener, Maintenance Helper, Shift Engineer, Chief and Assistant Engineer, Security Guard, Supervisor and
  Manager, Kitchen Steward / Dishwasher and Driver land on `/work`
  (`home: "work"`, in `OPEN_HOMES`); `DEPT_PRIMARY` puts Work first on the phone bar of an `employee` / `supervisor_2` in
  Engineering or Security, Cleaning first in Housekeeping; chefs, housekeeping and stores carry Work on their bar too.
- **The kitchen**: `sync_kot_status` sets `kots.status` from the dishes' statuses inside the cook's own session, so
  `_kot_who` (before update of status) stamps `started_by` on *Start cooking*, `ready_by` on *Ready*, `served_by` on
  *Served*. The ticket's KOT line says *· Arun Commis* (`data-cook`); the Work board counts *n tickets cooked* per cook.

## Who sees what (0116)

- **A job reaches its department only.** `_work_dept_ok(kind, dept, assigned, created, taken, done)`: owner and managers
  see everything; anyone a job is about (raised, given, took, finished) sees it; a supervisor with **no** department (as
  every live property's are today) sees everything; otherwise rooms → Housekeeping, tables → Service and Housekeeping,
  a job → its department (or everyone when it has none). A person's department is their position's, else their role's
  (`_my_dept`: waiter / cashier → Service, housekeeping → Housekeeping, chef → Kitchen, frontdesk → Front office, store
  → Stores). It is the RLS of `jobs` and `table_cleanings` — so the bell's realtime feed follows it — and `_clean_job`
  refuses another department's job (*That job is for another department*). Room tasks keep their old RLS (the
  Housekeeping board and the rooms read them); the bell filters them with `deptSees` in `lib/notify.ts`, the mirror.
- **Taken is gone for the others.** `_work_board_sees` adds: staff (not supervisors) see only what is still waiting for
  anyone, plus their own — a job someone else took, finished or was given leaves their board. Their bell drops its
  alerts the moment the change arrives (RLS still lets them read the row, so the event reaches them). The department's
  supervisors hear *Meena Attendant took Room 102 · Started 10:42* (kind `taken`) and then *Room 102 is clean* /
  *Done · Tap leaking — Kumar Plumber · 12 min* (who and how long; names looked up once per person).
- **Work records** (`/work-records`, owner and managers only — a menu entry of their own and a *Records* button on Work):
  `work_log(from, to)` (≤ 93 days) — every table, room and job of the period with raiser, given to / by, taken by and
  start, finished by and end, note and inspection; each cook's tickets and average cook time. Ranges Today · Yesterday ·
  Last 7 days · This month or two dates; tiles Jobs · Done · Late · Average response (raised → taken) · Average work
  (taken → done); By person (done, time each, on time, on it now, tickets cooked); By department; every job (a table
  from `lg`, cards below it), filtered by department, person, status or words; Excel with three sheets. Live.
- **Live screens carry the signed-in token** (`lib/useLive.ts`, 0116): the channel joined before the session reached the
  realtime client, so it joined as anon and only the 30-second timer refreshed the screen. It now sets the token first.

## Before you edit

- **Keep one shape for a job across tables, rooms and work.** `JobCard`'s `Job` type is the union; `work_board` emits the
  same keys for all three (a room repair fakes `title`, `priority 2`, `due_at = created + 2 h`). A new field goes in the
  function and the type together.
- `work_board` returns the new jobs under **`work`**, the cleaning jobs under `jobs` (0114 — 0113 had put both under
  `jobs` and the cleaning cards vanished).
- A job given to a labourer has `assigned_to = null`: anyone may take it; the done row says *Done by you for Murugan*.
- The New job sheet's *Where* keeps `room` / `table` / free text mutually exclusive; the function names the place from the
  room or table when the words are blank.
- `datetime-local` gives the browser's local time; `toISOString()` sends it as UTC — right on a device set to IST.
- The job alert is silent for a device whose person has no department set (nothing to match) unless the job is for
  anyone or the person is a supervisor. Give people a position in Staff — the department follows.

## Verify

```
node dry113.cjs      # 34 checks, rolled back      node dry114.cjs   # the same 34 on top of 0113
node dry115.cjs      # session_bundle carries department and position
node dry116.cjs      # 22 checks, rolled back: departments, taken leaves the staff, the records
node dept.mjs        # 36 checks: three people on three devices — who hears, who sees, the owner's records
node work.mjs        # 51 checks: two browsers, four people added through Staff, a labourer, the whole loop
node cleaning.mjs    # 43  ·  node cleaner.mjs  # 43 — the Cleaning board still stands on the shared card
```

## See also

[cleaning.md](cleaning.md) · [housekeeping.md](housekeeping.md) · [kitchen.md](kitchen.md) ·
[staff-and-labour.md](staff-and-labour.md) · [shell-and-nav.md](shell-and-nav.md) · [data-and-rls.md](data-and-rls.md)
- **Each card waits on its own answer** (2026-10-18): the board's one `pending` greyed every card while any one tap was
  answering. `actOn(id)` keeps a `busy` set; a card is held only while its own take / done / give / drop is answering.
- **Short copy** (2026-10-23): subtitles and hints cut to a few words.
