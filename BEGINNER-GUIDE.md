> The complete, current guide is **STARTUP-GUIDE.md**. This file is kept for reference.

# DineFlow — The Complete Beginner's Guide
### From an empty laptop to a live product with paying clients

Written for someone who has never run a web application. Every step says **what to do**, **what you should see**, and **what to do if you don't see it**. Follow the chapters in order the first time. After that, use the table of contents.

> **Version 12** — Apple-style interface (light and dark), fully offline Box with cloud sync, built-in Master login; restaurant, hotel and resort operations; offline billing; thermal printers; Swiggy/Zomato and OTA channels; smart scanning; labour; GST invoices; and three signature features: the Tomorrow brief, Neighbours, and Proof of Business.

---

## Contents

**Getting it running (day one)**
1. What you are building
2. Install Node.js
3. Create your database on Supabase
4. Unzip DineFlow
5. First launch
6. First login and Master admin
7. Load the demo data and take the ten-minute tour

**Using every part of it (week one)**
8. The restaurant, front to back
9. Hotel and resort operations
10. Printers, offline mode, install-as-app, and the Box (no internet at all)
11. Online orders, OTA calendars and your booking page
12. The three signature features
13. The phone app
14. Master control: trials, memberships and your clients

**Going live**
15. Going live, step by step
16. Every optional key, and what happens without it
17. Your daily, weekly and monthly routine

**Reference**
18. When something goes wrong
19. Where things are in the folder
20. What it does not do yet

---

# Part 1 — What you are building (3 minutes)

DineFlow has three pieces:

| Piece | What it is | Where it runs |
|---|---|---|
| **Database** | Where every menu, order, room, bill and worker lives. A free online service called **Supabase**. | supabase.com |
| **Web app** | The screens for owners, managers, cashiers, front desk, kitchen. | Your laptop (local) or the internet (live) |
| **Phone app** | Waiters, kitchen, housekeeping, scanning. | Your phone via Expo Go (local) or an APK / store app (live) |

Two words you'll see everywhere:

- **Local** — running on your own computer, only you can see it. For learning and testing.
- **Live** — on the internet with an address, so clients and their staff can use it.

Always do local first. Live is Part 15.

**Time needed:** about 45 minutes the first day, most of it waiting for downloads. From day two, one double-click and one key press.

**What you need:** a laptop (Windows, Mac or Linux), an internet connection, an email address. No credit card. No other accounts — everything optional runs in a clearly marked sample mode until you add it (Part 16).

---

# Part 2 — Install Node.js (5 minutes, once per computer)

Node.js is the program that runs DineFlow's tools. It is the **only** thing you install by hand; the launcher installs everything else.

1. Go to **https://nodejs.org**
2. Click the big green **LTS** button (it says *20.x LTS* or *22.x LTS*).
3. Open the downloaded file → **Next** on every screen → **Install** → **Finish**. Leave every tick-box as it is.
4. **Check it worked:**
   - **Windows:** press the Windows key, type `cmd`, press Enter. In the black window type `node -v` and press Enter.
   - **Mac:** press `Cmd + Space`, type `Terminal`, Enter. Type `node -v`, Enter.
   - **You should see** `v20.18.0` or `v22.11.0` or similar.
   - **If you see** `not recognized` / `command not found`: close the window, open a new one, try again. Still nothing? Restart the computer once.

> The number must start with **v20** or higher. If it shows v18 or below, install again from nodejs.org.

---

# Part 3 — Create your free database on Supabase (10 minutes, once)

1. **https://supabase.com** → **Start your project** → sign up with email or GitHub.
2. **New project**
   - Organization: leave the default
   - Name: `dineflow-dev`
   - Database Password: click **Generate a password**, then **copy it into a notepad file right now**. You need it in step 4 and it is never shown again.
   - Region: **South Asia (Mumbai)**
   - **Create new project**
3. Wait 1–2 minutes while it says "Setting up project". When done, you see a dashboard with a left menu.
4. **Collect three values** into your notepad file:

   **Value 1 & 2 — URL and key**
   Left menu → gear icon **Project Settings** → **API**.
   - **Project URL** → copy (looks like `https://abcdefghijkl.supabase.co`) → notepad as `URL:`
   - **Project API keys** → the row labelled **anon public** → copy the long `eyJ…` text → notepad as `ANON KEY:`
   - ⚠️ Do **not** copy `service_role`. Never share that one.

   **Value 3 — connection string**
   Left menu → **Project Settings** → **Database** → **Connection string** → **URI** tab.
   - Mode/Method dropdown: choose **Session** (not Transaction).
   - Copy. It looks like `postgresql://postgres.abcdefghijkl:[YOUR-PASSWORD]@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`
   - Paste into notepad as `DATABASE_URL:` then **replace `[YOUR-PASSWORD]` (including the square brackets) with the password from step 2.** No spaces.

5. **One setting for easy testing:** Left menu → **Authentication** → **Providers** → **Email** → switch **Confirm email** to **OFF** → **Save**. (Turn it back ON before going live — Part 15.)

Your notepad should look like:
```
URL: https://abcdefghijkl.supabase.co
ANON KEY: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9....
DATABASE_URL: postgresql://postgres.abcdefghijkl:MyS3cretPass@aws-0-ap-south-1.pooler.supabase.com:5432/postgres
MASTER EMAIL: the email you will sign up with
```

