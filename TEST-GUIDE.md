# DineFlow — How to test the whole application
### A checklist you can work through in about 60 minutes

You do not need to know how any of it is built. Just follow the steps in order and compare what you see with the **✅ You should see** line. If something doesn't match, that's a bug — note the step number and the red error text.

---

## Before you start

1. The launcher window is open and says `✓ Ready`.
2. Your browser is at **http://localhost:3000**.
3. Have your phone nearby for Part 9.

All the logins are listed in **`SAMPLE-LOGINS.md`**. In short:
- **Master** — `master@dineflow.in` / `DineFlow@Master2026`. Sees every property. Has no property of its own.
- **Six sample owners** — `owner@annapoorna.in`, `owner@marina.in`, `owner@tamizh.in`, `owner@pearl.in`, `owner@bayresort.in`, `owner@pinehill.in`, all with the password `Dine@1234`, once you load the sample estate in Part 0.

---

## Part 0 — Why Master control looked empty (read this first)

Master control is the **list of properties you look after**. On a brand-new install there are none, so it is empty and there is nowhere to go. That is correct behaviour, not a bug.

You need one property to exist. There are two ways, and both are worth testing:

**Way A — load the whole sample estate (best for testing)**
1. Sign in as **master@dineflow.in**.
2. Press **Sample estate** (top right) → **Load the sample estate**. Wait about a minute.
3. ✅ You should see: six properties listed — two restaurants, two hotels, two resorts — each with sales figures, and a table of their owner logins. All use the password `Dine@1234`. They are also in `SAMPLE-LOGINS.md`.
4. Press **Open** on any row to go inside it.

This is the fastest way to test everything, because these six already have two months of history — so the Tomorrow brief predicts, Proof of business has sealed months, and Neighbours has the five contributors it needs to show real prices.

**Way B — create one property from Master control**
1. Sign in as **master@dineflow.in**.
2. You land on **Master control**. Press **New property** (top right) or **Create a property** in the middle of the empty table.
3. Name it `Kanyakumari Bay Resort`, choose **Resort**, leave **Fill it with sample data** ticked.
4. Press **Create and open it**.

✅ You should see: the **Control room** of that property, with a dark bar at the top reading *Master · viewing Kanyakumari Bay Resort*, a full sidebar down the left, and real numbers on screen.

That dark bar is how you know you are inside a property as Master. **Back to Master control** returns you to the list.

**Way C — as a client would (test this too, later)**
1. Open a **private/incognito window** at `http://localhost:3000/signup`.
2. Choose Restaurant, fill in name/email/password, **Start free trial**.
3. In your normal window, refresh Master control.

✅ You should see: the new property in the list with a gold **trial** badge and `7d left`.

> **The rule to remember:** Master control = the list. Press **Open** on any row to go inside that property. Everything else in this guide happens *inside* a property.

---

## Part 1 — Does everything load? (5 min)

Inside a property, click every item in the left sidebar, top to bottom.

✅ You should see: each screen paints within a second, no blank page, no red error. Screens with no data yet show a friendly "nothing here" panel, not an error.

If a screen is blank white with red text, that is a bug — note the screen name.

Expected sidebar for a **Resort**: Control room, Tomorrow, Scan, Front desk, Rooms, Housekeeping, Guests, Facilities, Orders, Online orders, Kitchen, Billing, Menu, Pantry, Invoices, Labour, Proof of business, Neighbours, Channels, Settings.
A **Restaurant** has no Front desk / Rooms / Housekeeping / Guests / Facilities. That is correct.

---

## Part 2 — The restaurant cycle (10 min)
This is the core of the app. Do it in order.

1. **Menu** → the sample dishes are there. Press **New dish**, add `Test dosa` at ₹60. ✅ It appears in the list.
2. **Pantry** → note the current stock of **Basmati rice**. Write the number down.
3. **Orders** → tap table **T3** → tap **Chicken biryani** twice and **Butter naan** once → **Send to kitchen**.
   ✅ You land on the order page. Table T3 turns dark (occupied) on the floor.
4. **Kitchen** → your ticket is in **Pending**. Press **Start cooking** → it moves to Cooking *instantly*. Press **All ready** → moves again.
   ✅ Movement is immediate, with no waiting spinner.
5. **Billing** → pick that order → **Generate bill** → set payment UPI → **Mark paid & print**.
   ✅ The bill slides out of the printer graphic on the right, with a torn bottom edge, tax summary and barcode. A print dialog opens (cancel it if you have no printer).
6. **Pantry** → Basmati rice is now **lower** than the number you wrote down.
   ✅ Stock dropped automatically because the dish has a recipe. *If it didn't drop*: that dish has no recipe — Menu → flask icon → add ingredients.
