# Help & support

**Routes** `/help` · `/help/[id]` (inside a property) · `/admin/support` · `/admin/support/[id]` (Master control)
**Files** `app/(app)/help/{page,SupportClient,actions}.tsx|ts` · `app/(app)/help/[id]/{page,ThreadClient}.tsx` ·
`app/admin/support/{page,SupportDesk,actions}.tsx|ts` · `app/admin/support/[id]/{page,TicketDesk}.tsx` ·
`lib/support.ts` · `components/support/{icons,chips,shots,useUnread}.ts(x)`
**Reads** `support_tickets`, `support_messages`, Storage bucket `support`
**Writes** `support_open`, `support_reply`, `support_attach`, `support_set_status`, `support_set_access`,
`support_rate`, `support_seen` · Master control: `admin_support_reply`, `admin_support_set`, `admin_support_seen`,
`admin_support_drop_file` (migrations 0096, 0097)

## What it is

Anyone signed in to a property — the owner, a waiter, the housekeeper — raises a request with DineFlow:

- a **problem**, a **complaint**, a **question**, **feedback & ideas**, **billing**, or **privacy & consent**;
- a privacy & consent request is a grievance under the DPDP Act 2023 and the IT Rules 2021, answered within 15 days
  (`COMPANY.grievanceDays`). It also says what is wanted: withdraw consent, see / correct / delete data, or something
  else.

Master control sees every request from every property, answers it, and moves it to done. The person follows it on
their own thread and rates the help.

## How it works

**The property side, `/help`.** It is reached from the sidebar menu's last group (**Help & support** beside
Settings, after *Insights & control*, scrolling with the menu — every role, not a module; it was a row in the
sidebar's foot until 2026-10-13) and the phone's More sheet. The page has:

- three ways to reach DineFlow, from `lib/company.ts`;
- the **New request** form and **Your requests**, side by side from `lg`; two tabs below that.

The form takes:

- the kind (six tiles), and the topic for privacy;
- a subject (3–140) and details (10–5000);
- urgency (Low · Normal · High · Urgent);
- up to 3 screenshots, shrunk in the browser to JPEG ≤1600px;
- "Let DineFlow open your property to look into this" — consent, off by default;
- *What is sent with it*: property, name and role, page (`?from=`), device, screen.

Send runs `support_open`, then uploads the screenshots **from the browser** straight into
`support/<property>/<request>/…` (server actions stop at 2 MB), then `support_attach`. It lands on `/help/[id]?sent=1`.

The thread page has:

- a four-step bar: Received → Being worked on → Waiting for you → Sorted;
- the messages, with the screenshots as signed links for the hour;
- events in the property's own words (`eventText`);
- a reply box with screenshots — a reply reopens a resolved request;
- *This is sorted* / *Open it again*;
- the consent switch (changeable at any time, kept as an event);
- once sorted, a 1–5 star rating with a note, from the person who raised it only.

**Who sees what (RLS).**

- The person who raised a request sees it; the property's **owner and manager** see all of the property's requests.
- Master control sees everything.
- **Internal notes** are Master control's alone.
- Nobody writes the tables directly; every write is a definer RPC that checks the caller.

**Unread.** `support_unread()` counts the caller's own requests whose latest word is DineFlow's and unseen. It puts a
red dot on the menu row's icon (all the rail shows), a count beside its label, a "N new" on the More sheet row and adds to the More button's
count. `components/support/useUnread.ts` shares one answer between the sidebar and the tab bar, both mounted at every
width, asked once per screen. Opening the thread runs `support_seen`.

**Master control, `/admin/support`.** The **Support** tab carries a red count of requests whose latest word is the
property's and unread (`admin_support_badge`, read in the admin layout). The desk has:

- 8 counters: needs a reply, in progress, waiting on customer, urgent & high, privacy due ≤3 days, resolved in 7 days,
  median first reply, average rating (30 days);
- status tabs: Needs reply · Open · Waiting · Resolved · Closed · All;
- kind and property selects, and a search (subject, words, name, property, `SUP-12`);
- one row per request.

The request page has:

- the thread, with internal notes in a dashed amber card;
- a composer: *Reply to the property* (four quick replies, and the status after sending — default "Waiting on
  customer") or *Internal note*, both with screenshots;
- status and priority selects;
- timing: raised, first reply, resolved, the privacy deadline;
- the rating;
- the property, with *Property* and *Open* — **consent shown first**; without it the button reads *Open anyway* and
  asks;
- the person, with email, call and WhatsApp;
- where they were (page, device, screen, theme, online, language, version);
- the property's other requests.

Each screenshot has a remove button (0097): the path comes off the message, the thread tells the property, and the file
is deleted through the Storage API.

## Before you edit

- **The page is `/help`, not `/support`.** Middleware's `ALIASES` sends `/support` to the public `/legal/contact` —
  a signed-out visitor needs that. Master control's desk is `/admin/support`, which no alias touches.
- **Times in 0096 are `clock_timestamp()`, not `now()`.** A reply and the status event it causes are written in
  one call, and `now()` (the transaction's start) gave them the same instant and no order — and it made a dry run's
  unread check compare equal times.
- **Storage refuses a direct `delete from storage.objects`** (`protect_objects_delete`). A file goes through the
  Storage API, under `support_files_delete`, which only Master control meets. A test that uploads cleans up the same
  way.
- **The property cannot delete what it sent.** It stays as evidence until Master control removes it.
- **`support_attach` only takes paths in the request's own folder**, only on the caller's own message, once, up to
  three, and only files that exist. Uploading into another property's folder is refused by the Storage policy.
- **A master raising a request from inside a property** is recorded as `raised_role = 'master'` and named "DineFlow
  support" (no profile). It is real and visible to that property's owner.
- **The hourly limit:** ten requests per person per hour (`support_open`).
- **Icons are looked up on the client** (`components/support/icons.tsx`). `lib/support.ts` has only the words, so a
  server page can import it.

## Verify

```
node dry96.cjs        # 26 — 0096 in a rolled-back transaction, every caller played by role + JWT claims
node dry97.cjs        # 4  — 0097: Master control removes a screenshot; the property cannot
node supportflow.mjs  # 14 — raise with a screenshot → desk badge, list, reply, note → the property sees the
                      #      reply (not the note) and the unread badge → sorted, rated → screenshot removed;
                      #      deletes everything it made (rows, admin_log lines, the file), restarts the numbering
```

Run it in both themes: `DARK=1` forces dark in the test browser only, because the master login has paper saved.
Also run it at 412, 834, 1194 and 1440.

## See also

[admin-and-membership.md](admin-and-membership.md) · [shell-and-nav.md](shell-and-nav.md) ·
[data-and-rls.md](data-and-rls.md) · [legal.md](legal.md)
