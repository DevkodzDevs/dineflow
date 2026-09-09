# DineFlow — the complete startup guide

*From an empty computer to a running restaurant, hotel or resort, one step at a time. Written for the
person who has never done this before. Every command in here was checked against the files in this
folder on 4 September 2026 (v20).*

You can stop after any part and pick up later. Each part says what you need, what to type, and what
you should see when it worked.

---

## Contents

**A · Before you begin**
1. What DineFlow is, and what you are about to set up
2. What you need
3. The one account you must create: Supabase

**B · Getting it running**
4. Unzip and open the launcher
5. First run: option 1 (configure, install, database, open)
6. Sign in as the master
7. Load the sample estate and look around

**C · Your real property**
8. Create your property in Master control
9. Decide what the property has (Master → Access)
10. Walk in as the owner
11. Set up the property: name, GST, tables or rooms
12. Menu, recipes and pantry
13. Hire staff and decide what each can open (Owner → Access)

**D · A day of service**
14. The control room, and the numbers on the board
15. Taking an order, the kitchen, the bill
16. Hotel day: front desk, rooms, housekeeping
17. Pulse: wait times and the queue at the door
18. When the internet goes
19. Closing the shift

**E · The parts that make it yours**
20. The storefront: guests book and order online
21. Tomorrow's brief, Leak finder, Neighbours, Proof of business
22. Assist: the tile in the corner
23. Dark, light, and the phone app

**F · Going live**
24. Put the web app on the internet (Vercel or your own server)
25. Build the phone app (APK, Play Store, iOS)
26. Thermal printers
27. The Box: running the building without internet
28. Before the first paying customer: the go-live checklist

**G · When something goes wrong**
29. Problems and fixes
30. Backups, restore, and how to update

---

# A · Before you begin

## 1. What DineFlow is, and what you are about to set up

DineFlow is one system for a restaurant, a hotel or a resort. Waiters take orders on their phones,
the kitchen sees them the same second, the front desk posts dinner to the room, the pantry drops with
every dish sold, and the owner sees the day's money on one board.

It has three pieces:

| Piece | What it is | Where it runs |
|---|---|---|
| **Web app** | Everything, on any browser | Your laptop now; the internet later |
| **Phone app** | The parts a waiter, cook or host needs on a phone | Expo Go now; an APK later |
| **Database** | The one truth, with all the rules inside it | Supabase (free tier is enough to start) |

There are also three kinds of people:

| Person | Signs in to | Decides |
|---|---|---|
| **Master** | Master control, and nothing else | Which properties exist, what each property has |
| **Owner** | Their property's control room | Who works there, what each employee can open |
| **Employee** | Their property, seeing only their sections | Nothing about access |

Each one only looks down. Nobody can grant more than they hold.

## 2. What you need

