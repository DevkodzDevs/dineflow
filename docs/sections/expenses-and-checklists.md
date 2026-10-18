# Expenses and checklists

**Routes** `/expenses` (`?m=2026-10`) · `/tasks`
**Files** `app/(app)/expenses/page.tsx` · `ExpensesClient.tsx` · `actions.ts` · `app/(app)/tasks/page.tsx` ·
`TasksClient.tsx` · `actions.ts` · `components/shell/sections.ts` (the two links)
**Reads** `expenses`, `checklists`, `checklist_runs`, `profiles` (names)
**Writes** `expense_add`, `expense_void`, `checklist_save`, `checklist_tick` (all 0105)

## What it is

Two Petpooja features a small Indian restaurant uses every day. **Expenses**: the cashier or manager writes down
every rupee that goes out — vegetables, gas, rent, salaries — so Reports can say what is left after costs and the
accountant gets it in Tally. **Checklists**: the opening and closing duties the owner writes once; each person
ticks what they did, with their name and the time, and a missed day shows.

## How it works

- Both are "Insights & control" links (`FRESH` in `sections.ts`), not modules: there is no row in `role_modules`
  and no tick in Staff → Access. Expenses: owner, manager, supervisor, cashier — the page redirects anyone else,
  the RLS read policy and `expense_add` check the same four. Checklists: every role.
- **An expense paid in cash today also leaves the drawer**: `expense_add` inserts a `cash_movements` row
  (*out*, "Expense · Vegetables") and keeps its id, so `shift_expected` and the cash-up already know. A cash
  expense for an earlier day does not (that cash left an earlier drawer). `expense_void` (owner, manager, with a
  reason) puts a linked cash movement back (*in*, "Expense struck out · …"); the row stays, crossed through.
- The form leads with 16 category chips (`CATEGORIES`) — "Other" opens a text box. GST "in it" is part of the
  amount (it may come back as input credit); Reports and Tally take it apart. Excel downloads the listed month.
- **Checklists**: `checklist_save` (owner, manager, supervisor) keeps up to 40 duties as `text[]`;
  `checklist_tick` writes today's (IST) `checklist_runs` row, keyed by duty position, with who and when, and sets
  `completed_at` when every duty is ticked (an untick clears it). The card shows a progress bar, 56px duty rows
  and the last seven days as dots. *Start with Opening & Closing* writes two starter lists when there are none.

## Before you edit

- **Ticks are stored by position.** Reordering a list mid-day moves today's ticks onto other duties; the editor
  says so. If this ever matters, key duties by a stable id. Since 0108 a run counts only ticks that are still duties
  (`_checklist_ticked`), and saving a shorter list trims today's ticks beyond its end.
- A public page has no `ToastProvider`, but these pages do — `useToast` works here.
- `window.prompt` asks for the strike-out reason (as `confirm` does elsewhere); the probe stubs it.

## Verify

```
node dry105.cjs     # 37 checks, rolled back — expenses, checklists, payouts, phone, reports, Tally, anon
node batch2.mjs     # 40 checks on a throwaway demo — see testing-and-gates.md
```

## See also

[controls-and-intelligence.md](controls-and-intelligence.md) (the drawer) ·
[reports-and-forecast.md](reports-and-forecast.md) · [tax-and-compliance.md](tax-and-compliance.md) (Tally)
