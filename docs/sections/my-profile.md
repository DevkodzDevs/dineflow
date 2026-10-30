# My profile

**Routes** `/me`
**Files** `app/(app)/me/page.tsx` · `MeClient.tsx` · `actions.ts` · `components/shell/TopBar.tsx` (the circle's link)
**Reads** `profiles` (own row, and the name of who they report to), `staff_attendance`, `checklists`, `checklist_runs`, `jobs`
**Writes** `my_profile_save` (0125), `staff_request_contact_otp`, `staff_verify_contact` (0060/0098), Supabase Auth `signOut({ scope: "others" })`

## What it is

Each person's own page (2026-10-20 — the owner: "a Settings option for the staff's own profile, to control their
profile settings and update their profile"). Everyone has it, the owner included: what the property knows about them,
the details they keep themselves, their sign-in, today at a glance, and this device's look, language and alerts.

## How it works

- **Who I am — read-only.** A band and a circle in their colour (initials of the name they go by), their position title
  and team chip, then four facts in an even 2×2 (`[data-me-facts]`): Access (role), Staff code, Joined, Reports to. All
  are the owner's to set on Staff; a line under them says so.
- **Your details — theirs** (`[data-me-form]`, saved together by `[data-me-save]`, which says *Saved* until something
  changes; *Undo* puts the last saved values back): the name they go by (`display_name` — the legal `full_name` the owner
  wrote stays on the staff list, and the page says so), phone, email, an emergency contact and number, the languages they
  can serve a guest in (12 chips, each in its own script, `translate="no"`), a line about them (200), and the colour of
  their circle (`avatar_tone`: Team = their team's colour, or one of eight tokens).
- **`my_profile_save` (0125)** is the only way in — `profiles` has no direct update for the API roles (0084). Security
  definer, pinned search_path; it writes the caller's own row (`auth.uid()`, an active profile) and only those columns —
  never role, team, position, staff code, reports_to, active, property or the legal name. It trims and checks every field
  (phone 10–13 digits, an email shape, the language and colour lists, lengths) and answers in plain words. **A new
  contact email clears `contact_verified_at`.**
- **Email proof** (`[data-me-email-state]` = verified · unverified · editing · none): *Send a code* / *Verify* call the
  same RPCs Staff uses — they already let a person ask for and check their own code (`me.id = t.id`). Mail not set up on a
  dev server shows the code in the toast (`echoed`).
- **Sign-in & security** (`[data-me-security]`): the sign-in ID, **Change** → `/account/password` (its own emailed-code
  flow, reused as is), **Sign out others** (`signOut({ scope: "others" })` — every other device's session ends, this one
  stays), and the header's *Sign out* (`POST /logout`, as Settings).
- **Today** (`[data-me-work]`, `[data-me-today=attendance|lists|jobs]`): today's punch (not for the owner) → /attendance,
  how many of their lists are done (RLS already hands them only their own, 0122/0123) → /tasks, open jobs given to or
  taken by them → /work.
- **This device** — `ThemePicker`, `LangPicker` and `NotificationSettings`, the very components Settings → Appearance and
  Notifications use (`[data-me-prefs]`, `[data-me-alerts]`).
- **Master control acting as an owner** has no profile row here: the page shows a short card saying so, and the device part.
- **The top bar's circle** goes to Settings for whoever may open it; for everyone else it now goes here (`[data-my-profile]`).
  The menu rows ("Settings" for staff, "My profile" for the owner) are wired in `sections.ts` / `Nav.tsx` — see
  [shell-and-nav.md](shell-and-nav.md).

## Before you edit

- **Before 0125 is applied the page still opens**: `page.tsx` falls back to the old columns and the client disables the
  new fields (`ready=false`, a line says why). Saving needs 0125.
- `display_name` is shown on this page only (and as the circle's initials). Other screens still use `full_name` — adopt it
  screen by screen if the owner wants, never by overwriting `full_name`.
- The avatar colours are tokens; *Gold* is `--color-orange` mixed 70% with `--color-label`, so it is light gold on dark
  and bronze on paper.

## Verify

```
node dry125.cjs     # 21 checks, rolled back — own row only, only the self-editable columns, every refusal, anon
pnpm lint && pnpm typecheck && pnpm test
```

## See also

[staff-and-labour.md](staff-and-labour.md) (the facts, contact verification) · [settings.md](settings.md) (Appearance,
Notifications) · [auth-and-session.md](auth-and-session.md) (`/account/password`) · [data-and-rls.md](data-and-rls.md) (0125)

- **The profile card** (2026-10-23): the avatar now opens a summary of this page before it — shell-and-nav.md, *The avatar
  opens the profile card*; `myCard` in actions.ts. **Menu style** sits under Language on This device (SidebarPicker).

- **Sign-in & security, redrawn** (2026-10-23, the owner: "ultra modern, every screen"): the ID on a tinted pass
  (`[data-me-pass]`) with a copy key; **Password** and **Other devices** as two tiles (auto-fit 14rem — side by side where
  there is room, stacked on a phone); Sign out others asks in a sheet (`[data-me-signout-ask]`, `[data-me-signout-yes]`), not
  `confirm()`. The page's lines are cut to a few words (Short copy, design-system.md).

- **This device → Show Assist** (`[data-me-assist]`, only for whoever has Assist): brings the button back after a drag put it away.

- **The profile header on iPad and desktop (2026-10-24, the owner: "design").** Only `md:` classes and `hidden md:block` layers
  — a phone draws exactly what it did. The band is 144px: the app's tint → blue → violet under the person's own colour, a faint
  dot texture fading in from the left and two soft circles, so a person with no tone (grey) still gets a living band; the circle
  is 112px with a 6px ring and a shadow; the name 30px. The four facts are tiles in a row (`md:grid-cols-4`), each icon in
  its own colour (Access green, Staff code blue, Joined amber, Reports to violet — `--fh`). On a phone the facts stay the
  two-column panel (design24b.mjs asserts 2 columns at 412).
- **Shorter copy (2026-10-29, the owner: "maximum 3 or 4 words, try 2 or 3 — clean and neat").** Subtitles, hints, helper
  lines and empty-state hints cut to two–four words, or removed where they said the obvious. Error and refusal messages,
  steps to follow outside the app, printed and exported text, WhatsApp bodies and tooltips were left as they were.
- **Collapse menu** (2026-10-30) sits under the six looks on This device (`SidebarPicker`, `[data-sidebar-fold]`) — the menu's own
  fold key is gone. The profile sheet has **Sign out** (shell-and-nav.md).