7. **Invoices** → press **Tax invoice** on the bill screen first if you haven't; the invoice appears here with GST split.

---

## Part 3 — The hotel cycle (10 min, Resort/Hotel only)

1. **Front desk** → **New booking** → dates today→tomorrow, click a free room, type a guest name → **Confirm booking**.
2. Press **Check in guest**. ✅ The room turns dark on the Rooms screen.
3. **Orders** → **New order** → change type to **Room** → pick that guest → add a dish → **Send to kitchen**.
4. **Billing** → that order → **Or charge to a room** → pick the guest → **Post**.
   ✅ You land on the guest's folio and the dinner is listed there.
5. On the folio: **Add to folio** → `Laundry` ₹350 → **Post**. ✅ It appears.
6. **Check out & issue final invoice** → enter the payment → confirm.
   ✅ You get **one invoice**: room night + GST, the restaurant order + GST, laundry, payments, balance ₹0.
7. **Housekeeping** → that room is on the board → **Done · room ready**. ✅ Rooms shows it free again.

---

## Part 4 — Offline (5 min) — the important one

1. Stay on **Orders**.
2. Turn **Wi-Fi off** on your laptop.
3. Punch a new order on any table and send it.
   ✅ A dark bar appears at the bottom: **"Working offline · 1 waiting"**. The order is accepted, not rejected.
4. Turn **Wi-Fi back on**. Wait about 15 seconds.
   ✅ The bar becomes **"Syncing…"** then **"All synced"** and disappears. The order is now on the Orders screen.
5. Do it again but punch **two** orders offline. ✅ Both arrive, in order, no duplicates.

---

## Part 5 — Printing (5 min)

**Without a printer:** Settings → Thermal printers → the "Counter (browser)" printer exists → **Test print** → a print dialog opens with a correctly laid-out receipt. Cancel it. ✅ That is a pass.

**With a real thermal printer:** add it (Bluetooth / USB / Network — see BEGINNER-GUIDE Part 10.1), then **Test print**.
✅ Paper comes out with the header, items, tax summary and a barcode. If the text is cut off at the right, your paper is 58 mm and the printer is set to 80 mm — change it and test again.

---

## Part 6 — Online orders (5 min, no Swiggy account needed)

1. **Channels** → **Food delivery** → the demo channels are there.
2. Press **Send test order** on any of them.
3. **Online orders** → the order has arrived at the top, marked **new**.
4. Press **Accept & print**. ✅ It appears in the **Kitchen** as a normal ticket, and stock deducts.
5. On the Zomato sample order, one line says *not on your menu* → **Map now** → pick a dish. ✅ Next time that line matches automatically.

---

## Part 7 — Scanning (5 min)

1. **Scan** → **Open camera** → allow the camera.
2. Point it at any **barcode** on a packet in your kitchen.
   ✅ Either it opens an existing product, or it offers to create one — with quantity chips (200 g, ½ kg, 1 kg…).
3. Create it with 1 kg. ✅ **Pantry** now has it with that stock.
4. Press **Capture photo** on anything.
   ✅ Without an AI key you get a card marked **sample** — that is expected, and proves the flow works. With a key you get real recognition.
5. **Labour → QR labels → Rooms → Print sheet**, then scan one of those QR codes. ✅ It opens that room.

---

## Part 7b — The storefront: book a table & order online (10 min)

This is the part your guests see. Nothing here needs a login.

**Turn it on:** inside a property → **Settings → Storefront & offers** → switch on **Listed publicly**, **Table booking**, **Delivery**, **Takeaway** → add cuisines and a price for two → **Save storefront**. (The sample estate already has all of this on.)

1. Open **http://localhost:3000/dine** in a private window.
   ✅ Listed properties as cards with rating, cuisines, price for two, and an offer chip.
2. Search `biryani`. ✅ The list narrows — it searches names, cuisines **and dishes**.
3. Press the **Dining / Delivery / Stay** segments. ✅ The list filters.
4. Click a property. ✅ Cover photo, rating, hours, offer chips, and two tabs: **Book a table**, **Order online**.
5. **Book a table**: pick a date, party size, then a time. ✅ Past times are hidden, full ones struck through, and a time inside an offer window shows a **15% off** badge.
6. Name, phone, occasion → **Confirm booking**. ✅ A reference number and the offer named on it.
7. In your normal window → **Reservations**. ✅ The booking is under **Arriving** with party size, occasion and offer. **Seat them** → pick a table → it moves to **At the table** and the table turns occupied.
8. **Order online**: add two dishes. ✅ A basket bar floats at the bottom showing the total and what the offer saved.
9. Open the basket → Delivery → name, phone, address → **Place order**. ✅ Reference and ETA. In the property → **Online orders** → it is there as **new** → **Accept & print** puts it in the Kitchen.
10. **/dine/track** → that reference and phone. ✅ Live status bar and items.

