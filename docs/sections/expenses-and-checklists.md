# Expenses and checklists

**Routes** `/expenses` (`?m=2026-10`) · `/tasks`
**Files** `app/(app)/expenses/page.tsx` · `ExpensesClient.tsx` · `actions.ts` · `app/(app)/tasks/page.tsx` ·
`TasksClient.tsx` · `actions.ts` · `dept.ts` · `components/shell/sections.ts` (the two links)
**Reads** `expenses`, `checklists`, `checklist_runs`, `profiles` (names; departments for the list editor)
**Writes** `expense_add`, `expense_void`, `checklist_save`, `checklist_tick` (all 0105; the audience 0122, 0123)

## What it is

Two Petpooja features a small Indian restaurant uses every day. **Expenses**: the cashier or manager writes down
every rupee that goes out — vegetables, gas, rent, salaries — so Reports can say what is left after costs and the
accountant gets it in Tally. **Checklists**: the opening and closing duties the owner writes once; each person
ticks what they did, with their name and the time, and a missed day shows.

## How it works

- Both are "Insights & control" links (`FRESH` in `sections.ts`), not modules: there is no row in `role_modules`
  and no tick in Staff → Access. Expenses: owner, manager, supervisor, cashier — the page redirects anyone else,
  the RLS read policy and `expense_add` check the same four; since 2026-10-20 the link and the page also want a
  supervisor or cashier of a money team (service, front office, finance, management — `seesFresh` in `sections.ts`). Checklists: every role.
- **An expense paid in cash today also leaves the drawer**: `expense_add` inserts a `cash_movements` row
  (*out*, "Expense · Vegetables") and keeps its id, so `shift_expected` and the cash-up already know. A cash
  expense for an earlier day does not (that cash left an earlier drawer). `expense_void` (owner, manager, with a
  reason) puts a linked cash movement back (*in*, "Expense struck out · …"); the row stays, crossed through.
- The form leads with 16 category tiles (`CATEGORIES`, `[data-cat-grid]` of `[data-cat-chip]`) — "Other" opens a text box.
  Since 2026-10-21 (the owner: "messy") each is an icon tile in its own colour (`CAT_ICON`), laid out
  `repeat(auto-fill,minmax(4.6rem,1fr))`: three across at 360, four on a phone, more on wider screens; the chosen one
  wears a tint ring. Was 16 pills wrapping into six ragged rows. "Other" stays lit while a typed head is in the box. GST "in it" is part of the
  amount (it may come back as input credit); Reports and Tally take it apart. Excel downloads the listed month.
- **Checklists**: `checklist_save` (owner, manager, supervisor) keeps up to 40 duties as `text[]`;
  `checklist_tick` writes today's (IST) `checklist_runs` row, keyed by duty position, with who and when, and sets
  `completed_at` when every duty is ticked (an untick clears it). The card shows a progress bar, 56px duty rows
  and the last seven days as dots. *Start with Opening & Closing* writes two starter lists when there are none.

