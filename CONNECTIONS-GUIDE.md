# DineFlow — Connections guide

*Every wire the application has, what goes through it, where the key lives, how to connect it, and
how to prove it works. Taken from the code on 5 September 2026 (v20.4): the variable names, routes and
ports below are the ones the app actually reads.*

There are **fourteen connections**. Three are required. The rest are optional and independent —
you can leave any of them unconnected and everything else still runs.

| # | Connection | Direction | Required? | Where the key lives |
|---|---|---|---|---|
| 1 | Supabase database (web) | app → Supabase | **Yes** | `apps/web/.env.local` |
| 2 | Supabase database (phone) | app → Supabase | **Yes** for the phone | `apps/mobile/.env` |
| 3 | Direct database connection (migrations) | scripts → Postgres | **Yes**, once | `apps/web/.env.local` |
| 4 | Service-role key (server routes) | server → Supabase | For webhooks/OTA/iCal | `apps/web/.env.local` |
| 5 | Realtime (live screens) | Supabase → app | Automatic | — |
| 6 | Anthropic (Assist, Scan) | app → api.anthropic.com | Optional | `apps/web/.env.local` |
| 7 | Aggregator webhooks (Swiggy, Zomato, UrbanPiper…) | them → app | Optional | Per channel, in the app |
| 8 | OTA iCal (Booking.com, Airbnb, MMT…) | both ways | Optional | Per channel, in the app |
| 9 | Scheduled OTA sync (cron) | scheduler → app | Optional | `CRON_SECRET` |
| 10 | Thermal printers | browser → printer | Optional | In the app + print bridge |
| 11 | WhatsApp | app → wa.me | Automatic | — |
| 12 | The Box (on-premise) | Box ↔ cloud | Optional | `.env` at the repo root |
| 13 | Hosting (Vercel / Docker) | internet → app | For going live | Vercel dashboard / `.env` |
| 14 | Phone app builds (EAS) | you → Expo | For an APK | Expo account |

Each has its own section. Do 1–3 first; everything else in any order.

---

## Before anything: where the keys go

There are exactly three files that hold keys. Never commit them; the repo's `.gitignore` already
excludes them.

**`apps/web/.env.local`** — the web app and the scripts read this.
```env
# 1 · Supabase, public side (safe to expose; Row Level Security protects the data)
NEXT_PUBLIC_SUPABASE_URL=https://abcdefgh.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi…

# 3 · Direct database connection — migrations only. Keep private.
DATABASE_URL=postgresql://postgres:YOUR-DB-PASSWORD@db.abcdefgh.supabase.co:5432/postgres

# 4 · Service role — only the server ever sees this. Needed for webhooks, OTA and iCal. Keep private.
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi…

# 6 · Anthropic — optional. Assist and Scan photo recognition.
ANTHROPIC_API_KEY=sk-ant-…

# 9 · A word of your choosing that the nightly OTA sync must present. Optional.
CRON_SECRET=some-long-random-words

# 13 · Your public address once live. QR codes and share links use it.
NEXT_PUBLIC_APP_URL=https://app.yourplace.in
```

**`apps/mobile/.env`** — the phone app reads this at build time.
```env
EXPO_PUBLIC_SUPABASE_URL=https://abcdefgh.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi…
EXPO_PUBLIC_WEB_URL=http://192.168.1.10:3000     # your laptop's LAN address while developing; the public URL once live
```

**`.env` at the repo root** — only if you run the Box (section 12). The launcher writes it.

The launcher's **option 1** and **option 6** write the first file for you by asking questions. Every
section below tells you which lines it needs.

---

## 1 · Supabase database — the web app

**What it is.** Postgres with a REST API and sign-in built in. The web app talks to it from the
browser with the *anon* key; Row Level Security (RLS) in the database decides what each signed-in
person may see. Nothing outside your property is ever visible to you, by design of the database, not
of the app.

