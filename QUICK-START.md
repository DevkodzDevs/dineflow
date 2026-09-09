> The complete, current guide is **STARTUP-GUIDE.md**. This file is kept for reference.

# DineFlow — Quick start (no complications)

You need **one thing installed**: Node.js 20+ → https://nodejs.org (click the LTS button, Next-Next-Finish).
Everything else the launcher installs for you.

---

## Local (your laptop) — 3 steps

1. **Supabase, once (5 min):** https://supabase.com → New project (region Mumbai) → wait for it to finish.
   Keep two pages open: *Settings → API* (Project URL + anon key) and *Settings → Database → Connection string → URI* (choose "Session", copy it — it contains your password).
2. **Double-click the launcher:**
   - Windows → `Start-DineFlow.bat`
   - Mac → `Start-DineFlow.command` (first time: right-click → Open)
   - Linux → `./start.sh`
   Press **1**. Paste the three values when asked. The launcher installs packages, builds the database automatically, and asks for your email to make you **Master admin**.
3. Your browser opens at **http://localhost:3000/signup**.
   **Or skip sign-up entirely:** `/login` with **master@dineflow.in** / **DineFlow@Master2026** — the built-in Master account that opens every property. Change the password before going live. Choose Restaurant / Hotel / Resort, sign up, done.
   Master control is at http://localhost:3000/admin (after you've signed up with the email you gave).

Phone app: run the launcher again → **2**, install *Expo Go* from Play Store / App Store, scan the QR.

Next time: just double-click the launcher → 1 (it skips what's already done).

---

## Live (real customers) — 3 ways, pick one

**A. Vercel (recommended, free to start, HTTPS + domain included)**
Launcher → **3**. A browser window asks you to log in to Vercel once. The launcher deploys the web app and prints the public URL.
Then Supabase → Authentication → URL Configuration → Site URL = that URL. That's it.
For your own domain, answer **y** when asked and type `app.yourhotel.in`; add the CNAME it shows at your domain provider.

**B. Your own server / VPS (Docker)**
Copy the folder to the server, run `./start.sh docker`. It builds and runs on port 3000 (put nginx/Caddy in front for HTTPS).

**C. Phone apps for staff**
Launcher → **8** starts the thermal print bridge for LAN printers.
Launcher → **5** → **1** gives you an Android **APK** link you can send on WhatsApp — no Play Store needed.
Options 2 / 3 make Play Store and App Store builds (needs the developer accounts, see START-GUIDE §B3).

Use a **separate Supabase project for live** (launcher → 6 to switch keys, → 7 to build its database and add yourself as Master admin).

---

## If something goes wrong
| You see | Do |
|---|---|
| "Node is required" | Install from nodejs.org, reopen the launcher |
| Database step fails "password authentication" | Re-copy the connection string; replace `[YOUR-PASSWORD]` with the DB password you set when creating the project |
| Database step fails "SSL" or "timeout" | Use the **Session** pooler string (port 5432) from Settings → Database |
| No DATABASE_URL | Leave it blank — the launcher opens the SQL editor; paste `0001_init.sql`, `0002_hospitality.sql`, `0003_scan_labour_invoices.sql` in order, Run each |
| App looks empty after signup | Settings → **Load demo data** |
| LAN printer doesn't respond | Start the print bridge: launcher → 8, or Print-Bridge.bat |
| Scan page says photo recognition is off | Optional: add `ANTHROPIC_API_KEY` (launcher → 6). Barcode/QR scanning works without it |
| Sign-up says "check your inbox" | Supabase → Authentication → Providers → Email → turn off "Confirm email" (dev only) |
| /admin redirects to dashboard | Sign up first with that email, then launcher → 7 → enter the email |
| Anything else | `SETUP-GUIDE.md` §6, or send the red error line |

**No other accounts needed.** Photo scanning, Swiggy/Zomato and OTA credentials are all optional — without them the app runs in a clearly-marked sample mode and everything else is real. See BEGINNER-GUIDE Part 13.

The web app is installed, type-checked and production-built (v12). Real printer, real load and real staff are still yours to test.

Full details: `START-GUIDE.md` (local → live, costs, checklist) · `SETUP-GUIDE.md` (reference).
