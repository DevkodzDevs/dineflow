> The complete, current guide is **STARTUP-GUIDE.md**. This file is kept for reference.

# DineFlow — Start Guide (Local → Live)

> **Shortcut:** `QUICK-START.md` + the `Start-DineFlow` launcher do everything below automatically (install, database, master admin, Vercel deploy, Docker, app builds). This guide is the manual version and the reference.

Two paths, in order. Do **Part A** first on your laptop; **Part B** puts it in front of real staff.
Detailed reference (roles, design system, troubleshooting) is in `SETUP-GUIDE.md`.

---

## Part A — Local (your laptop, ~30 minutes)

### A1. Install once
| Tool | Why | Get it |
|---|---|---|
| Node.js 20 LTS | runs web + mobile tooling | https://nodejs.org |
| pnpm 9 | monorepo package manager | `npm i -g pnpm` |
| Git | version control | https://git-scm.com |
| Expo Go (phone app) | preview the mobile app instantly | Play Store / App Store |
| VS Code | editor | optional |

Android Studio / Xcode are **not** needed for Part A. Expo Go previews on a real phone over Wi‑Fi.

### A2. Supabase (free tier is enough)
1. https://supabase.com → New project → name `dineflow-dev`, region **Mumbai**, save the DB password.
2. **SQL Editor → New query** → paste all of `supabase/migrations/0001_init.sql` → Run. Then `0002_hospitality.sql`, then `0003_scan_labour_invoices.sql` — one query each, in order.
3. **Authentication → Providers → Email** → turn **off** "Confirm email" (dev only).
4. **Project Settings → API** → copy **Project URL** and **anon public** key.

### A3. Web app
```bash
unzip dineflow.zip && cd dineflow
pnpm install
cp apps/web/.env.local.example apps/web/.env.local
```
Edit `apps/web/.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```
```bash
pnpm dev:web        # → http://localhost:3000
```
- `/signup` → choose **Restaurant / Hotel / Resort**, name it → you become Owner and your **7-day trial** starts. Restaurants get 8 tables + 5 categories; hotels/resorts also get 20 rooms across 2 floors and 3 room types; resorts also get 4 sample facilities.
- **Make yourself the master admin** (once): Supabase → SQL Editor →
  `insert into platform_admins(user_id, label) select id, 'master' from auth.users where email = 'YOUR-EMAIL';`
  Then open `/admin` — the Master control that sees every client property.
- Menu → add 3–4 dishes. Pantry → add ingredients → Record purchase. Menu → flask icon → map recipe.
- Orders → tap T1 → add dishes → **Send to kitchen** → open `/kitchen` in a second tab and watch it arrive live.
- Billing → the order → Generate bill → Mark paid.
- Hotel/resort only: Front desk → New booking → pick a room → Confirm → Check in. Orders → New → **Room** type → pick the guest → Send to kitchen → Billing → **Charge to room**. Front desk → the booking → folio shows the dinner → Check out.

### A3b. Test the trial → membership flow
1. `/admin` → Manage on your property → **Suspend** (or wait 7 days). Reload `/dashboard` → you land on the **Membership login** page; the mobile app shows a lock screen.
2. `/admin` → Issue key (monthly or yearly) → copy.
3. `/membership` → paste the key → Activate. Everything unlocks; the sidebar badge shows `active`.

Test phone layout without a phone: Chrome → F12 → device toolbar (bottom nav, sheets, POS cart bar all switch automatically under 768 px).

### A4. Mobile app
```bash
cp apps/mobile/.env.example apps/mobile/.env
```
Edit `apps/mobile/.env`:
```
EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```
```bash
pnpm dev:mobile     # Expo dev server starts, prints a QR code
```
Phone on the same Wi‑Fi → open **Expo Go** → scan QR. Sign in with the owner account.
Create a waiter via Web → Staff → Invite → use the code on the phone's **Join** screen. Place an order from the phone; it appears on the web Kitchen page instantly.

### A5. Type-check before committing (optional but recommended)
```bash
pnpm typecheck
```

---

## Part B — Live (real restaurant)

### B1. Production Supabase
Create a **second** project `dineflow-prod` (never share dev and prod data).
1. Run `0001_init.sql`, `0002_hospitality.sql`, `0003_scan_labour_invoices.sql` in the new project (or launcher → 7).
2. **Authentication → Providers → Email**: keep "Confirm email" **on**.
   Authentication → URL Configuration → Site URL = your web domain (e.g. `https://app.dineflow.in`), add `dineflow://` to Redirect URLs for mobile.
3. Authentication → Email Templates: put your restaurant/company name in the confirmation mail.
4. **Settings → Database → Backups**: daily backups are automatic on Pro; on Free, export weekly (Settings → Database → Backups → Download).
5. Copy the prod **URL** and **anon** key. The `service_role` key is never used by these apps — keep it secret.