---

# Part 4 — Unzip DineFlow (1 minute)

1. Find `dineflow-complete.zip`.
2. **Windows:** right-click → **Extract All…** → **Extract**. **Mac:** double-click.
3. Move the `dineflow` folder somewhere simple: `Documents\dineflow` or `~/Documents/dineflow`.
   ⚠️ Avoid paths with spaces or special characters, and avoid OneDrive / Google Drive sync folders.
4. Inside you should see `launcher.mjs`, `Start-DineFlow.bat`, `Start-DineFlow.command`, `start.sh`, `Print-Bridge.bat`, `QUICK-START.md`, this guide, and folders `apps`, `packages`, `supabase`, `scripts`, `design`.

---

# Part 5 — First launch (10–15 minutes)

## 5.1 Start the launcher
- **Windows:** double-click **`Start-DineFlow.bat`**. If Windows says "protected your PC" → **More info** → **Run anyway**.
- **Mac:** right-click **`Start-DineFlow.command`** → **Open** → **Open** again. (First time only.) If "permission denied": open Terminal, type `chmod +x ` with a trailing space, drag the file into the window, Enter, then double-click again.
- **Linux:** open a terminal in the folder, `./start.sh`.

**You should see:**
```
╔══════════════════════════════════╗
║   DineFlow launcher  v4.0        ║
╚══════════════════════════════════╝
  1  Local: configure + install + database + open web app
  2  Local: start the mobile app (Expo Go on your phone)
  3  Live: deploy web to Vercel (one command)
  4  Live: run on your own server with Docker
  5  Live: build Android APK / Play Store / iOS
  6  Configure Supabase keys again
  7  Database only: run/repair migrations + master admin
  8  Start the thermal print bridge (LAN printers)
Choose [1]:
```

## 5.2 Press 1, then Enter

**It checks Node and pnpm** → `✔ Node v20…` and `✔ pnpm ready` (installs pnpm if missing, 30 seconds).