**Step by step.**
1. [supabase.com](https://supabase.com) → **New project**. Name `dineflow`, a strong database password
   (write it down — you need it in section 3), region **Mumbai `ap-south-1`** for India.
2. Wait for *Project is ready* (about a minute).
3. **Project Settings → API.** Copy **Project URL** and the **anon public** key.
4. Put them in `apps/web/.env.local` as `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   — or run the launcher's **option 1**, which asks for them.
5. **Authentication → URL configuration.** Site URL: `http://localhost:3000` for now; add your public
   address in section 13. Without this, sign-in redirects go to the wrong place.
6. **Authentication → Providers → Email.** Leave *Confirm email* **off** for now so invited staff can
   sign in straight away; turn it on once you have a public address and a mail sender.

**Prove it.** Start the app (`option 1`), open `http://localhost:3000/login`. The page loads → the URL
is right. Sign in as `master@dineflow.in` / `DineFlow@Master2026` → the anon key is right.

**If it fails.** *Invalid API key* → key copied with a trailing space; paste again. Sign-in spins
forever → the URL has a typo or the project is paused (free projects pause after a week idle:
open the dashboard and press Restore).

---

## 2 · Supabase database — the phone app

Same project, same two values, different file.

1. Copy `apps/mobile/.env.example` to `apps/mobile/.env`.
2. Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` to the **same** values as section 1.
3. Set `EXPO_PUBLIC_WEB_URL` to your laptop's address on the wi-fi, e.g. `http://192.168.1.10:3000`
   (`ipconfig` on Windows, `ifconfig` on Mac). The phone uses it for the storefront and QR links.
4. Launcher **option 2** starts Expo and prints a QR. Scan it with **Expo Go** on a phone on the same wi-fi.

**Prove it.** The app opens on the board ("Opening DineFlow"), then the sign-in. Sign in as a sample
owner → the Control tab shows numbers.

**If it fails.** *Network request failed* → phone and laptop on different networks, or the
laptop's firewall blocks port 8081. Changed `.env`? Stop Expo and start it again with
`--clear`; Expo bakes these values in at start.

---

## 3 · Direct database connection — migrations

**What it is.** The one connection that talks to Postgres directly, bypassing the API. It is used
only to create the schema (the 19 migrations) and the master admin. Nothing in the running app uses it.

1. **Project Settings → Database → Connection string → URI.** Copy it.
2. Replace `[YOUR-PASSWORD]` with the password from section 1, step 1.
3. Put it in `apps/web/.env.local` as `DATABASE_URL`.
4. Run the launcher's **option 7** (or it runs automatically inside option 1). It applies
   `supabase/migrations/0001…0019` in order and creates `master@dineflow.in`.

**Prove it.** The option prints one ✓ per migration. In Supabase → **Table editor** you see
`restaurants`, `orders`, `bills`, `walkins`… (about 60 tables).

**If it fails.** *password authentication failed* → the placeholder is still in the string.
The migration script uses SSL by default; set `PGSSLMODE=disable` only for a local Postgres
without it.
*relation already exists* → harmless; every migration is written to be re-run.

**Safety.** This string can delete everything. Never put it anywhere a browser can see it, never
in the phone app, never in a screenshot.

---

## 4 · Service-role key — server routes

**What it is.** A second key with full access, for the three server routes that receive data
from *outside* — an aggregator posting an order, an OTA reading your calendar, the nightly sync.
Those callers have no DineFlow sign-in, so the server acts on their behalf using this key, after
checking their own credential (a per-channel token).

1. **Project Settings → API → service_role** (it is hidden; press *Reveal*). Copy it.
2. `apps/web/.env.local` → `SUPABASE_SERVICE_ROLE_KEY=…`
3. Restart the app.

**Prove it.** Section 7's test order lands. Without this key, the webhook returns *500*.

**Safety.** This key ignores RLS. It is read only by `app/api/webhooks/**`, `app/api/ical/**` and
`app/api/ota/**` — all server-side. It never reaches a browser, and the phone app never has it.

---

## 5 · Realtime — live screens

**What it is.** Supabase pushes changes to the app the moment a row changes, which is how the
kitchen sees an order the same second it is sent. Nothing to connect: the migrations already add
every live table to the `supabase_realtime` publication.

**Prove it.** Open Kitchen on one screen and take an order on another. The ticket appears within a
second without a refresh.

**If it stalls.** Supabase → **Database → Replication** → confirm the `supabase_realtime`
publication lists `orders`, `order_items`, `kots`, `bills`, `walkins`, `rooms`, `bookings`,
`housekeeping_tasks`. If a table is missing, run: `alter publication supabase_realtime add table
<name>;` in the SQL editor. The app also polls every 30 s as a safety net, so nothing is ever lost —
only slower.

---

## 6 · Anthropic — Assist and Scan (optional)

**What it is.** Assist (the tile in the corner) answers in words, and Scan reads a photographed
bill or barcode, through Claude. Both work without the key in a reduced way: Assist shows the facts
it can see; Scan returns a marked sample.

1. [console.anthropic.com](https://console.anthropic.com) → **API keys** → create one.
2. `apps/web/.env.local` → `ANTHROPIC_API_KEY=sk-ant-…`
3. Restart.

**Prove it.** Open Assist on the Kitchen screen and ask *"which ticket is most late?"* → a sentence
with a real ticket number. Cost: fractions of a rupee per question; set a monthly limit in the
console if you like.

**What leaves your building.** The current screen's numbers and a whole-house snapshot (sales, late
tickets, queue, low stock) — no customer names, no card numbers. The route is
`app/api/assist/route.ts` if you want to read exactly what is sent.

---

## 7 · Aggregator webhooks — Swiggy, Zomato, UrbanPiper, your own app (optional)

**What it is.** Anyone who sends you orders can POST them to DineFlow. Each channel gets its own
secret address; the address *is* the credential, so the sender needs no login.

1. **Channels → + Add channel** (kind: Swiggy, Zomato, UrbanPiper or Custom; the commission %
   you pay). Save.
2. The channel shows a **Webhook URL** like
   `https://app.yourplace.in/api/webhooks/aggregator/9f3c…a12e`
   Copy it.
3. Give it to the sender:
   - **UrbanPiper** (the usual middleman for both Swiggy and Zomato): their dashboard → *Integrations
     → Webhooks → Order created* → paste the URL.
   - **Your own website or app**: POST JSON to it. The Channels screen shows a ready `curl` with the
     exact shape (`items`, `customer`, `address`, `gross`, `external_ref`).
4. Requires section 4 (service-role key) and section 13 (a public address — Swiggy cannot reach
   `localhost`).

**Prove it.** Run the `curl` from the Channels screen. ✅ The order appears on **Online orders** with
its channel badge, and Assist's *Right now* notices it.

**Direct Swiggy / Zomato partner APIs** are not built — they need partner approval that only a
registered restaurant can obtain. The webhook path above is how nearly every Indian restaurant
integrates in practice, through UrbanPiper or a similar middleman.

**Safety.** The token is 32 random hex characters. There is no rotate button; if it leaks, delete
the channel and add it again — the new one gets a new token and the old URL stops working at once.

---

## 8 · OTA calendars — Booking.com, Airbnb, MakeMyTrip, Agoda (optional, hotels)

**What it is.** Two-way iCal. DineFlow *publishes* a calendar of your booked dates so the OTA stops
selling them; DineFlow *reads* the OTA's calendar so its bookings block your rooms. No API keys —
this is the standard every OTA supports.

1. **Channels → OTA → + Add** (kind, label, which room type).
2. **Export (you → them).** DineFlow shows an address like
   `https://app.yourplace.in/api/ical/7b2e…f0.ics`. In the OTA's extranet: *Rates & availability →
   Sync calendars → Import calendar* → paste it. The OTA polls it every few hours.
3. **Import (them → you).** In the OTA's extranet: *Export calendar* → copy their `.ics` address →
   paste it as the channel's **Import URL** in DineFlow. Press **Sync now**.
4. Requires section 4 and section 13.

**Prove it.** Press **Sync now**. ✅ The channel shows *last sync* just now and the OTA's bookings appear
on the Rooms board as blocks. Open your export address in a browser: a text file starting
`BEGIN:VCALENDAR` with one `VEVENT` per booking.

**Timing.** iCal is not instant — OTAs poll every 1–4 hours. For a same-day walk-in, close the date
manually in the OTA too. Real-time OTA APIs need certification and are not built.

---

## 9 · Scheduled OTA sync (optional)

The import in section 8 runs when you press *Sync now*. To run it on a schedule:

1. `apps/web/.env.local` → `CRON_SECRET=some-long-random-words`.
2. Tell a scheduler to fetch `https://app.yourplace.in/api/ota/sync?key=some-long-random-words` once
   a night:
   - **Vercel:** `apps/web/vercel.json` already carries a `crons` entry that calls `/api/ota/sync`
     **every 15 minutes**; add `CRON_SECRET` to the project's environment variables and Vercel
     sends it automatically. Change the `schedule` there if you want it less often.
   - **Your own server:** `crontab -e` →
     `0 2 * * * curl -s "https://app.yourplace.in/api/ota/sync?key=some-long-random-words"`

**Prove it.** Open the URL with the key in a browser → JSON with `synced: N`. Without the key → 401.

---

## 10 · Thermal printers (optional)

Two kinds. Both print ESC/POS — the language every 58 mm and 80 mm receipt printer speaks.

**A. Bluetooth or USB, from the device itself**
1. Settings → Printers → **Pair**. Chrome (desktop or Android) asks which device.
2. Choose the printer; name it; pick *Bills* or *Kitchen*.
3. **Test print.** ✅ A slip with the property name.
   Only Chrome and Edge support Web Bluetooth/USB; Safari does not.

**B. LAN printers (the printer has an Ethernet port or wi-fi)**
1. Give the printer a fixed IP on your router (e.g. `192.168.1.50`). Port is always **9100**.
2. On any always-on PC in the building, run the **print bridge**: launcher **option 8**, or
   double-click `Print-Bridge.bat`. It listens on `http://localhost:9110` — leave the window open.
3. Settings → Printers → **+ Network printer** → address `192.168.1.50:9100`, bridge
   `http://<that PC's IP>:9110`.
4. **Test print.**

**If nothing prints.** Ping the printer's IP from the bridge PC. Power-cycle the printer. Check the
bridge window for the error line. `PRINT_BRIDGE_PORT` changes 9110 if something else uses it.

---

## 11 · WhatsApp

Nothing to connect. **Share bill** and **Send to supplier** open `wa.me` with the text pre-filled, on
the phone or WhatsApp Web. There is no WhatsApp Business API here — it costs per message and needs
Meta approval; the share sheet is free and works today.

---

## 12 · The Box — running the building without internet (optional)

**What it is.** A full copy of the database on a PC in the building. Phones and the counter talk to
it over wi-fi whether or not the internet is up; when it is, the Box and the cloud keep each other in
step. The storefront outside keeps taking bookings from the cloud.

**You need.** An always-on PC (any 8 GB machine), **Docker Desktop** installed, and the cloud project
from sections 1–4 already running.

1. Launcher **option 9**. It asks:
   - the PC's LAN IP (e.g. `192.168.1.20`) — fix it on the router,
   - a database password and a JWT secret (it can generate both),
   - your cloud URL and a **Box sync token** — create it as the property's owner under
     **Settings → Property → Issue Box token** (it is that property's own credential, so the
     master does not hold it).
   It writes `.env` at the repo root with `BOX_LAN_IP`, `BOX_DB_PASSWORD`, `BOX_JWT_SECRET`,
   `CLOUD_URL`, `BOX_SYNC_TOKEN`, then `docker compose -f docker-compose.box.yml up -d`.
2. It prints the address for the building: `http://192.168.1.20:3000`. Open it on every phone and the
   counter and sign in as usual.
3. On each phone app, set `EXPO_PUBLIC_SUPABASE_URL=http://192.168.1.20:8000` — the Box's own API.

**Prove it.** Turn the internet router off. Take an order on a phone → it appears on the kitchen
screen. Turn it back on. Master control (cloud) → the property row shows *Box: last seen just now*
and today's sales.

**Behind it.** `docker-compose.box.yml` runs Postgres, GoTrue (sign-in), PostgREST and Realtime — the
same four pieces Supabase is made of — plus `scripts/box-agent.mjs`, which pushes and pulls every
`SYNC_SECONDS` (default **60**) through `/api/box/push`, `/api/box/pull`, `/api/box/sync` and pings
`/api/box/ping`. Backups run nightly at `BACKUP_HOUR` (default **2**, i.e. 02:00) and **option 10**
restores one.

---

## 13 · Hosting — a public address

Everything above works on `localhost`. Sections 7, 8, 9 and the storefront need an address the world
can reach.

**Vercel (option 3).**
1. Free account at vercel.com; the launcher installs the CLI and deploys.
2. In the Vercel project → **Settings → Environment Variables** add every line from
   `apps/web/.env.local` (the launcher offers to push them).
3. Copy the address Vercel gives you (`dineflow-xyz.vercel.app`, or your own domain).
4. Set it in three places: `NEXT_PUBLIC_APP_URL` (Vercel env), **Supabase → Authentication → URL
   configuration → Site URL and Redirect URLs**, and `EXPO_PUBLIC_WEB_URL` in the phone app.

**Your own server (option 4).** Docker on any VPS. The launcher builds the image and writes a
compose file; put Caddy or Nginx in front for HTTPS. Same three addresses to set.

**Prove it.** Open the public address on a phone on mobile data → the sign-in page. Sign in → the
control room. Open `/dine` → your listed property.

---

## 14 · Phone app builds — EAS (optional)

Expo Go is for development. For staff phones you want an installable app.

1. Free account at expo.dev. Launcher **option 5** → `1` for an **Android APK**.
2. First time it asks you to log in (`eas login`) and to accept a generated signing key. Say yes.
3. It builds in Expo's cloud (5–10 minutes) and prints a download link. Share the APK on WhatsApp;
   staff tap it to install (Android asks once to allow installs from this source).

`.env` from section 2 is baked in at build time, so set `EXPO_PUBLIC_WEB_URL` to the **public**
address (section 13) before building. Play Store (`2`) and iOS (`3`) use the same path with a store
account.

---

## The order to do it in, and a checklist

```
[ ] 1  Supabase project · URL + anon key in apps/web/.env.local       → sign-in page loads
[ ] 3  DATABASE_URL · option 7 runs 19 migrations                     → tables in Supabase
[ ] 5  Realtime · nothing to do                                       → kitchen updates live
[ ] 2  apps/mobile/.env · option 2                                    → phone signs in
[ ] 6  ANTHROPIC_API_KEY (optional)                                   → Assist answers in words
[ ] 13 Public address · Vercel or Docker · set in 3 places            → works on mobile data
[ ] 4  SUPABASE_SERVICE_ROLE_KEY                                      → webhooks answer 200
[ ] 7  Aggregator channel · webhook URL to UrbanPiper                 → test curl lands an order
[ ] 8  OTA iCal · export to them, import from them                    → Sync now shows blocks
[ ] 9  CRON_SECRET · scheduled fetch                                    → /api/ota/sync returns JSON
[ ] 10 Printers · pair or bridge                                      → Test print
[ ] 14 EAS · Android APK                                              → installs on a staff phone
[ ] 12 Box (only if internet is unreliable)                           → works with router off
```

## Where each secret must never go

| Secret | Server only | Browser | Phone app | Git |
|---|---|---|---|---|
| Anon key | ✓ | ✓ (by design) | ✓ (by design) | ✗ |
| `DATABASE_URL` | ✓ | ✗ | ✗ | ✗ |
| `SUPABASE_SERVICE_ROLE_KEY` | ✓ | ✗ | ✗ | ✗ |
| `ANTHROPIC_API_KEY` | ✓ | ✗ | ✗ | ✗ |
| `CRON_SECRET` | ✓ | ✗ | ✗ | ✗ |
| Channel / iCal / Box tokens | in the database | shown to you once | ✗ | ✗ |

If any of the private ones ever appears in a chat, a screenshot or a commit, rotate it: Supabase →
Project Settings → API → *Reset*; Anthropic console → delete the key; Channels → delete and re-add
the channel.

---

*Not covered because it is not built: Razorpay or any payment gateway (bills are settled by cash,
UPI QR, card machine or room folio); direct Swiggy/Zomato partner APIs; real-time OTA APIs; the
WhatsApp Business API. Each is a deliberate omission noted in SETUP-GUIDE.md, and each has a working
substitute above.*
