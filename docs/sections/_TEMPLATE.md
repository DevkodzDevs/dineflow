# <Section name>

> Copy this file, fill it in, and add a row to [README.md](README.md).
> Keep it under a screen. A note nobody finishes reading is a note nobody reads.

**Routes** `/x` · `/x/[id]`
**Files** `app/(app)/x/page.tsx` · `XClient.tsx` · `actions.ts`
**Reads** `table_a`, `table_b`
**Writes** `rpc_one`, `rpc_two`

## What it is

Two or three sentences. What job does this screen do for the person standing in front of it, and
who is that person — the owner, the cashier, the chef, the housekeeper?

## How it works

The flow in order: what `page.tsx` fetches, what the client does with it, what each action writes.
Name the non-obvious decisions and say why they were made that way. Skip anything a reader can see
in ten seconds of reading the file.

## Before you edit

The list of things that have already gone wrong here, or that will if you are not told. One line
each, specific. Examples of the right kind:

- The grid track is `minmax(0,1fr)`, not `1fr` — `1fr` refuses to shrink below its content and
  pushed the rail off-screen on a phone.
- `is_available` is a dish-level flag; stock is checked separately in `menu_stock`.

If there is nothing, write "Nothing special — the usual rules in
[README.md](README.md) apply." Do not pad.

## Verify

The exact commands and the exact numbers to expect.

```
pnpm --filter @dineflow/web typecheck
node <suite>.mjs        # N checks
```

## See also

Links to the notes a change here usually drags in.