- A computer: Windows 10/11, macOS 12+, or Ubuntu 22.04+. 8 GB RAM is comfortable.
- **Node.js 20 or newer.** Get it from [nodejs.org](https://nodejs.org) — choose the LTS download. When it
  is installed, open a terminal and type `node -v`. ✅ You should see `v20` or `v22`.
- **pnpm.** In the same terminal: `npm i -g pnpm`. Then `pnpm -v`. ✅ A version number.
- An internet connection for the setup. (After that, see Part 18 and Part 27.)
- For the phone app: an Android or iPhone with **Expo Go** from its app store, on the same wi-fi.

That is everything. Docker is only needed if you choose the Box (Part 27).

## 3. The one account you must create: Supabase

> Every connection the app has — database, Anthropic, aggregator webhooks, OTA calendars, printers,
> the Box, hosting, phone builds — is covered wire by wire in **CONNECTIONS-GUIDE.md**. This part
> is the minimum to get started.

The database lives in Supabase. It is free for one project of this size.

1. Go to [supabase.com](https://supabase.com) → **Start your project** → sign up.
2. **New project.** Name it `dineflow`. Choose a strong database password and **write it down** — you
   will need it once, in step 5. Region: Mumbai (`ap-south-1`) if you are in India.
3. Wait for the green "Project is ready".
4. Left sidebar → **Project Settings** (the gear) → **API**. You need two values:
   - **Project URL** — looks like `https://abcdefgh.supabase.co`
   - **anon public** key — a long string starting `eyJ…`
5. Left sidebar → **Project Settings** → **Database** → **Connection string** → **URI**. Copy it and
   replace `[YOUR-PASSWORD]` with the password from step 2. This is your `DATABASE_URL`. Keep it
   private; it can do anything to your data.

✅ You have three strings: the URL, the anon key, and the database URL.

---

# B · Getting it running

## 4. Unzip and open the launcher

1. Unzip `dineflow-complete.zip`. You get a folder called `dineflow`.
2. Open it:
   - **Windows:** double-click `Start-DineFlow.bat`
   - **Mac:** double-click `Start-DineFlow.command` (first time: right-click → Open)
   - **Linux / any terminal:** `cd dineflow && ./start.sh`

You will see the launcher menu:

```
  1  Local: configure + install + database + open web app
  2  Local: start the mobile app (Expo Go on your phone)
  3  Live: deploy web to Vercel (one command)
  4  Live: run on your own server with Docker
  5  Live: build Android APK / Play Store / iOS
  6  Configure Supabase keys again
  7  Database only: run/repair migrations + master admin
  8  Start the thermal print bridge (LAN printers)
  9  Box: run the building on this computer — works with AND without internet
 10  Box: restore a backup
 11  Developer: live-reload server (slower first page, instant edits)
```

This menu is the whole operating manual. Everything below is one of these numbers.

## 5. First run: option 1

Type `1` and press Enter. It asks for the three strings from Part 3, then:

1. writes `apps/web/.env.local` for you,
2. installs everything (`pnpm install` — two to five minutes the first time),
3. runs all **20 database migrations** in order and creates the master login,
4. **builds the app once** (about a minute; later starts skip this unless the code changed),
5. opens `http://localhost:3000` in your browser.

Option 1 runs the *production* build, so every page opens in well under a tenth of a second. Only
developers changing the code need option **11**, the live-reload server, which compiles each page
on first visit.

✅ You should see the DineFlow sign-in page: a dark wall with a live flip clock on the left.

If anything goes wrong here, see Part 29. The most common cause is a `DATABASE_URL` with the
password still reading `[YOUR-PASSWORD]`.

> **What the migrations did.** They built every table and rule the product needs, and they were each
> executed against a real PostgreSQL engine before shipping (`scripts/sqltest/`). You do not need to
> touch the database directly, ever.

## 6. Sign in as the master

The master account is built in.

| | |
|---|---|
| Email | `master@dineflow.in` |
| Password | `DineFlow@Master2026` |

✅ You land on **Master control** — not a property. It lists properties (none yet), membership keys,
and a log. This is the only place the master ever goes; a property is opened from here with **Open**
on its row, which walks in as that owner.

**Change this password now:** Master control → **Change master password**. The default is printed in
this guide and in `SAMPLE-LOGINS.md`, so it is public.

## 7. Load the sample estate and look around

Before creating your own property, see a full one.

Master control → **Sample estate** → **Load the sample estate**. About a minute. It creates six
properties — two restaurants, two hotels, two resorts — with sixty days of orders, bills, bookings,
stock and staff, all in one district so the Neighbours network has something to compare.

Every sample owner uses the password `Dine@1234`:

| Property | Type | Login |
|---|---|---|
| Annapoorna Mess | restaurant | `owner@annapoorna.in` |
| Tamizh Kitchen | restaurant | `owner@tamizh.in` |
| Marina Hotel | hotel | `owner@marina.in` |
| Pearl Residency | hotel | `owner@pearl.in` |
| Kanyakumari Bay Resort | resort | `owner@bayresort.in` |
| Pine Hill Resort | resort | `owner@pinehill.in` |

Press **Open** on Kanyakumari Bay Resort. ✅ You are on its **control room**: three flip tiles, today's
money, the live floor, rooms in house. Click around — nothing here is precious. When you are done,
the banner at the top returns you to Master control.

**Before going live, delete the sample estate.** There is no button for this on purpose — it is
destructive. `SAMPLE-LOGINS.md` has the six-line SQL that removes all six properties and their
owners; paste it into Supabase → SQL editor → Run. The logins above are public.

---

# C · Your real property

## 8. Create your property in Master control

Master control → **New property**. Fill in:

- **Name** — as guests know it.
- **Type** — restaurant, hotel or resort. This decides which sections exist (a restaurant has no
  rooms; a hotel has no facilities board; a resort has everything).
- **Owner's name and email** — the owner's sign-in. They get a temporary password to change.

✅ The property appears in the list on a 7-day trial. To make it permanent: **Issue key** → give the
key to the owner → they enter it under Settings → Membership. Keys are for 30, 90 or 365 days.

## 9. Decide what the property has (Master → Access)

On the property's row, tap **Access**. You see every section the property type allows, grouped:
Front of house · Hotel · Kitchen & stock · Money · People & network.

- **Everything** (the default) — the owner gets all of it.
- **Choose** — switch off what this property should not have. A small mess with no online
  ordering; a landlord who should not see Proof of business; a canteen with no billing.

**Control room** and **Settings** can never be switched off, so an owner always has somewhere to land.

What you switch off vanishes from the owner's menu, from every employee's phone, and cannot be
reached by typing the address. **Save access.**

## 10. Walk in as the owner

Two ways:

- **As the master:** press **Open** on the row. You are now acting as that owner; a banner says so.
- **As the owner:** sign out, sign in with the owner email. This is what the owner will do every day.

Either way ✅ you land on the property's control room. It is nearly empty; that is correct.

## 11. Set up the property: name, GST, tables or rooms

**Settings → Property.**
- **Logo** and **Brand colour** — your own mark and accent on your control page instead of DineFlow's. A square PNG or SVG address; leave blank for your initial.
- **GSTIN**, address, phone — these print on every bill and invoice.
- **GST rate** — 5% for most restaurants without input credit; hotels use the room rate slab. Ask
  your CA once; it is one number.
- **Service charge %** — leave 0 unless you add one.
- **Check-in / check-out times** (hotels).

**Settings → Tables** (restaurants and resorts): add each table with its name, seats and zone
(Floor, Garden, Rooftop…). The seat count matters — Pulse uses it to quote waits, and the
storefront refuses bookings past it.

**Rooms** (hotels and resorts): Rooms → **Room types** first (Deluxe, Sea view…, with the base
rate), then add each room to a type. Rooms → **Rates** lets you change price by date later.

## 12. Menu, recipes and pantry

**Pantry first** (Pantry → **+ Ingredient**): everything you buy — rice, chicken, ghee, coffee
powder — with its unit, cost per unit, and a **reorder level**. Ten minutes for a small kitchen.

**Then the menu** (Menu → **+ New dish**): name, price, veg or not, category. Open the dish and add
its **recipe**: 180 g basmati, 200 g chicken, 20 ml ghee. This is the step that makes the pantry
move by itself — every biryani sold takes those grams out of stock.

You do not have to do every recipe on day one. Start with the ten dishes that sell most; add the
rest as you go. Dishes without a recipe still sell; they just don't move stock.

## 13. Hire staff and decide what each can open (Owner → Access)

**Staff → + Invite.** Pick a role and you get a code. The person opens the app, taps **Join with
code**, enters it, and they are in — no email needed.

Roles and their sensible defaults:

| Role | Opens by default |
|---|---|
| Manager | Everything except Settings |
| Cashier | Orders, billing, invoices, reports, reservations, Pulse, front desk |
| Waiter | Orders, reservations, Pulse, scan |
| Chef | Kitchen, menu, online orders, tomorrow's brief, scan |
| Store | Pantry, labour, tomorrow's brief, neighbours, scan |
| Front desk | Front desk, rooms, guests, facilities, housekeeping, reservations, channels |
| Housekeeping | Housekeeping, rooms, scan |

Then, next to any person, tap **Access**: change the role, and **untick** any section that one person
should not see. You only see sections the master allowed *and* that role may ever have. Some rules the
system enforces for you: you cannot change your own role or deactivate yourself; the last owner cannot
be demoted; a manager cannot touch an owner.

---

# D · A day of service

## 14. The control room, and the numbers on the board

The control room is the owner's home. Read it left to right:

- **Three flip tiles** — the numbers that matter right now: tables in use, orders open, tickets in
  the kitchen (red when something is late, green when something is ready to serve).
- **Taken today** — the money, with what is still on the floor unbilled.
- **Live floor** — every open table, its total, and a dot: green served, amber cooking.
- **Selling today** and **Reorder now** on the right.

The tiles turn over digit by digit as the day moves. Every number on it is a link.

## 15. Taking an order, the kitchen, the bill

**Orders.** Tap a table → the order pad. Tap dishes; quantities flip up. A note on a line
("less spicy") goes to the kitchen with it. **Send to kitchen** — the ticket is on the kitchen screen
the same second, and stock is already deducted.

**Kitchen.** Three columns: New, Cooking, Ready. Each ticket carries a minute tile that turns red at
fifteen. Tap **Start cooking**, then tap lines as they come up, then **All ready**. The waiter's
screen shows the tick.

**Billing.** From the table, **Bill**. Discount if any, then **Mark paid** with cash, UPI, card, split,
or **to the room** (hotels). A thermal receipt prints if you have a printer (Part 26); otherwise
**WhatsApp** sends a picture of the bill. GST is split into CGST and SGST for you.

## 16. Hotel day: front desk, rooms, housekeeping

**Front desk** shows today's arrivals and departures. **Check in** a booking → pick a room → the key
card on the Rooms board turns dark. Dinner ordered "to the room" lands on the **folio**. **Check out**
settles the folio and prints one GST invoice.

**Rooms** is the board: every room, its status, who is in it, until when. Tap a room for the folio.

**Housekeeping** lists rooms to turn in the order that matters: departures first, then arrivals due
before 2 pm. Housekeepers tap Start and Done on their phones.

**Reservations** are bookings that came from the storefront (Part 20), with the occasion and the note
the guest left.

## 17. Pulse: wait times and the queue at the door

When the door is busy, open **Pulse**. It reads every occupied table's ticket — ordered, eating,
served, bill out — and your own history of how long a sitting takes here, and says when each table
will free up. Tap a party size and it quotes an honest wait.

Walk-ins go on the queue with a name. **Call** when a table is close; **Seat** picks a free table
big enough. Or print the **QR** for the door: guests join from their own phone and watch their place
move up. When you seat them, their phone shows the table number. No SMS, nothing to install.

## 18. When the internet goes

Keep working. Orders, kitchen tickets, the queue, stock counts, housekeeping and table changes all
carry on and are stored on the device — they survive a page reload and a closed app. A dark bar says
*Working offline · 4 waiting*. When the line returns, a green bar says *Back online · 4 sent* and
everything is really there, **once each**, even if the connection died halfway through sending.

For a building whose internet is unreliable every day, see the Box (Part 27).

## 19. Closing the shift

**Billing → Close shift.** It shows what the tills should hold — cash, UPI, card — from the day's
bills. Type the cash in the drawer and the float you keep. It says *₹50 short* or *exact* before you
press anything. **Close shift** writes one plain paragraph you can paste to the owner on WhatsApp,
and the next shift starts from zero.

After midnight it counts from yesterday's 06:00, so a late kitchen's takings are never left out.

---

# E · The parts that make it yours

## 20. The storefront: guests book and order online

**Settings → Storefront & offers.** Turn on **Listed publicly**. Your property appears at
`/dine` and has its own page at `/dine/your-slug` with **Book a table** and **Order online**. Add
**offers** — "15% off before 7pm" becomes a badge on those exact time slots. Print the QR for the
counter. Every booking and order through it costs you 0% commission.

Bookings land on **Reservations**; online orders on **Online orders**.

## 21. Tomorrow's brief, Leak finder, Neighbours, Proof of business

- **Tomorrow** — before you lock up: predicted covers from comparable days plus the bookings already
  in, a prep sheet, and a market list you can send to the supplier. It grades itself next day.
- **Pantry → Leak finder** — count the shelf once (two minutes). From then on the gap between what
  recipes say you should have and what you counted is the leak, in rupees, item by item. Count the
  five dearest items weekly.
- **Neighbours** — opt in under Settings → Neighbours. Five or more places in your district share
  what they pay, what is going spare, and who can cover a shift. Nobody ever sees your figures alone;
  below five sharers the page goes blank on purpose.
- **Proof of business** — each month is sealed with a fingerprint chained to the month before. Share
  a link with a bank or your CA; it verifies live and expires when you say. Edit one sealed figure and
  every later month says so.

## 22. Assist: the tile in the corner

The small tile with a spark, bottom right of every screen (or **⌘J / Ctrl+J**). It already knows which
screen you are on and offers three questions worth asking there. Ask in your own words: *who is late
in the kitchen*, *what do I reorder*, *how long for a party of four*. It answers from that screen's
numbers and the rest of the house, and tells you what to tap. It never changes anything on its own;
the few things it can do — page a waiting party, draft the supplier message — appear as a button you
confirm. When something needs you, the spark turns red before you ask.

It needs one optional key: `ANTHROPIC_API_KEY` in `apps/web/.env.local` (from console.anthropic.com).
Without it, Assist still opens and shows the facts, and Scan's photo recognition returns a marked
sample. Everything else runs.

## 22b. About

The quiet *About DineFlow* link under the sidebar foot (and under **More** on the phone) opens the whole
product on one page — every section, the signature features, the guides, and what is deliberately not built.
Useful when a new employee asks "what is this thing?"

## 23. Dark, light, and the phone app

**Dark** is the board — the sun/moon in the top bar flips to **light**, and Settings → Appearance can
**follow the device**. Guest pages are always bright.

**The phone app** (launcher option `2`): five tabs in the order a shift happens — Control · Orders ·
Kitchen · Pulse · More. Pull down to refresh. Every write works with no signal. Employees see only the
tabs the owner allowed them.

---

# F · Going live

## 24. Put the web app on the internet

**Option 3 — Vercel (easiest, free to start).** Make a free account at vercel.com, install their
CLI when the launcher asks, and it deploys with your keys in one command. You get an address like
`dineflow-yourname.vercel.app`. Put it in Supabase → Authentication → URL configuration as the site
URL so sign-in links work.

> **OTA calendars on a free Vercel plan.** Hobby accounts may run a scheduled job only once a day, so
> the shipped schedule pulls Booking.com / Airbnb calendars nightly at 02:30 IST. The Channels page
> also syncs the moment you open it. If you take same-day OTA bookings and want the old 15-minute
> pull, either upgrade to Vercel Pro and set `"schedule": "*/15 * * * *"` in `apps/web/vercel.json`,
> or point any free scheduler (cron-job.org, a GitHub Action) at
> `https://your-app/api/ota/sync?key=CRON_SECRET`. Option 4 below has no such limit.

**Option 4 — your own server with Docker.** Any Ubuntu box or VPS. The launcher builds the image and
writes a `docker compose` you can start with one line. Point a domain at it and put it behind
Caddy or Nginx for HTTPS.

Either way, set `NEXT_PUBLIC_APP_URL` to the public address so QR codes and share links use it.

## 25. Build the phone app

Option `5`. It asks which:

1. **Android APK** — a file you share on WhatsApp; staff install it directly. Fastest.
2. **Android Play Store** — the store build.
3. **iOS TestFlight / App Store** — needs an Apple developer account.

All three go through Expo's EAS build service (free tier is enough). The launcher walks you through
signing in. For Expo Go during setup you needed nothing; for a real build you need this once.

## 26. Thermal printers

Two kinds work:

- **Bluetooth / USB** ESC/POS printers from the phone or laptop's browser — Settings → Printers →
  **Pair**. Chrome only.
- **LAN printers** — run the print bridge (option `8`, or `Print-Bridge.bat`) on any PC in the
  building; it finds printers on the network. Set one for bills, one for the kitchen.

Test with Settings → Printers → **Test print**. If nothing prints, Part 29.

## 27. The Box: running the building without internet

If your internet fails often, option `9` turns any always-on PC in the building into the **Box**: it
runs its own copy of the database. Phones and the counter talk to it over wi-fi whether or not the
internet is up. When the internet is up, the Box and the cloud keep each other in step: menu and
rooms flow down, orders and bookings flow up, the storefront keeps taking bookings from outside.

Needs Docker Desktop on that PC. The launcher installs everything else and prints the address to put
on each phone. Option `10` restores a nightly backup.

## 28. Before the first paying customer: the go-live checklist

- [ ] Master password changed (Part 6)
- [ ] Sample estate removed with the SQL in `SAMPLE-LOGINS.md` (Part 7)
- [ ] GSTIN, address and GST rate entered (Part 11)
- [ ] Every table with the right seat count; every room in a type (Part 11)
- [ ] The ten best-selling dishes have recipes (Part 12)
- [ ] Every ingredient has a reorder level; one stock count done (Parts 12, 21)
- [ ] Each employee invited, with a role, and Access checked (Part 13)
- [ ] A test order → kitchen → bill → paid, on a phone and on the counter (Part 15)
- [ ] The printer prints a test bill (Part 26)
- [ ] Wi-fi off for one minute mid-order; it comes back with *Back online · N sent* (Part 18)
- [ ] Web address set in Supabase URL configuration (Part 24)
- [ ] The QR at the door opens the storefront on a stranger's phone (Part 20)

---

# G · When something goes wrong

## 29. Problems and fixes

| You see | What it means | Do this |
|---|---|---|
| `DATABASE_URL missing` or `password authentication failed` | The database string is wrong | Option `6`, paste the URI again with the real password |
| The sign-in page loads but sign-in spins forever | Wrong Supabase URL or anon key | Option `6` |
| `relation … does not exist` | A migration didn't run | Option `7` — it re-runs them; they are safe to repeat |
| Master control is empty after Sample estate | Wait a minute and refresh — it seeds sixty days | — |
| Phone app can't connect | Phone and computer on different wi-fi | Same network; Expo Go scans the QR the launcher prints |
| Nothing prints | Bridge not running, or printer asleep | Option `8`; power-cycle the printer; Chrome for Bluetooth |
| A section is missing from the menu | Master or owner switched it off | Master control → Access, or Staff → Access |
| An employee can't sign in | Deactivated, or trial expired | Staff → Access → Active; or Settings → Membership |
| *Working offline* but the internet is fine | The browser hasn't noticed | Wait 20 s — DineFlow pings and reconnects itself |
| Assist says it needs a key | `ANTHROPIC_API_KEY` not set | Optional; add it to `apps/web/.env.local` and restart |

**A reset that never loses data:** stop the app, run option `7`. It re-applies every migration and
re-creates the master admin. Your orders, bills and bookings stay.

## 30. Backups, restore, and how to update

**Backups.** Supabase takes daily backups on the free tier (Project Settings → Database → Backups). The
Box takes its own nightly (option `10` lists them). Proof of business is a third, independent record
of every sealed month.

**Restore.** Supabase: Database → Backups → Restore. Box: option `10`.

**Updating DineFlow.** Unzip the new `dineflow-complete.zip` over the old folder (keep your
`apps/web/.env.local`), run option `7` to apply any new migrations, then option `1`. Every migration
is written to be re-run safely.

**Running the checks yourself.** `node scripts/sqltest/run.mjs` and its seven siblings execute every
migration and every workflow against a real PostgreSQL engine in about a minute each. Green means
the database logic is intact.

---

*What this guide does not cover, because it has not been done here: a real thermal printer, a real
Supabase project under load, an APK on a physical phone, and real staff during a real service. Those
are yours to test, and Part 28 is the list.*
