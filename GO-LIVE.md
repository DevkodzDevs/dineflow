# Going live

From the test deployment you have now, to an address you can hand to a restaurant.

Written for whoever runs DineFlow — not only the person who wrote it. Every step says what it is
for, so it can be skipped on purpose rather than by accident.

---

## The short version

Installing happens **through the browser**. There is no file to download, nothing to allow, no store
to wait for, and an installed app follows the website the moment you deploy. One click on Windows,
Mac and Android; three taps on an iPhone, because Apple allows no fewer.

Everything below exists to make that one click possible.

---

## 1. Make the site publicly reachable  — *required, nothing works without it*

A browser will only install a site served over **public HTTPS**. Today the deployment sits behind
Vercel's Deployment Protection on a preview address, so nobody outside your account can open it —
which means nobody can install it either.

- Vercel → your project → **Settings → Deployment Protection → Disabled** for Production.
- Vercel → **Settings → Domains** → add the address you want, e.g. `app.dineflow.in`, and point the
  DNS record it shows you at Vercel.

Check it worked by opening the address on a phone that is **not** signed in to your Vercel account.
If it asks you to log in to Vercel, protection is still on.

## 2. Tell the apps where "live" is  — *one command*

```bash
node scripts/set-app-url.mjs https://app.dineflow.in
```

The website works its own address out from each request, so it never needs this. The desktop and
phone apps do: the address is compiled into them, and they are running on somebody else's counter
long after you forgot which URL they were built with.

Only rebuild what you actually hand out — and if you install through the browser, nothing at all.

## 3. Check the region is right  — *already done, verify after any change*

`vercel.json` pins the server to **`bom1` (Mumbai)**, next to the database. Without it Vercel runs in
Washington DC and every page makes its database round trips across the world — about 200 ms each,
twice per page, before a single row is read.

## 4. Protect the data  — *do this before a single paying customer*

Supabase → your project → **Settings → Add-ons**, move off the free plan.

The free tier takes **no daily backups, offers no point-in-time recovery, and pauses the project
after a period of inactivity**. This database holds other people's takings and hotel folios. Roughly
$25/month.

## 5. Watch for failures  — *recommended*

Nothing currently reports an error to you. When a till fails at 9 pm in somebody else's restaurant,
you find out when they telephone. Sentry's free tier is enough.

---

## Handing the app to someone

Send them **`https://app.dineflow.in/get`**. The page works out what they are holding and gives them
the right thing to do, including when it cannot be done:

| They are on | What happens |
| --- | --- |
| Chrome or Edge — Windows, Mac, Android | **One click.** No download, no warning. |
| iPhone or iPad, in Safari | Share → Add to Home Screen. Three taps; Apple allows no fewer. |
| iPhone, but in Chrome or Gmail | Told to open it in Safari, with the address ready to copy. |
| A link opened inside WhatsApp or Instagram | Told that window cannot install, with the address ready to copy. |
| Firefox, or a browser with no install | Shown where that browser hides the option. |

There is a QR code on the page, so a phone can be pointed at a desktop screen.

---

## The packaged installers — optional, and not the easy path

The browser install is better on every platform. These exist for a machine that cannot use it.

**Windows `.exe`** — built with `pnpm --filter @dineflow/desktop dist`. It is **not code-signed**, so
Windows shows *"Windows protected your PC"* and the person must choose *More info → Run anyway*. A
signing certificate (~$200–400/year) removes that. The `/get` page now says this plainly rather than
letting them discover it and assume the file is unsafe.

**Android `.apk`** — built with `eas build --profile preview --platform android`. Installing it means
allowing "install from unknown sources", which is *more* friction than the browser install, not less.

If you publish either, upload it to a **GitHub Release** (free, unmetered) and set the address in
your Vercel environment variables:

```
NEXT_PUBLIC_DOWNLOAD_WINDOWS=https://github.com/<you>/<repo>/releases/download/v1.0.0/DineFlow-Setup-1.0.0.exe
NEXT_PUBLIC_DOWNLOAD_ANDROID=https://github.com/<you>/<repo>/releases/download/v1.0.0/dineflow.apk
```

Never commit the installer to the repository. A 79 MB file in a deployment is what caused the
`File size limit exceeded (100 MB)` failure.

**iPhone, properly** — the App Store is the only way to get a one-tap install on iOS: an Apple
Developer account ($99/year), a review for every release, and about a week to set up the first time.
The Safari route above costs nothing and works today.

---

## Before you deploy

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

CI runs the same four on every push.

## Releasing a database change

```bash
node scripts/migrate.mjs      # applies anything in supabase/migrations not yet recorded
```

Migrations are tracked in `_dineflow_migrations` and applied once, in order. Always run a migration
against a copy first — there is no undo.
