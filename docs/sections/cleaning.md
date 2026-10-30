# Cleaning (tables and rooms, after every guest)

**Routes** `/cleaning` · the floor on `/orders` · the task board on `/housekeeping`
**Files** `app/(app)/cleaning/page.tsx` · `CleaningClient.tsx` · `JobCard.tsx` (the card, the done row, the column — shared
with [Work](work.md) since 0113) · `actions.ts` · `app/(app)/orders/OrdersClient.tsx`
(the *Cleaning* table card) · `app/(app)/housekeeping/HousekeepingClient.tsx` (who has a task) ·
`components/shell/Notifier.tsx` + `lib/notify.ts` (kinds `clean`, `assigned`)
**Reads** `clean_board`, `table_cleanings`, `housekeeping_tasks`, `profiles`, `staff_attendance` (on duty today)
**Writes** `clean_take`, `clean_done`, `clean_release`, `clean_assign`, `clean_skip`, `clean_settings_save` (all 0111);
`inspect_room` (Pass / Fail from the board, 0112)

## What it is

A table that is paid and left, and a room that is checked out, is a job with a name on it. The busser or the room
attendant takes it on their own login (*I'll take it*), finishes it (*Done*), and the board keeps who, when and how
long. A supervisor gives a job to one person, and that person's screen says so. The owner sees every table and room
waiting, who is on what, and today's finished jobs with their times.

## How it works

- **A table job opens by itself.** A trigger on `dining_tables` (`_table_cleaning_open`): occupied → free inserts a
  `table_cleanings` row (one open job a table, a partial unique index) — whatever freed it: `settle_bill`, a pay link,
  move / merge / cancel, posting to a room. Seated again before anyone marked it clean (→ occupied), the job closes as
  `skipped`, *Seated again before it was marked clean*. A job left open 12 hours is closed when the next one opens.
  `restaurants.table_cleaning` (on by default; the switch is at the foot of the board, owner or manager) turns it off.
  `settle_bill` and the table statuses are untouched — the live site's older code sees nothing new.
- **Rooms are the existing `housekeeping_tasks`** (check-out already creates one). 0111 adds `place` (the room
  number), `assigned_by/at`, `taken_by/at`, `done_by`; the trigger `_hk_who` stamps them from the signed-in person on
  *every* path — including a direct status update from an older screen or the offline queue — so no task is finished
  by nobody. Maintenance tasks stay off the Cleaning board.
- **The rules (the functions, not the screen):** anyone signed in at the property takes a job that is not given to
  someone else; a job given to a person is theirs, or an owner / manager / supervisor / supervisor 2's
  (`_clean_may_assign`); someone already on it: "Ravi Busser is already on it". *Done* by whoever is on it, the person
  it was given to, or a supervisor. *Give back* returns it to the queue. Giving a job someone else is on to a third
  person puts it back to waiting. *Not needed* (tables only) closes it by name.
- **The board** (`clean_board`, one call): Waiting · On it · Done today, filtered All / Tables / Rooms / Mine
  (housekeeping starts on Rooms, a waiter on Tables, in a resort). A card: the place, how long it has waited, *Given
  to … by … · time*, *… is on it · since … · n min*, the one move this person has as a wide button, a ⋯ button for the rarer moves and,
  for a supervisor, a person-plus button that opens the *Give to…*
  select — on-duty people first, then the ones whose work it is (housekeeping for rooms, service for tables). Done
  today: who, *took* (taken → done), *waited* (opened → taken), *given by*. Tiles: Waiting, On it, Cleaned today,
  Average clean. Live through `useLive`.
- **The floor**: a free table with an open job is `data-state="clean"` — cyan and dashed (`.st-clean`,
  `--color-cyan`), *Cleaning*, *Waiting · n min* / *Given to …* / *You · n min*, the move (*I'll take it* in the
  state's hue, or *Done*), and a 44px **+** that seats the next party anyway. A *Cleaning* chip counts them.
- **Notifications** (`kindsFor` in `lib/notify.ts` decides who can have each): `table_cleanings` INSERT → *T4 to
  clean* (kind `clean` — anyone holding Orders, and a Cleaner (`employee`) who does not); a table or room given to
  *this* person in the last minute, by an UPDATE or by a task created already given to them (a failed inspection going
  back) → *Given to you · Room 104*, with the reason when it failed (kind `assigned`, no module; the plain *Room to
  clean* is skipped for that row so the phone rings once); a room finished by someone else → *Room 104 is clean*
  (kind `roomdone`, 0112 — owner, manager, supervisors and the front desk, holding Housekeeping). Stations: *Cleaning
  crew* (rooms, tables, given to you; a bell) is what a housekeeping or employee device guesses; Till and phone hear
  tables; Front desk and phone hear rooms cleaned. Devices set up earlier get the new kinds by the same merge.
- **The cleaner's day (0112).** A Cleaner, Room Attendant, Public Area Attendant and Housekeeping Trainee start on
  `/cleaning` after signing in (`home: "cleaning"`, `OPEN_HOMES` in `positionAccess.ts` — the board is open to every
  role, so it needs no tick); the phone bar puts Cleaning first for `housekeeping` and `employee` (`ROLE_PRIMARY` in
  `lib/bar.ts`; `Nav.tsx` offers the board to the bar beside the modules) and a Busser keeps Orders first with Cleaning
  beside it. The Staff guide shows *Cleaning* as their start chip.
- **The supervisor's loop (0112).** Where the property inspects (`hk_inspect_required`), a supervisor's board has *To
  inspect*: each cleaned room with *cleaned by … at …* and *Guest arriving today*; **Pass** signs it off; **Fail** asks
  what is wrong and `inspect_room` writes `inspection` / `inspected_by` / `inspected_at` on the clean and creates the
  re-clean **given back to whoever cleaned it** (their phone says so). Done today shows *Passed / Failed by … · time*,
  or *Waiting for inspection*. *Today by person*: each person's jobs done, time each, and what they are on now.
  Room jobs with a guest arriving today sort first and say so; a VIP in the room says so. A wait past 15 min (table) /
  45 min (room), or a clean past 20 / 60 min, turns its time orange.
- **Housekeeping board**: a task given to someone else (or someone else on it) shows *…'s task — ask a supervisor*
  instead of Start and Done, for anyone but a supervisor; the function refuses it too.

## Before you edit

- **`clean_done` takes a third argument since 0113** (`p_note`, default null); the two-argument function was dropped
  and replaced, not overloaded — two signatures would make a named-argument RPC call ambiguous. `JobKind` is now
  `'table' | 'room' | 'job'`; the card lives in `JobCard.tsx` and is the Work board's too.
- **`--color-sky` is the same hex as `--color-blue`** (Ordered). Cleaning is `--color-cyan`, new in 0111, in both
  themes; do not "simplify" it back to sky.
- The board names come from the database (`_clean_name`), not the client — a person working in from another outlet
  is still named.
- A Tamil word under a half-width button at 412 must fit: *I'll take it* is "எடுக்கிறேன்", not the longer sentence.
- The demo resort does not have Housekeeping switched on; a probe switches it on (and Staff) for its demo.
- **One realtime binding per table and event** in `Notifier.tsx`. Two identical `postgres_changes` bindings on one
  channel (the `assigned` and `roomdone` listeners both on `housekeeping_tasks` UPDATE) left the channel deaf: the
  listeners are collected per table/event and one binding dispatches to all of them.
- **`kinds` is keyed by the modules' contents, not the array.** Every refresh re-rendered the layout with a new
  `modules` array, re-made `kinds`, and tore the bell's channel down and joined it again — an event in that gap was
  never announced. `useLive`'s own channel joins before the session's token is on the realtime client, so its events
  arrive as `401 Unauthorized` with no row; they still prompt a refresh, which is all it needs (left as it was).

## Verify

```
node dry111.cjs      # 36 checks, rolled back   (0113 changed clean_done's signature: dry113.cjs covers the two-argument call)
node dry112.cjs      # 14 checks, rolled back: fail → back to the cleaner, pass, arrivals, the board's inspections
node cleaning.mjs    # 43 checks: two browsers, three people added through Staff, the whole loop
node cleaner.mjs     # 42 checks: a restaurant Cleaner's phone and a resort's attendant and supervisor, nothing preset
```

## See also

[housekeeping.md](housekeeping.md) · [orders-and-till.md](orders-and-till.md) · [shell-and-nav.md](shell-and-nav.md) ·
[data-and-rls.md](data-and-rls.md)
- **Each card waits on its own answer** (2026-10-18): the board's one `pending` greyed every card while any one tap was
  answering. `actOn(id)` keeps a `busy` set; a card is held only while its own take / done / give / drop is answering.

- **Flap numbers (2026-10-20)** — design-system.md, *Flap numbers*. Waiting breathes; On it and Cleaned today shuffle (`[data-clean-n]`); the average stays words.
- **Short copy** (2026-10-23): subtitles and hints cut to a few words.
- **iPad and desktop (2026-10-24, the owner: "the flaps are tiny — number flap design, perfectly sized"; the phone is unchanged).**
  `CleanTiles` (`[data-clean-tiles]`, sm+) is Work's tile: an icon and the word, the count on `.flip-stat`'s flap (86px at
  1194, was 34) with a caption, each state its colour on the top edge — Waiting amber (breathes), On it blue, Cleaned today
  green, **Average clean** cyan, now a flap of minutes ("min a clean"). The phone keeps `[data-clean-stats]`. An empty
  column (`Column` in JobCard.tsx, shared with Work) is an `EmptyState size="sm"` from sm (`[data-col-empty]`): the column's
  icon and hue, its sentence and one line on what lands there.
- **The flap tiles on the phone too (2026-10-26, the owner: "the flaps are tiny; Average clean is a dash").** `CleanTiles` is
  now every width (`[data-clean-tiles]`, which also carries `data-clean-stats`); the small phone row with 34px flaps is gone.
  On a phone each flap is 76px and Average clean is a flap of minutes ("none timed yet" at none).
- **Shorter copy (2026-10-29, the owner: "maximum 3 or 4 words, try 2 or 3 — clean and neat").** Subtitles, hints, helper
  lines and empty-state hints cut to two–four words, or removed where they said the obvious. Error and refusal messages,
  steps to follow outside the app, printed and exported text, WhatsApp bodies and tooltips were left as they were.
## 2026-10-30 — the right people hear a job; only bosses give jobs out (0156) — replaces the alert lines above
- **Who hears what** (`lib/notify.ts` `kindsFor(modules, role, dept)` with `deptSees`, the client copy of `_work_dept_ok`): a
  **table** to clean — owner, managers, a supervisor with no team, the Service team and the Housekeeping team (what the board and
  realtime already allow them); a **room** — owner, managers, a supervisor with no team, Housekeeping. Before, the table alert needed
  the Orders section and the room one the Housekeeping section, so a Room Attendant without Orders never heard a table. A job
  already **given to someone** reaches only that person ("Given to you").
- **The alert is a card** at the top (`[data-job-alerts]`, `[data-job-alert]`, `[data-job-alert-hide]`): "T3 needs cleaning · Paid and
  left", "Room 201 · clean · Checked out"; tap → /cleaning (a Work job → /work); the device's tone and a buzz; 15 s; a 44px ×; gone
  when someone takes it; the bell keeps the line. A never-set-up Housekeeping device picks *Cleaning crew* on a tablet or desk too.
- **Not reached:** a locked phone or a closed app (no Web Push); on iPhone, the Home Screen app with *Background alerts → Allow*;
  sound after the first tap; a device that saved *Front desk* / *Kitchen* keeps tables off. Waiters (the Service team) still hear
  tables because they may take them — change `deptSees` and the database rule together to stop that.
- **Give to… / the person-plus button** were already owner / manager / supervisor / supervisor 2 on screen and in `clean_assign`,
  `job_add`, `job_assign_labour` (`_clean_may_assign`). The gap was `housekeeping_tasks`' old `tenant_all` policy: any login could
  `update … set assigned_to` through the API. **0156** `trg_hk_assign_guard` refuses a change of `assigned_to` (or a task born given
  to someone) unless the caller may assign; no signed-in person (service role, cron) passes. `[data-clean-assign="open|select|new"]`.
- **Selvi Murugan (manoooo)** is role `supervisor_2` ("Supervisor (2nd level)"), Floor Supervisor, Housekeeping — so she rightly sees
  Give to…; a Room Attendant does not. Only first-level supervisors would mean taking `supervisor_2` out of `_clean_may_assign` (it
  also governs Work, labourers, sign-off and inspection).
- The browser checks `cleaner.mjs` / `cleaning.mjs` expected "*T1 to clean*"; it now reads "*T1 needs cleaning*".

## 2026-10-30 — I'll take it is the cleaners'; the bosses assign
- **The owner: "don't show I'll take it to everyone — only the housekeeping or cleaning people; a manager or supervisor gets assign."**
  `lib/notify.ts` `isCleaner(role, dept, position)`: the Housekeeping team (profile, else position's team, else role) or a Busser —
  never a boss (`CLEAN_BOSSES` = owner, manager, supervisor, supervisor 2). On the **Orders tile** (`OrdersClient`) and the
  **Cleaning board** (`JobCard` with `cleaner` given — tables and rooms; Work's jobs keep their rule): a cleaner takes a job nobody
  else was given; anyone takes the one given to them; a boss sees **Assign / Reassign** (Orders: a sheet "Who cleans T1?" — on
  duty first, then the cleaners, then by name — `[data-clean-give]`, `[data-clean-give-sheet]`, `[data-clean-give-to="Name"]`,
  `[data-clean-give-anyone]`; the board: the wide `[data-give-wide]` opens the Give to… select and the small person button goes)
  and finishes only what they took; a waiter or cashier sees *Waiting to clean* / *Being cleaned* (`[data-clean-wait]`).
- **The alert follows it:** kind `clean` reaches `deptSees(table) && (boss || isCleaner)` — waiters no longer hear tables to clean.
  `NotifierProvider` takes `position` from the layout for it.
- **The database is unchanged:** `clean_take` still lets anyone at the property take a job (only the button and the alert moved).
  Make it refuse too only together with `isCleaner`.
- Checked: `r157.mjs` (scratchpad) — owner, waiter, busser and cleaner logins made through `staff_create_login` on a demo.