### B2. Web on Vercel (free tier works)
1. Push the repo to GitHub (`git init && git add . && git commit -m "DineFlow v1" && git push`).
2. https://vercel.com → Add New Project → import repo.
   - **Root Directory**: `apps/web`
   - Framework: Next.js (auto)
   - Install command: `pnpm install --frozen-lockfile=false` (monorepo)
   - Environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (prod values)
3. Deploy. Vercel gives `https://dineflow-xxx.vercel.app`.
4. **Custom domain**: Vercel → Settings → Domains → add `app.yourdomain.in` → add the CNAME at your registrar (GoDaddy/Hostinger/BigRock). HTTPS is automatic.
5. Update Supabase Site URL to this domain.

Alternative hosts: Netlify, Railway, or your own VPS (`pnpm build` then `pnpm --filter @dineflow/web start` behind nginx). Static export is **not** possible — this app uses server actions.

### B3. Mobile on Play Store + App Store (EAS)
```bash
npm i -g eas-cli
eas login                      # free Expo account
cd apps/mobile
eas build:configure            # creates eas.json
```
Set prod env in `eas.json` → `build.production.env`:
```json
{ "EXPO_PUBLIC_SUPABASE_URL": "https://prod.supabase.co", "EXPO_PUBLIC_SUPABASE_ANON_KEY": "eyJ..." }
```
Before the first store build, in `app.json` set your own `android.package` / `ios.bundleIdentifier` (e.g. `in.yourcompany.dineflow`) and replace `assets/icon.png` (1024×1024) and `assets/splash.png`.

**Android**
```bash
eas build -p android --profile preview      # .apk — share on WhatsApp for staff testing (no store needed)
eas build -p android --profile production   # .aab for Play Store
eas submit -p android                       # uploads to Play Console (one-time ₹2,100 developer fee)
```
Play Console → Internal testing first → then Production. Review usually 1–3 days.

**iOS**
```bash
eas build -p ios --profile production       # needs Apple Developer Program (₹8,000/yr)
eas submit -p ios                           # → App Store Connect → TestFlight → App Review
```
For a single restaurant you can skip the App Store: distribute via TestFlight (up to 10,000 testers).

**Updates without a store release**: `eas update --branch production` pushes JS changes over-the-air; native changes (new packages) need a new build.

### B3b. Master control in production
- Add your own login to `platform_admins` in the **prod** project (same SQL as A3). Optionally a second admin for your support staff.
- Every client signs up at `https://app.yourdomain.in/signup` → 7-day trial. You see them in `/admin` immediately.
- On payment (WhatsApp/UPI for now), issue a key from `/admin` and send it. Or click **Activate 30d / 1 year** directly — no key needed.
- Trials expire automatically (no cron needed — the check runs at every request). `/admin` shows "expiring in 2 days" so you can call them first.

### B4. Go-live checklist
- [ ] Settings → property type, name, address, phone, **GSTIN**, GST rate, service charge (hotels: room GST 12%, check-in/out times)
- [ ] Hotels/resorts: room types & rates, room numbers per floor, facilities & prices
- [ ] Tables & zones match the floor
- [ ] Every dish has a recipe mapped (otherwise stock won't drop)
- [ ] Opening stock entered (Pantry → adjust icon → Opening balance)
- [ ] Staff invited with correct roles; owner password strong; dev accounts deleted
- [ ] Kitchen tablet: signed in as `chef`, screen-sleep off, charger connected
- [ ] Cashier trained on: Generate bill → split payment → Mark paid → Close day
- [ ] Printed a test receipt from Billing (browser print → 80 mm width)
- [ ] Supabase backups verified; Vercel domain on HTTPS

### B5. Running costs (approx.)
| Item | Free tier | Paid |
|---|---|---|
| Supabase | 500 MB DB, 50k MAU, pauses after 7 days idle | Pro $25/mo (no pause, daily backups) |
| Vercel | Hobby (non-commercial) | Pro $20/mo for commercial use |
| Expo EAS | 30 builds/mo | $19/mo if you build often |
| Google Play | — | $25 one-time |
| Apple Developer | — | $99/yr |

For one restaurant: Supabase Pro + Vercel Pro ≈ ₹3,800/month. For selling to many restaurants, the same deployment serves all of them (multi-tenant) — cost stays flat until traffic grows.

### B6. Day-2 operations
- **Add a feature** → change code → `git push` → Vercel auto-deploys; mobile → `eas update`.
- **Database change** → new file `supabase/migrations/0002_xxx.sql` → run in prod SQL editor → note in SETUP-GUIDE changelog.
- **Monitoring** → Supabase → Logs (API/DB errors), Vercel → Logs. Set a Supabase "usage alert" email.
- **New restaurant onboarding** (SaaS mode) → they sign up at `/signup`; you set `restaurants.plan` manually until Razorpay is added.

---

## Design reference
UI mockups are in `design/` (control room, kitchen display, tablet POS, mobile screens, design system). They use the exact tokens from `apps/web/app/globals.css` and `apps/mobile/lib/theme.ts`.
