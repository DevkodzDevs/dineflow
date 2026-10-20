# Feedback & complaints — the staff speak to their owner

**Routes** `/voice`
**Files** `app/(app)/voice/page.tsx` · `VoiceClient.tsx` · `actions.ts` · `lib/voice.ts` (the words) ·
`components/voice/useVoiceUnread.ts` (the menu row's count) · the bell: `lib/notify.ts` (kind `voice`), `components/shell/Notifier.tsx`
**Reads** `staff_voice`, `staff_voice_replies`, `staff_voice_authors` (each person their own rows only)
**Writes** `voice_send`, `voice_reply`, `voice_set_status`, `voice_seen`, `voice_unread` (all 0124)

## What it is

The owner, 2026-10-20: "Help & support only for the owner; the manager and the other staff get a feedback or
complaints section — they tell the owner, and get updates." Help & support (0096) is the property talking to DineFlow;
this is the staff talking to their own owner. A waiter, a chef, a manager sends a **complaint, feedback, an idea or
thanks**, with or without their name; the owner reads it, answers, and moves it along; the sender sees each answer.

## How it works

- **One route, two faces.** `page.tsx` reads `staff_voice` (RLS decides the rows) and the role: the **owner** gets the
  inbox ("Staff feedback"), anyone else the composer and "What I sent" ("Feedback & complaints").
- **The composer** (`[data-voice-form]`): 1 what it is (`[data-voice-kind]`: complaint · feedback · idea · thanks), 2 what
  about — optional (`[data-voice-topic]`: work & shifts, pay & leave, a colleague, customers, equipment, safety,
  something else), 3 a title and the message (`[data-voice-subject]`, `[data-voice-body]`), and **Send without my name**
  (`[data-voice-anon]`, says exactly what the owner will see), then Send (`[data-voice-send]`). Ten a day.
- **The inbox** (`[data-voice-inbox]`): Open · New · Working on it · Resolved · All (`[data-voice-view]`) and by kind
  (`[data-voice-kind-filter]`), newest activity first; each card (`[data-voice-item]`, `[data-unread]`) shows the kind,
  topic, title, two lines, who ("Anonymous" when sent without a name), when and the status.
- **The thread** (a Sheet, `[data-voice-thread]`): the message and the answers as bubbles, a reply box
  (`[data-voice-reply]`, `[data-voice-reply-send]`), and for the owner Seen · Working on it · Resolved
  (`[data-voice-status]`). Opening it runs `voice_seen` — the owner's look moves a new item to *seen*. A staff answer on
  a resolved item opens it again.
- **Anonymity is in the data, not the screen.** An item sent without the name has no `author_id`, `author_name` or
  `author_role` on `staff_voice` at all; who sent it lives only in `staff_voice_authors`, whose one read policy is "your
  own rows". `staff_voice`'s read policy uses that table to let the author see their own — so the owner cannot find the
  name even by querying the tables. A reply from an anonymous author has `by_name` null.
- **Who reads (RLS):** the property's **owner** — every item and reply; anyone else — only their own. **Managers do not
  see their staff's items**: a complaint may be about them. A master standing in a property is its owner here
  (`auth_role()` is owner for Master control).
- **Updates.** `voice_unread()` — the owner: items whose last word is the staff's and unopened; anyone else: their own
  items the owner answered or moved since they looked. `useVoiceUnread(path)` asks it once per screen (for the menu
  row). **The bell** (`Notifier`, kind `voice`, every station but the kitchen screen): the owner hears a new item and a
  staff answer; the sender hears "Update from the owner — <title> — seen / the owner is on it / resolved". `staff_voice`
  is in `supabase_realtime`; RLS narrows the events the same way.
- **Help & support is now the owner's** (`/help`, `/help/[id]` redirect anyone else here; Master control keeps it).

## Before you edit

- **Never put the author on an anonymous row**, not even in a trigger or a view: the owner reads `staff_voice` directly.
- **The owner cannot send** (`voice_send` refuses: there is no one above them).
- Times are `clock_timestamp()` — a reply and the status it moves are written in one call (the 0096 lesson).
- The bell's alert cannot tell a reply from a status move (both move `owner_at`), so it says where the item stands.

## Verify

```
node dry124.cjs     # 34 — 0124 in a rolled-back transaction: owner, a named waiter, an anonymous chef, a manager,
                    #      another cook and anon; anonymity, threads, unread both ways, status, ten a day
```

## See also

[help-and-support.md](help-and-support.md) · [data-and-rls.md](data-and-rls.md) · [shell-and-nav.md](shell-and-nav.md)

- **Flap numbers (2026-10-20)** — design-system.md, *Flap numbers*. The owner's "n new" (`[data-voice-unread]`) breathes until opened.
