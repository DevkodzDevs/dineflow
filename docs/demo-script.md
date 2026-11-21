# The client demo — ten minutes, two properties

Written 2026-11-22 for whoever shows DineFlow to a restaurant or hotel owner. The rule throughout: **show, do not tell** —
every step is a thing the client watches happen on a real screen, never a slide.

## Before the demo (once)

| | What | Why |
| --- | --- | --- |
| 1 | Sign in on the **seeded properties**, not Try Demo: **manoooo** (hotel) and **Tan Resort** (resort) carry weeks of orders, bills, bookings and staff. | Try Demo is a one-day sandbox with the lean module set — seven screens (My day, Tomorrow, Staff, Tax, Online orders, Scan, Neighbours) stay off, Reports is empty until a bill is paid. |
| 2 | Open the app in **Chrome**, 1440 wide or wider, and **a phone** beside it (the same login). | Half of what sells is the phone: the guest's QR page, the waiter's tab bar, the kitchen on a tablet. |
| 3 | Set the theme to **Ember** on the laptop, **Light** on the phone. | Two looks in the first minute without saying a word about themes. |
| 4 | Keep one table **open with items** and one bill **ready to settle** on the restaurant; one arrival **due today** on the resort. | So nothing has to be typed under the client's eyes. |
| 5 | Master control is **not** part of the demo. Change the shipped password first if it has not been. | |

## The script

**0:00 — The control room (restaurant, Ember).** "This is what the owner sees at 7 pm." Point at the flip tiles: tables, orders,
in kitchen — they count up live. Swipe the theme menu: Dark, Light, Royal, Ember. *"Your brand, your mood, one tap."*

**1:00 — A guest orders from the table.** On the phone, open the table's QR link (`/dine/<slug>?t=<table>`). Add two dishes, send.
Back on the laptop: the order lands on the Orders board **and** the kitchen ticket prints itself on the Kitchen screen. *"No waiter
needed to key it in; nothing is lost between the table and the kitchen."*

**2:30 — The kitchen.** Kitchen screen: the ticket's clock is running; mark a dish ready; the waiter's phone buzzes (the bell swings
in the top bar). Open the **Order board** on the TV mode if a second screen is handy.

**3:30 — The bill.** Billing → the open order → Generate bill. Show the GST split, the UPI QR (dynamic amount), a 10 % discount
that needs the manager's code. Settle by cash — the change to return is on screen in big digits. *"Every bill is numbered, every
discount has a name on it."*

**5:00 — Reports → Where the money went.** The ribbons: dine-in and online on the left, the till, UPI / cash / card on the right;
spend by head beside it. Switch to 30 days. *"You never have to add up a drawer again."*

**6:00 — Feedback.** On the phone, open `/feedback/<slug>?t=<table>` and tap four stars — the constellation draws, the tags appear.
On the laptop the manager's bell rings for a low rating (tap two stars to show it). *"Complaints reach you before the guest reaches
Google."*

**7:00 — The resort (Tan Resort).** Front desk → **Book a room**: the stitched seam at the top sews itself as you fill When → Room →
Guest → Payment; pick a room — the second guest cannot be given the same room for the same night (the database refuses it, not the
screen). Check a guest in; the housekeeping board on the phone shows the room to turn.

**8:30 — Checklists and the team.** Checklists: tick two duties — the words burn away, the list lights when it is done. Staff →
attendance by phone; payroll with PF/ESI already computed.

**9:30 — Close.** Settings → Appearance (the four themes), Language (தமிழ் / हिन्दी: switch the whole app, every screen follows), and
the storefront link the client can put on a QR stand tomorrow. *"Your menu, your tables, your rooms — online by tonight."*

## What not to open

- **Menu → From photo** unless `ANTHROPIC_API_KEY` is set on Vercel (the tile is hidden without it).
- **Subscription / checkout** — the legal facts in `lib/company.ts` are still null and Razorpay keys are not set; say "plans are
  on the pricing page" and move on.
- **Online orders / Swiggy-Zomato** on a property with no channel connected — it is an empty board.
- Anything on a property the client could recognise as another real business.

## If something goes wrong

- A screen bounces to `/membership`: the demo login expired — sign in on the seeded property instead.
- The kitchen ticket does not appear: the Kitchen screen must be open *before* the order is sent (it listens live; it does not
  replay the past).
- The bell is silent: Sound & alerts (the panel's foot) — the device may have the station set to a role that does not hear that event.