- **Each person sees the lists for their job (0122, 2026-10-20 — the owner's "a front-desk person sees only the
  front-desk checklists").** `checklists.departments` (department keys from `positions.ts`; empty = everyone). A person's
  department is `_my_dept()` (0116, the Work board's rule): the one set on their profile, else their role's — frontdesk →
  Front office, chef → Kitchen, waiter and cashier → Service, housekeeping, store → Stores (`tasks/dept.ts` mirrors it for
  the screen). **RLS** on `checklists` (`_checklist_for_me`) and, through it, on `checklist_runs` hands a person only the
  lists for everyone and for their department; the owner, managers and supervisors (who write the lists) see every one, a
  second-level supervisor with no department too (as on Work). `checklist_tick` refuses another department's list.
  - **The screen:** each card shows who it is for (`[data-for]` — "Everyone", or each team's icon and name in its
    colour); the editor has **Who is this for** (`[data-for-whom]`, `[data-dept=everyone|<key>]`) — Everyone, or any
    of the property's departments with how many people are in each, and how many the list reaches (`[data-reach]`);
    the owner's view can be narrowed to one team (`[data-list-filter]`, `[data-view]`; a New list from a team's view
    starts with that team picked); anyone else is told whose lists they see (`[data-my-lists]`).
  - `checklist_save(…, p_active, p_departments)` (six arguments) writes the audience and calls the five-argument one
    for the rest; the five-argument one is kept for older screens and never touches `departments`.

## Before you edit

- **Ticks are stored by position.** Reordering a list mid-day moves today's ticks onto other duties; the editor
  says so. If this ever matters, key duties by a stable id. Since 0108 a run counts only ticks that are still duties
  (`_checklist_ticked`), and saving a shorter list trims today's ticks beyond its end.
- A public page has no `ToastProvider`, but these pages do — `useToast` works here.
- `window.prompt` asks for the strike-out reason (as `confirm` does elsewhere); the probe stubs it.

## Verify

```
node dry105.cjs     # 37 checks, rolled back — expenses, checklists, payouts, phone, reports, Tally, anon
node dry122.cjs     # 23 checks, rolled back — who sees and ticks which list, by role and by position
node batch2.mjs     # 40 checks on a throwaway demo — see testing-and-gates.md
```

- **Short copy** (2026-10-23): subtitles and hints cut to a few words.

## See also

[controls-and-intelligence.md](controls-and-intelligence.md) (the drawer) ·
[reports-and-forecast.md](reports-and-forecast.md) · [tax-and-compliance.md](tax-and-compliance.md) (Tally)

- **By job and position too (0123, 2026-10-20 — the owner: "front desk was only an example; the lists follow each
  person's job nature and position").** A team alone is too coarse — a captain and a steward are both Service. A list
  names any mix of **teams** (`departments`), **jobs** (`jobs` — role keys: waiter, cashier, chef, frontdesk,
  housekeeping, store, employee, supervisor_2) and **positions** (`positions` — `profiles.position` keys from
  `POSITIONS`: captain, commis_2, gardener…); it is for a person whose team, job or position it names, or for everyone
  when it names none. RLS and `checklist_tick` use that rule (`_checklist_for_me(d, j, p)`); the owner, managers and
  supervisors still see every list.
  - **The screen** keeps the audience as tags (`d:kitchen`, `j:waiter`, `p:captain`; `tagsOf`, `reaches` in
    `TasksClient.tsx` — `reaches` mirrors the database rule). `page.tsx` offers the property's teams, the jobs someone
    does, and the positions someone holds (plus anything a list already names), each with a head count; it sends the
    editor the staff as `{ d, j, p }` (no names) so **Who is this for** can say how many people a mix reaches. The
    editor groups the choices under Teams / Jobs / Positions (`[data-for-kind]`, `[data-tag]`; teams keep
    `[data-dept]`). A job chip is a briefcase in blue, a position a badge in its team's colour. The owner's filter
    offers every tag in use; anyone else reads "Your lists — the ones for everyone and for" their team, job and position.
- **A team the property kind does not list is still a choice** (2026-10-20). A restaurant's front-desk host reads as
  Front office (`myDept`: the role's department), which `hierarchyFor('restaurant')` does not list — their lists had
  no filter chip and the card printed the bare key "front office". `page.tsx` now adds any `DEPARTMENTS` entry that
  someone stands in, a list is for, or the viewer belongs to, under its own label. Probe `shots20.mjs`: the owner sees
  all three lists with Everyone / Kitchen / Front office chips; a front-desk sign-in sees Opening and Front desk only.

- **Flap numbers (2026-10-20)** — design-system.md, *Flap numbers*. Each checklist card shows its done % on flap tiles (`[data-list-pct]`), counting up as duties are ticked.

- **Checklist cards line up** (2026-10-23, the owner: "one card to another not aligned"): every card in a row is the row's
  height (flex column, the items grow) with the week at its foot; the head is the shift's icon, the name in two lines before
  it cuts, the shift and the count, and **one progress ring** (SVG, `[data-list-pct]`) — it replaced the flap % and the bar
  under it; the week's dots carry the day letters, today ringed.
- **No expenses this month** (2026-10-24) is `Empty`'s sm+ form — the wallet, amber (design-system.md). The phone is unchanged.