Then try **Settings → Storefront & offers → New offer**: "15% off before 7pm", dining only, 11:00–19:00. Reload the public page — those slots now carry the badge.

## Part 8 — The three signature features (10 min)

**Tomorrow** — open it. ✅ You see a cover prediction with a sentence explaining it, a prep list, a market list. Drag the slider — the lists recalculate. Press **Prep sheet** (print dialog) and **Send to the team** (WhatsApp text). On a fresh install it will honestly say it has no history yet; that is correct.

**Neighbours** — open it. ✅ With the sample estate loaded, **What things cost** shows a real area median per item and how much this property is overpaying per week, because all six share one district. If you only created one property it correctly says *not enough neighbours yet — 0 of 5*; that is the privacy rule working, not a bug.

**Proof of business** — ✅ With the sample estate the months are already sealed and the banner is green: *verified*. Otherwise press **Seal my trading history** first. On a brand-new single property with no past months there is nothing to seal yet — also correct. Then **Share a record** → create a link → open it in a private window. ✅ You see the read-only record page.

---

## Part 8b — Pulse, Leak finder, Shift close, and the theme switch (12 min)

**Pulse** — open **Pulse** in the sidebar.
1. With a couple of tables occupied from Part 3, the list shows each table's stage and a "frees in N min".
   ✅ You should see: a billed table near the top with about 8 min, a just-ordered one near the bottom.
2. Tap party size **4** in *Quote a wait*. ✅ A number appears (or "now" if a 4-seater is free).
3. Type a name, **Add to queue**. ✅ A card appears with place 1 and the quoted minutes.
4. Open `/queue/<your slug>` on your phone (the link is on the Join by QR card; Listed must be on in Settings → Storefront). Join with a name.
   ✅ Your phone shows *place 2*. On the desktop, **Seat** the first party. ✅ Within 20 s the phone shows *place 1*.
5. Seat the phone's party at a free table. ✅ The phone shows *Your table's ready · T-number*.

**Leak finder** — Pantry → **Leak finder**.
6. **Count stock now**, type a number 2 kg below what the system says for rice, **Save count**.
   ✅ The pantry now shows the counted figure, and the Leak finder lists rice with a minus quantity and a rupee value.
7. Sell a biryani (Part 3), then count rice again at exactly what the system says. ✅ Rice drops off the leaks list.

**Shift close** — Billing → **Close shift**.
8. ✅ Cash / UPI / Card / Total match the bills you settled today. Type a cash count ₹50 below expected plus the float.
   ✅ The red box says *₹50 short* before you submit.
9. **Close shift and write the summary**. ✅ A flip tile shows *50 · short* and a one-paragraph summary you can copy for WhatsApp.
10. Open Close shift again. ✅ Every figure is ₹0 — the next shift starts clean.

**Theme** — the sun/moon in the top bar. ✅ The whole app switches; the flip tiles stay dark. Settings → Appearance → *Follow device* tracks your computer. Reload: ✅ no flash of the wrong colour. Open `/dine` in another tab: ✅ always bright.

## Part 8c — Assist (3 min)

1. On any screen, tap the mark in the bottom-right corner (or press ⌘J / Ctrl+J). ✅ A panel opens saying *Reading Kitchen* (or whichever screen), with three suggested questions.
2. Tap a suggestion. ✅ With `ANTHROPIC_API_KEY` set, a short plain-words answer using this screen's numbers. Without it, the facts it can see and a note that the key is needed.
3. Move to another screen and open it again. ✅ The conversation is fresh and the suggestions changed.
4. Ask it to change something ("cancel table 4"). ✅ It tells you what to tap; nothing changes on its own.
5. Leave a kitchen ticket untouched for 16 minutes (or add a walk-in and wait). ✅ The mark's spark turns red, a ring pulses, and a count appears on the button. Open it: ✅ a *Right now* card names the ticket, with an arrow to the kitchen.
6. With stock below reorder, tap **Draft the supplier message**. ✅ A WhatsApp-ready list appears with a copy button — nothing was ordered.
7. Ask "should I call the next party?" ✅ The answer streams in and, if a party is waiting, ends with a **Call …** button. Tap it. ✅ The guest's queue page shows *You're up*.

## Part 8d — Working with the line cut (8 min)