**It asks for your values.** Paste from notepad, Enter after each:
- `Project URL` → your URL
- `anon public key` → the `eyJ…` key (it may wrap oddly; that's fine)
- `DATABASE_URL` → the connection string **with your real password**
- `SUPABASE_SERVICE_ROLE_KEY (optional)` → **just press Enter**
- `ANTHROPIC_API_KEY` → **just press Enter** (photo scanning runs in sample mode)

**You should see:** `✔ Wrote apps/web/.env.local and apps/mobile/.env`

**It installs packages** (2–4 minutes, lots of scrolling). Ends with `✔ Installed`.
- Red error mentioning `network` / `ETIMEDOUT`: check internet, run the launcher again, press 1 — it continues where it stopped.

**It asks** `Run database setup now? (Y/n)` → **Enter**.

**You should see:**
```
→ 0001_init.sql … done
→ 0002_hospitality.sql … done
→ 0003_scan_labour_invoices.sql … done
→ 0004_offline_print_channels.sql … done
→ 0005_demo_and_public_endpoints.sql … done
→ 0006_tomorrow_brief.sql … done
→ 0007_neighbours_network.sql … done
→ 0008_proof_of_business.sql … done
✔ Database ready
```
- `password authentication failed` → your DATABASE_URL still has `[YOUR-PASSWORD]` or a typo. Launcher → **6** → re-enter → **7**.
- `ENOTFOUND` / `timeout` → you copied the *Transaction* string. Get the **Session** one → launcher → 6 → 7.
- Left DATABASE_URL blank on purpose? The launcher opens Supabase's SQL editor. Open `supabase/migrations`, open each file in Notepad **in order 0001 → 0008**, select all, copy, paste into the editor, **Run**, wait for "Success". Then press Enter in the launcher.

**It asks** `Your email to become MASTER admin` → type the email you'll sign up with → Enter.
You'll see `! No user with email … yet. Sign up in the app first, then run option 7 again.` — **normal** the first time.

**The web app starts:**
```
▲ Next.js 15.x
- Local: http://localhost:3000
✓ Ready in 2.1s
```
Your browser opens **http://localhost:3000/signup**. If not, type it in.

⚠️ **Keep the launcher window open.** It *is* the running app. Minimise it, don't close it.

---

# Part 6 — First login and Master admin (5 minutes)

## 6.0 The built-in Master login — one credential for everything

> Master control lists the **properties you look after**. On a fresh install it is empty, and there is nowhere to go until one exists. Press **Sample estate** to create six ready-made properties with their own owner logins (see `SAMPLE-LOGINS.md`), **New property** to make one, or send a client to `/signup`.

DineFlow ships with one account that is created automatically by the database setup. It needs **no sign-up and no invite code**, and it goes everywhere:

> **email** `master@dineflow.in`
> **password** `DineFlow@Master2026`

Sign in at `/login` with it and you land on **Master control**. Press **Open** on any property — restaurant, hotel or resort — and you are inside it as its owner: rooms, front desk, orders, kitchen, billing, everything, with a dark banner across the top saying *Master · viewing X* and a **Back to Master control** button. Nothing you do there is a simulation; it's real and logged in the audit trail. It also works on the phone app and on a Box.

Normal sign-up, login, trials, invite codes and memberships are completely unchanged for everyone else. The master is simply an extra door.

**Change the password before anyone else can reach your address:** Master control → **Change master password**. Do it on the live system the day you deploy (Part 15). The default is printed in this guide and in the launcher, so it is not a secret.


1. On the sign-up page choose **Restaurant**, **Hotel** or **Resort**. Choose **Resort** the first time — it unlocks every screen. Enter your name, a property name, your email (the same one you gave as Master email) and a password → **Start free trial**.

   **You should see** the **Control room** with your property name and a gold badge `trial · 7d` in the sidebar.
   - "Check your inbox to confirm your email" → you skipped Part 3 step 5. Turn Confirm email OFF, then sign in at `/login`.

2. **Become Master admin.** Open a **second** launcher (double-click `Start-DineFlow` again) → press **7** → Enter → your email → Enter → `✔ … is now MASTER admin`. Close that second window.

   In the browser, at the bottom of the sidebar, a gold **Master control** link appears → click → `/admin` lists your own property. That page will list every client you ever onboard (Part 14).

---

# Part 7 — Load the demo data and take the ten-minute tour

> **Testing the whole thing properly?** `TEST-GUIDE.md` is a step-by-step checklist with a "you should see" line for every step, covering all twelve areas in about an hour. Start with its Part 0 if Master control looks empty.

**Settings → Sample data → Load demo data.** Thirty seconds later you have: 16 dishes with recipes, 12 pantry items (four with real barcodes), 12 tables and two live kitchen tickets, 20 rooms with 30 days of rates and three bookings in different states, five facilities, five labourers with today's attendance, a browser printer, three delivery channels with two sample online orders, two demo OTA channels, and GSTIN/address filled in. Safe to press again; it never overwrites your own data.

Now walk through it, in this order:

1. **Kitchen** — two tickets waiting. **Start cooking** → **All ready**.
2. **Billing** → an order → **Generate bill** → **Mark paid**. Watch the bill print out of the machine on screen. Press **Tax invoice** for a numbered GST invoice.
3. **Online orders** — two sample orders. **Accept & print** one; it lands in the kitchen. Click **Map now** on "Jeera rice" and pick a dish.
4. **Channels → Send test order** — watch a third order arrive live.
5. **Front desk** — **Check in** the arrival. **Orders → New → Room** → pick the guest → send. **Billing** → that order → **Charge to room**. Back on the folio → **Check out & issue final invoice** — one invoice with room, food and extras.
6. **Housekeeping** — the vacated room is on the board. **Done · room ready**.
7. **Scan** — scan a barcode off any packet in your kitchen; then **Capture photo** to see the sample flow.
8. **Labour** — **Mark present** for someone, then **Pay**.
9. Turn off Wi-Fi. Punch an order. Turn Wi-Fi on. Watch "Working offline · 1 waiting" become "All synced".
10. **Tomorrow** — read the brief. Drag the slider. Print the prep sheet.

If all ten worked, everything is installed correctly. The rest of this guide explains each part properly.

---

# Part 8 — The restaurant, front to back

## 8.1 Menu
**Menu → New dish.** Name, price, category, veg/non-veg, description. The **flask icon** on a dish opens the **recipe**: add ingredients with quantities per plate (e.g. Chicken biryani → 0.2 kg basmati, 0.18 kg chicken). Recipes are what make stock drop automatically and what the Tomorrow brief uses to write your shopping list. Without a recipe a dish still sells; it just doesn't touch stock.

## 8.2 Pantry
**Pantry → Ingredient** to add items (unit, reorder level, cost, category, brand, barcode, pack quantity). **Record purchase** adds stock **with the price you paid** — that price is what Neighbours compares. Low-stock items show a red pill and appear on the Control room.

## 8.3 Orders
**Orders** shows the table floor. Tap a table → the POS. Add dishes, notes ("less spicy"), pick **Dine-in / Takeaway / Delivery / Room** → **Send to kitchen**. A KOT prints on the kitchen printer instantly. Orders work with no internet (Part 10).

## 8.4 Kitchen
Three columns: Pending → Cooking → Ready. Tickets go red after 15 minutes. A **reprint** button on every ticket. Station printers (e.g. Tandoor) get only their items.

## 8.5 Billing
Pick the order → discount if any → **Generate bill** → payments (split cash/UPI/card) → **Mark paid & print**. The bill prints on the counter printer and on screen it comes out of the machine. **Tax invoice** creates a numbered `INV-00001` with GST split and optional customer GSTIN. Hotels: **Charge to room** instead.

## 8.6 Invoices
Every tax invoice — dining and stay — with GST collected for 7/30/90/365 days. This is what your CA needs.

## 8.7 Scan
One page for everything the camera sees. Barcodes and QR read live; photos are recognised (sample mode until you add a key, Part 16).
| You scan | Result |
|---|---|
| Vegetables, rice, meat (photo) | New **Pantry** product; confirm 100 g / 250 g / ½ kg / 1 kg / custom; "Just bought" adds stock |
| A packet with a barcode | First time creates the product; every later scan adds a pack in one tap, or records wastage |
| A plated dish | New **Menu** item with suggested price |
| A room door or room QR | Opens the room: occupant, mark cleaning / ready |
| A worker or ID card | New **labourer** (only last 4 ID digits stored) |
| A labour badge QR | Punches attendance IN / OUT |

Print QR labels for rooms, storage bins and badges from **Labour → QR labels**.

## 8.8 Labour
Daily-wage and contract workers: present/absent, punch times, monthly wages, payments, balance. Separate from **Staff** (which is app logins).

## 8.9 Staff
**Staff → Invite staff** → choose role → an 8-letter code. Roles: owner, manager, cashier, waiter, chef, store, front desk, housekeeping. Each sees only their screens.

## 8.10 Reports
Sales by day, top dishes, payment mix, tables. **Close day** locks the day's figures.

---

# Part 9 — Hotel and resort operations

Only appear when Settings → Property type is Hotel or Resort.

## 9.1 Rooms
Key-card grid by floor: dark = occupied, dashed gold = arriving, blue = cleaning, red = maintenance. **Room types & rates** sets Standard / Deluxe / Suite and base prices. Each card has quick actions: needs cleaning, maintenance, mark ready.

## 9.2 Front desk
Arrivals today, departures today, in house, upcoming. **New booking** → dates, room (shows only free ones), rate, guest (new or returning), advance, source → **Confirm**. **Check in** when they arrive.

## 9.3 The folio
Every charge for a stay in one ticket: room nights with 12% GST, restaurant orders posted to the room (5% GST), spa/activities, extras (laundry, minibar), discounts, advance, payments. **Check out & issue final invoice** requires the balance to be paid, moves the room to cleaning, creates a housekeeping task, and opens the combined invoice.

## 9.4 Housekeeping
To-do → In progress → Done. Check-outs create tasks automatically. **Done** makes the room available.

## 9.5 Guests
Everyone who has stayed: visits, last stay, lifetime room revenue. ID stored as type + last 4 digits only.

## 9.6 Facilities (resort)
Spa, activities, venues with rates and durations. **Book** for an in-house guest and it posts to their folio; for a walk-in it's paid there.

## 9.7 Settings for hotels
Room GST % (default 12), check-in and check-out times, prep buffer for the Tomorrow brief.

---

# Part 10 — Printers, offline mode, install-as-app

## 10.1 Thermal printers
**Settings → Thermal printers → Add printer.**
| Connection | When | Notes |
|---|---|---|
| Browser dialog | Any computer, any printer | Set up for you by the demo data |
| Bluetooth | Portable 58 mm printers | Chrome on Android/Windows |
| USB | Printer plugged into the billing PC | Chrome desktop |
| Network (LAN) | Printer with its own IP | Double-click **Print-Bridge.bat** (or launcher → 8) and leave it open. Address `192.168.1.50:9100` |

Set **Prints** to *Kitchen tickets* for the kitchen and *Bills* for the counter. **Kitchen station** routes only that station's items. **Test print** sends a sample bill. A printer being off never blocks a sale.

## 10.2 Offline mode — nothing to switch on
When internet drops, screens you've opened keep working, and orders and payments are saved on that device with a dark bar: **"Working offline · 3 waiting"**. When the connection returns they're sent in order and the bar says **"All synced"**. Every entry carries a unique id, so a replay can never double-bill. KOTs still print offline because printing goes device → printer. Test it by pulling the Wi-Fi.

## 10.3 Never-opened screens now work offline too
Every ten minutes while online, DineFlow quietly saves the menu, tables and rooms on the device and pre-loads the main screens. So even a page you never opened on that tablet works when the connection drops.

## 10.4 The Box — works with and without internet (hybrid)
Everything above is offline-*tolerant*: the database is still in the cloud, so a login or a screen never opened on that device still needs internet. For a place where the internet is the weak link, put the database **in the building** and let it swap with the cloud whenever the connection exists. One setup, both worlds.

**How it works**
- Every device in the building talks to the Box over the Wi-Fi. Orders, kitchen, billing, printing, rooms, front desk, housekeeping, scanning, labour, invoices, the Tomorrow brief — all of it runs with the internet cable pulled out. Nothing queues, because nothing leaves the building.
- Every minute the internet is up, the Box and your cloud copy swap:
  - **Down to the Box:** Swiggy/Zomato/website orders, OTA and direct bookings, your membership state, Neighbours results, neighbours' surplus and standby listings.
  - **Up to the cloud:** your menu, rooms and rates (so the booking page and OTA feeds show the truth), bookings made at the desk (so nobody double-books online), online-order status, sealed months (so Proof links work), purchase prices and covers (so Neighbours has your contribution), surplus and standby offers.
- The top bar shows **"Box · in step with cloud"** when the last swap was under ten minutes ago, and **"cloud out of reach"** otherwise. Either way the building keeps working.

**What you need:** one computer that stays on (an old laptop, a mini PC, a ₹8,000 box), Docker Desktop from https://docs.docker.com/get-docker, and a fixed IP for that computer in your router.

**Set it up (once, 10 minutes)**
1. In your **cloud** DineFlow (Part 15), sign the property up as usual, then **Settings → Runs on a Box → Issue box token**. It is copied.
2. On the Box computer, launcher → **9**.
3. Accept the Wi-Fi address it shows (e.g. `192.168.1.10`).
4. **Cloud address** → your live address (e.g. `https://app.yourbrand.in`). **Box token** → paste.
5. **USB folder** for nightly backups, or blank.
6. First run downloads ~1.5 GB and builds (5–10 minutes). Then:
   ```
   On this computer:      http://localhost:3000
   On every other device: http://192.168.1.10:3000
   ```
7. Type that address into every phone, tablet and the kitchen screen. Sign up on the Box exactly as in Part 6, then `node launcher.mjs box-admin` for Master admin. (The Box has its own logins — staff join with invite codes from the Box, not from the cloud.)

**What runs where**
| Runs on the Box (no internet needed) | Needs the internet (through the cloud) |
|---|---|
| POS, kitchen, billing, printing, offline queue | Swiggy/Zomato webhooks (arrive at the cloud, pulled down) |
| Rooms, front desk, folio, housekeeping, facilities | OTA calendar sync (cloud), booking page (cloud) |
| Scan (barcode/QR; photos sample unless keyed), labour, invoices | Neighbours (computed in the cloud, cached on the Box) |
| Tomorrow brief, Proof sealing, Settings, Master admin *for this Box* | Sharing a Proof link (link is served by the cloud) |

**Automatic:** nightly backup at 2 am to `dineflow/backups/` (keeps 14) and to the USB path; launcher → **10** restores one. If the internet is down for a week, nothing is lost — the swap simply resumes.

**Honest rules**
- The Box must stay **on** and on the **same Wi-Fi**. Unplug it and everything in the building stops.
- Backups are now **your** responsibility. Test a restore once before you rely on it.
- Bookings arriving online while the Box is offline are placed in the first free room of that type when the connection returns; if none is free, the sync log says so and the front desk must call the guest.
- Stop: `docker compose -f docker-compose.box.yml down` (data kept). Start again: launcher → 9.
- For a city restaurant on fibre, the plain cloud setup is simpler. The Box is for places where the internet is the weak link.

## 10.5 Install it like an app
In Chrome, click the ⊕ in the address bar (or menu → **Install DineFlow**). It opens from the desktop or phone home screen and starts with no signal.

---

# Part 11 — Online orders, OTA calendars and your booking page

## 11.1 Swiggy / Zomato / your website
**Channels → Food delivery → Add channel.** Each channel gets a private **webhook URL**. Give that URL to whoever sends orders; they appear on **Online orders**, you **Accept & print**, and the kitchen gets a normal ticket with stock deducted and commission tracked.

Honest position: Swiggy and Zomato only give API access to approved partners. Until then, point your own website or a middleware (UrbanPiper, Petpooja Connect) at the same URL — it works today. When you get direct credentials, paste them into the channel. Nothing else changes. **Send test order** and **Push menu** let you try it now.

## 11.2 Rooms on Booking.com / MakeMyTrip / Airbnb
**Channels → OTA channels.** Two modes:
- **iCal (works today):** paste the OTA's calendar link into *their feed*, paste your DineFlow link into their extranet. Sync every 15 minutes both ways; dates can't double-book.
- **API:** live rates and instant confirmation, needs a certified connection or a channel-manager partner. Fields are ready.

**Rates & availability** is one calendar for every channel: rate, rooms open, stop-sell, minimum nights, bulk-applied to date ranges. **Push rates** logs exactly what would be sent.

## 11.3 The storefront — book a table and order online, 0% commission
**Settings → Storefront & offers.** Switch on **Listed publicly** and pick what you accept: table booking, delivery, takeaway. Add cuisines, a price for two, photos and your hours.

Guests use **`/dine`** — a search page in the shape they already know from dining apps: rating, cuisines, price for two, offer chips, filters for dining/delivery/rooms. Your own page is `/dine/your-name`, with a QR to print for the counter.

- **Book a table** — the guest picks a date, party size and time. Slots come from your hours and table capacity, so you cannot be overbooked. Bookings land on the **Reservations** screen; **Seat them** → pick a table → it turns occupied on the floor.
- **Order online** — the guest builds a basket from your live menu and orders. It arrives on **Online orders** exactly like a Swiggy order: Accept & print, KOT, stock deducted.
- **Offers** — "15% off before 7pm" shows as a badge on those exact slots and fills tables that would sit empty. "Flat ₹100 off above ₹600" applies to delivery baskets.
- **Reviews** — guests rate you after visiting; your reply shows publicly underneath.

Every booking and order here costs **0% commission**, against 18–25% on an aggregator.

## 11.4 Your own room booking page — 0% commission
**Settings → Booking page** → set a web address, tagline, policies → you get a link and a QR. Guests pick dates and a room type, see live availability, book, and it lands in Front desk. Put it on Google Business, Instagram and your visiting card.

---

# Part 12 — The three signature features

These are the reasons to buy DineFlow over anything else. Each uses data the app already has.

## 12.1 Tomorrow — tonight's brief for tomorrow's kitchen
Open **Tomorrow** (or the gold card on the Control room after 5 pm).
- **Expect about 86 covers · likely 74–98**, with the reason in words: *"Last 8 Saturdays averaged 78 covers, with 17 guests in house; tomorrow you have 22."*
- **Prep for the kitchen**: every dish with a portion count, including your buffer.
- **Buy in the morning**: only what the pantry is short of after tomorrow's cooking, with cost.
- **Was it right?**: every brief graded the next day against what actually sold.

Routine: read → adjust with the slider or *Quiet / Busy / Festival* if you know something → **Prep sheet** (prints with "made: ____" lines) → **Send to the team** (WhatsApp) → **Save tonight's brief**. Next morning, tick what you bought → **I bought these** → stock updates. Week one it says it has no history; useful at about four weeks.

## 12.2 Neighbours — the private district network
Only you, running Master control, have every property in a district in one database. **Neighbours → Sharing & privacy**: set district, radius, an alias, and tick streams:
| Stream | You give | You get |
|---|---|---|
| What things cost | prices you pay suppliers | area median per item and what you're overpaying, in ₹/week |
| Surplus board | stock you list as spare | cheap stock nearby before it's wasted |
| Standby hands | workers you mark free today | ID-verified help when short |
| Area signal | daily cover count | a festival or quiet spell spotted before your own figures |

Rules, enforced in the database: off by default; nothing shown until **5 properties** contribute; never named on pooled figures; **menu prices never shared**, only supplier costs. Realistically useful at 10–15 properties in a district — so sell the district, not the customer.

## 12.3 Proof of business — a trading record a bank will read
**Proof of business → Seal my trading history.** Every closed month is frozen with a fingerprint chained to the previous month's; change a past figure and the chain breaks visibly. **Share a record** → purpose, months, expiry (7–180 days), with or without costs → a link with no login, that expires, that you can revoke, and that shows you every open. The reader sees turnover, GST collected, growth, a month-by-month chart and table, a green "verified" banner — and a plain statement of what it is not (not audited, not a score). DineFlow never sends it anywhere unless you do.

---

# Part 13 — The phone app (10 minutes)

1. Install **Expo Go** on your phone (Play Store / App Store).
2. Phone and laptop on the **same Wi-Fi**.
3. Launcher → **2** → Enter → a QR appears.
4. **Android:** Expo Go → Scan QR. **iPhone:** Camera app → point → tap the banner.
5. First load ~1 minute. Then the DineFlow login.
6. **Join with an invite code** (from Staff → Invite staff) → name, email, password.

Tabs by role: Control, Tomorrow, Scan, Rooms, Orders, Kitchen, Pantry. Orders punched with no signal queue on the phone and sync later.

- QR won't connect? Both devices must be on the same Wi-Fi; some office Wi-Fi blocks it — use your phone's hotspot for both, or press `s` in the launcher window to use a tunnel.

---

# Part 14 — Master control: trials, memberships and your clients

**/admin** (you only). Every property: type, trial or membership state, today's and 30-day sales, live orders and rooms, users.

**How a client becomes a client**
1. They open your `/signup`, choose Restaurant/Hotel/Resort, and start a **7-day trial** on their own. They appear in `/admin` immediately.
2. On day 8, unpaid, every screen locks and shows the **Membership login** page (phone shows a lock screen). Their data is untouched.
3. When they pay you (UPI/bank), `/admin` → **Manage** → **Activate 30d / 1 year**, or **Issue key** and send them the code to enter at `/membership`.
4. **Extend trial +7d** when they need more time; **Suspend** for non-payment; the audit log records everything.

**Open any property as its owner:** `/admin` → **Open** on the row. The master is never locked out by an expired trial, so you can help a client whose screens are locked.

**Try it now:** `/admin` → your property → **Suspend** → reload → you land on the membership page → `/admin` → **Issue key** → `/membership` → paste → unlocked.

Prices shown on the membership page: ₹2,499/month or ₹24,999/year. Change them in `apps/web/app/membership/MembershipClient.tsx`. Honest note: that is high for the Indian POS market (Petpooja is roughly ₹9,000–15,000/year); reconsider before selling.

---

# Part 15 — Going live, step by step

Do this only after local works. Use a **separate** Supabase project for live so testing never touches real data.

## 15.1 Live database (10 min)
1. Supabase → **New project** → `dineflow-live` → Mumbai → generate and save the password.
2. Collect URL, anon key, Session connection string into a **LIVE** section of your notepad.
3. Keep **Confirm email ON** this time.
4. Launcher → **6** → paste LIVE values (press Enter through the optional keys). Then **7** → migrations run → your email for Master admin ("sign up first" is fine).

## 15.2 Web address on Vercel (10 min, free)
1. **https://vercel.com** → Sign up. Nothing else to do there.
2. Launcher → **3** → confirm the LIVE URL and key.
3. A browser tab asks you to log in to Vercel. Approve.
4. 2–3 minutes of building, then `✅ Production: https://web-xyz123.vercel.app`. That's your live address.
5. Supabase LIVE → **Authentication → URL Configuration → Site URL** = that address.
6. Open the address → `/signup` → create your property → launcher → **7** → your email → now Master admin on live.
7. **Own domain:** answer **y** when asked, type `app.yourbrand.in`, add the CNAME it shows at your domain provider. HTTPS is automatic.
8. The launcher asks for the production URL — paste it; the phone app uses it for photo scanning.

The OTA calendar sync runs every 15 minutes on Vercel automatically (`vercel.json`).

Every code change later: launcher → **3** again.

## 15.3 Your own server instead (Docker)
Copy the folder to the server → `./start.sh docker`. Runs on port 3000; put nginx or Caddy in front for HTTPS.

## 15.4 Phone app for staff (10 min)
Launcher → **5** → **1** (Android APK). Log in to Expo the first time (free). ~10 minutes of cloud build, then a link. Send it on WhatsApp; staff install it directly. iPhone: option **3** (Apple Developer account, ₹8,000/yr) or use the web address in Safari → Share → **Add to Home Screen**.

## 15.5 Before your first paying client — checklist
- [ ] Live Supabase project, Confirm email ON
- [ ] Vercel address opens, Site URL set
- [ ] You are Master admin on live and `/admin` opens
- [ ] **Master password changed** from the default (Master control → Change master password)
- [ ] Settings: property name, address, phone, **GSTIN**, GST rate, room GST, check-in/out
- [ ] Thermal printer tested with a real machine
- [ ] Offline tested by pulling the Wi-Fi during a bill
- [ ] Staff invited with correct roles
- [ ] Demo channels removed (Settings → Remove demo channels)
- [ ] Membership prices decided
- [ ] Supabase → Database → Backups: Point-in-time recovery is on (paid tier) or you have a weekly manual backup habit

---

# Part 15b — Three things your competitors don't have

**Pulse (wait times).** When the door is busy, open Pulse. It tells you when each table will free up,
reading the ticket, and quotes a wait for any party size. Walk-ins go on the queue; print the QR so they
can join from their own phone and watch their place move up. Nothing to install, nothing to text.

**Leak finder.** Count the shelf once (Pantry → Leak finder → Count stock now). From then on every
sale takes its recipe out. Next count, the gap is the leak, in rupees, item by item. Count the five
dearest items weekly.

**Shift close.** Billing → Close shift. Type the cash in the drawer; it tells you short or over
against the day's bills and writes one paragraph you can paste to the owner on WhatsApp.

**If the internet goes.** Keep working. Orders, kitchen tickets, the queue, stock counts and
housekeeping all carry on and are stored on the device — even if you reload the page or close the
app. When the line comes back, a green bar tells you how many were sent. Nothing is entered twice,
even if the connection died halfway through sending.

**Who can open what.** The master (and only the master) signs into Master control. There, each property has an **Access** button: switch off anything an owner shouldn't have — say a small mess that has no rooms, or an owner who shouldn't see Proof of business. What's off vanishes from their menu and can't be reached by typing the address.

**Your staff.** You, the owner, have everything the master allowed. Each employee gets a role — waiter, chef, cashier — and you can untick any section for any one person on **Staff → Access**. You can never lock yourself out, and a manager can never change an owner.

**Assist.** The little tile-with-a-spark in the corner of every screen. Tap it and ask in your own words — "who is late in the kitchen?", "what do I reorder?", "how long for a party of four?". It answers from what is on that screen and the rest of the house, and tells you what to tap. When something needs you — a late ticket, a party waiting too long, stock running out — the spark turns red before you ask. It can page a waiting party or draft a supplier message, but only when you tap Confirm. Needs the Anthropic key from Part 16.

**Dark or light.** Sun/moon in the top bar. Kitchens and night shifts like dark; a daylight counter
likes light. Settings → Appearance can follow the device.

# Part 16 — Every optional key, and what happens without it

DineFlow needs exactly **two** values: Supabase URL and anon key. Everything else is optional.

| Key / account | Without it | Get it from |
|---|---|---|
| `ANTHROPIC_API_KEY` | Camera reads real barcodes/QR. Photo capture returns a clearly-marked **sample** result so the flow can be practised | console.anthropic.com — add ₹500 credit; ~₹0.30–0.80 per photo |
| `SUPABASE_SERVICE_ROLE_KEY` | **Nothing breaks.** Webhooks, iCal feeds, booking page and records authenticate with their own tokens | Not needed |
| Swiggy/Zomato credentials | Demo channels with working webhook URLs; **Send test order** flows a real order through | Their partner team, or a middleware |
| OTA credentials | iCal mode works with any public calendar link; **Push rates** simulates | OTA extranet or channel-manager partner |
| Thermal printer | Browser-dialog printer prints correct 80 mm receipts anywhere | Any ₹4,000–8,000 ESC/POS printer |
| Payment gateway | Bills settled as cash/UPI/card by hand | Razorpay, later |
| `CRON_SECRET` | The OTA sync endpoint is open (it only reads public calendars) | Any string, launcher → 6 |

Add any key with launcher → **6**, then restart (Part 17).

---

# Part 17 — Your routine

**Every day**
- Morning: Tomorrow → tick what you bought → **I bought these**
- Service: Orders, Kitchen, Billing as normal; Online orders when they ping
- Evening: Tomorrow → read, adjust, print prep sheet, send to team, save

**Every week**
- Neighbours → What things cost → take the red rows to your supplier
- Labour → Wages & payments → settle
- Invoices → check GST collected

**Every month**
- Proof of business → **Seal new months**
- Reports → month view
- `/admin` → who's expiring, who's paid

**Stopping / restarting:** in the launcher window press `Ctrl + C` (Mac: `Control + C`) or close it. Next day: double-click the launcher → **1** → Enter, `N` to reconfigure, `n` to database setup. Ten seconds.

---

# Part 18 — When something goes wrong

| You see | Cause | Do |
|---|---|---|
| Launcher window closes instantly | Double-clicked `launcher.mjs` | Use `Start-DineFlow.bat` / `.command` |
| `node is not recognized` | Node not installed or old terminal | Install, restart computer |
| "This site can't be reached" | Launcher window was closed | Start it again |
| `password authentication failed` | `[YOUR-PASSWORD]` still in DATABASE_URL | Launcher → 6 → fix → 7 |
| `ENOTFOUND` / timeout on database | Transaction string, not Session | Supabase → Database → Connection string → Session |
| Sign-up says check your inbox | Confirm email is ON | Authentication → Providers → Email → OFF (dev) |
| `/admin` redirects to dashboard | Not Master admin yet | Use master@dineflow.in, or launcher → 7 → your email |
| Master login says invalid | Migration 0011 not run, or password changed | Launcher → 7; or use the password you set |
| App looks empty | No data | Settings → Load demo data |
| Kitchen doesn't update live | Realtime not enabled (rare) | Supabase → Database → Publications → `supabase_realtime` → tick orders, order_items, kots, rooms, bookings |
| Stock didn't drop after a sale | Dish has no recipe | Menu → flask icon → add ingredients |
| Staff can't see Rooms / Front desk | Property type is Restaurant | Settings → Property type → Hotel/Resort |
| Network printer "bridge not running" | Bridge window closed | Double-click Print-Bridge.bat, leave open |
| Bluetooth printing not offered | Safari/Firefox | Use Chrome, or Browser/Network |
| Webhook / iCal / booking / record link 404 | Wrong token | Copy the URL again from the app |
| Neighbours shows "not enough neighbours" | Fewer than 5 properties sharing | Expected; fills in as the district joins |
| Tomorrow says "no history" | New property | Expected; predicts from bookings only until ~4 weeks |
| Photo scan says "sample" | No Anthropic key | Expected; add the key when you want real recognition |
| Tear-off / bill animation looks off | Very old browser | Update Chrome |
| Box: "Docker is required" | Docker Desktop not installed | docs.docker.com/get-docker, then launcher → 9 |
| Box: devices can't reach it | Different Wi-Fi, or the IP changed | Same Wi-Fi; fix the IP in the router; launcher → 9 to re-print the address |
| Box: "never seen" in cloud Master control | No internet at the property, or token missing | Fine if standalone; otherwise Settings → Issue box token → launcher → 9 |
| Anything else | — | `SETUP-GUIDE.md` §6, or send the red error line |

**Starting completely over:** Supabase → New project → launcher → 6 → 7. Nothing on your laptop needs deleting.

---

# Part 19 — Where things are in the folder

```
dineflow/
  launcher.mjs                 the menu you run (Start-DineFlow.bat / .command / start.sh)
  scripts/migrate.mjs          runs the SQL files, tracks which ran
  scripts/print-bridge.mjs     LAN printer bridge (Print-Bridge.bat)
  BEGINNER-GUIDE.md            this file
  QUICK-START.md               one page
  START-GUIDE.md               manual local→live, costs, checklists
  SETUP-GUIDE.md               how it's built + changelog v1 → v8
  supabase/migrations/         0001 core · 0002 hotel+master+membership · 0003 scan+labour+invoices
                               0004 offline+printers+channels · 0005 demo+public endpoints
                               0006 Tomorrow · 0007 Neighbours · 0008 Proof of business · 0009 Box · 0010 hybrid sync · 0011 master login · 0012 indexes · 0013 master creates properties · 0014 sample estate · 0015 storefront
  docker-compose.box.yml       the on-premise Box (launcher → 9)
  box/                         gateway config + database init for the Box
  scripts/box-agent.mjs        nightly backup + hourly phone-home
  backups/                     Box backups land here
  apps/web/app/(app)/          one folder per screen: dashboard, tomorrow, scan, frontdesk, rooms,
                               housekeeping, guests, facilities, orders, online-orders, kitchen,
                               billing, invoices, menu, inventory, labour, proof, neighbours,
                               channels, reports, staff, settings
  apps/web/app/admin/          Master control
  apps/web/app/book/[slug]/    public booking page
  apps/web/app/record/[token]/ public business record
  apps/web/app/api/            scan, webhooks, ical, ota sync
  apps/web/lib/offline/        outbox + sync
  apps/web/lib/print/          ESC/POS + transports
  apps/web/components/receipt/ the bill and the printer animation
  apps/web/app/globals.css     colours, fonts, paper, printer, key cards
  apps/mobile/app/             phone screens (queue.ts = offline outbox)
  packages/shared/             roles, module map, GST maths, schemas
  packages/db/                 table types
  design/                      23 rendered screen designs
```

---

# Part 20 — What it does not do yet (so you don't promise it)

- **Online payment for membership** — you issue keys by hand. Razorpay is the next step; the schema is ready.
- **Payment gateway for guests** — bills and bookings are settled by hand (cash/UPI/card).
- **Direct Swiggy/Zomato API** — works via webhook/middleware today; direct needs their approval.
- **OTA API mode** — iCal works today; live-rate API needs certification.
- **Multi-currency, multi-language UI** — English, ₹ only.
- **Automated backups on the cloud setup** — turn on Supabase point-in-time recovery, or export weekly. (The Box backs itself up nightly.)
- **Both apps have been installed, type-checked and built end to end (v12.2).** Web: production build, 51 routes, screens answer in milliseconds. Phone: Metro bundle for Android succeeds. What has *not* been done: a real APK on a real phone (launcher → 5 does that), a real printer, a real Supabase project under load, and real staff. Test the printer with a real machine, and pilot with three properties before charging anyone.

That last line is the most important one in this guide.