1. Open **Orders**, then turn off wi-fi (or use the browser's offline mode). ✅ A dark bar reads *Working offline*.
2. Punch a full order and send it to the kitchen. ✅ It appears on screen at once; the bar now says *Working offline · 1 waiting*.
3. Move a kitchen ticket to *Ready*, add a walk-in on **Pulse**, and mark a room clean. ✅ All three happen on screen; the count climbs to 4.
4. **Reload the page while still offline.** ✅ The app still opens (service worker), and the bar still says *4 waiting* — nothing was lost.
5. Turn wi-fi back on. ✅ Within a few seconds the bar turns green: *Back online · 4 sent*, then disappears. Open the kitchen and Pulse: ✅ everything you did offline is really there, once each.
6. Repeat step 2 but kill the connection *mid-send*. ✅ The order still lands exactly once — the server de-duplicates by `client_id`. (This is also proven by `node scripts/sqltest/offline.mjs`.)
7. On the phone app, do the same: punch an order in aeroplane mode, then turn it off. ✅ The banner reads *Offline · 1 waiting*, then *Back online · 1 sent*.

## Part 9 — The phone app (10 min)

The phone has five tabs — Control, Orders, Kitchen, Pulse, More — with Rooms, Pantry and Scan under More. On Control, pull down to refresh; watch a flip tile change when an order is placed: ✅ only the digit that changed turns over, top half folding down first. The phone has a **Pulse** tab too: waiting count, next free, a quote for the chosen party size, and Call / Seat / Left on each queued party.

1. Launcher → **2**. A QR code appears.
2. Phone and laptop on the **same Wi-Fi**. Install **Expo Go**. Scan the QR.
3. Inside the property (web) → **Staff → Invite staff** → role **Waiter** → copy the 8-letter code.
4. On the phone: **Join with an invite code** → paste → name, email, password.
   ✅ You get the waiter's Orders tab.
5. Punch an order on the phone. ✅ It appears in the web **Kitchen** within a second or two.
6. Turn the phone to **aeroplane mode**, punch another order. ✅ A bar says "Offline · 1 waiting". Turn it off. ✅ It syncs.

---

## Part 9b — Who can open what (5 min)

1. Sign in as `master@dineflow.in`. ✅ You land on **Master control**, not a property.
2. In another browser, sign in as an owner and open `/admin`. ✅ Bounced to their dashboard.
3. Back as master: on a property row tap **Access**. Switch **Pulse** and **Reports** off, **Save access**.
4. As that owner, reload. ✅ Pulse and Reports are gone from the sidebar and the phone's tabs. Type `/pulse` in the address bar. ✅ You land on the dashboard with a note that the section isn't switched on.
5. As master, set the property back to **Everything**. ✅ The owner sees them again on reload.

## Part 9c — What an employee can open (4 min)

1. As an owner, open **Staff**. Next to a waiter tap **Access**. ✅ Only the sections a waiter may ever have appear (Orders, Reservations, Pulse, Scan), and only those the master allowed.
2. Untick **Pulse**, Save. Sign in as that waiter (phone or web). ✅ Pulse is gone from their menu and `/pulse` bounces to the dashboard.
3. Change the role to **Cashier**. ✅ The sections reset to the cashier's default.
4. Try to change your own role. ✅ The dropdown is disabled. Try, as a manager, to change an owner. ✅ Refused.

## Part 10 — Master control and memberships (5 min)

1. **Back to Master control**.
   ✅ Your property is listed with today's sales, live orders, rooms, users.
2. Press **Manage** → **Suspend**. Then press **Open** on that row.
   ✅ You still get in — Master is never locked out. Sign out and sign in as the *client owner* instead: they are locked to the membership page. That is correct.
3. Master control → **Issue key** → copy it. As the client owner, `/membership` → paste → **Activate**. ✅ Unlocked, badge says active.
4. Master control → **Change master password**. ✅ Do this for real before going live.

---

## What "pass" looks like overall

| Area | Pass |
|---|---|
| Every sidebar screen | loads in under a second, no red error |
| Order → kitchen → bill | stock drops, bill prints, invoice numbered |
| Hotel stay | one final invoice with room + food + extras |
| Offline | orders accepted, bar appears, syncs with no duplicates |
| Printing | test print lays out correctly at your paper width |
| Online orders | test order reaches the kitchen |
| Scanning | barcode opens or creates a product |
| Phone app | order from phone reaches the web kitchen |
| Master control | property listed; Open works; suspend locks the client |

---

## When something fails

Write down: **which step number**, **which screen**, and **the exact red text**. That is enough to fix almost anything.

Common ones:
- **Screen is blank / red error** → the migration may not have run. Launcher → **7**.
- **Stock didn't drop** → the dish has no recipe. Menu → flask icon.
- **Kitchen doesn't update live** → Supabase → Database → Publications → `supabase_realtime` → tick orders, order_items, kots, rooms, bookings.
- **"not signed in" inside the app** → cookies blocked; use a normal window, not private, for the main login.
- **Phone can't reach the laptop** → same Wi-Fi; some office networks block it. Use your phone's hotspot for both.
- **Everything is empty** → Settings → **Load demo data**.
