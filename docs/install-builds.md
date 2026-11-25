# The app files — Android `.apk` and Windows `.exe`

Every install screen (the top bar's download button → sheet, `/get`, Settings → Install on this device, the
sign-in page) offers both as one-click downloads (`components/shell/DownloadFiles.tsx`). Which files exist is
`/api/download` → `availableDownloads()` in `apps/web/lib/installers.ts`:

0. **the file uploaded on Master control → App files** wins (0128, 2026-10-20): the current `app_releases` row
   for the platform, served from the public Storage bucket `app-files`; read as anyone and kept 60 s, so an
   upload is offered within a minute;
1. else a **hosted release** when its address is set — `NEXT_PUBLIC_APK_URL` (or the older
   `NEXT_PUBLIC_DOWNLOAD_ANDROID`) and `NEXT_PUBLIC_EXE_URL` (or `NEXT_PUBLIC_DOWNLOAD_WINDOWS`); optional
   `NEXT_PUBLIC_APK_VERSION` / `NEXT_PUBLIC_EXE_VERSION` show beside the button;
2. otherwise the file **this machine built**, served from disk by `/api/download/android|windows`;
3. otherwise the slot shows greyed, "Coming soon — the build is being prepared".

## Updating a file — two steps, no deploy

1. **Build** the new file (the sections below), with a version number higher than the last one.
2. **Upload** it: Master control → **App files** → drop the `.apk` or `.exe` on its card → check the version (read
   from the file name when it has one) → **Upload**. The browser sends it straight to Supabase Storage with your
   Master control session (a Vercel function would refuse a 78 MB body), then `app_release_publish` makes it the
   one handed out. Every install screen offers it within a minute. **Make current** on an earlier upload rolls
   back.

**The 50 MB limit.** Supabase caps every upload at 50 MB, and on the **Free plan that cannot be raised**; the Windows
installer is ~78 MB. So the Windows file lives on **Cloudflare R2** and its link is pasted on App files (next section,
0129). The Android file (under 1 MB) uploads straight on App files. On a paid Supabase plan you could instead raise
Storage → Settings → Upload file size limit to 100 MB and upload the .exe too.

## Hosting the Windows file on Cloudflare R2 (free) — step by step

Cloudflare R2 keeps 10 GB free and never charges for downloads, so one 78 MB installer costs nothing.

1. **Make an account.** Go to **dash.cloudflare.com** → **Sign up** (email and password, then confirm the email).
2. **Turn on R2.** In the left menu click **R2 Object Storage** (it may sit under "Storage & Databases"). Cloudflare
   may ask you to add a card to switch R2 on — the free 10 GB is not charged.
3. **Create a bucket.** **Create bucket** → name it `dineflow-apps` → location **Automatic** → **Create bucket**.
4. **Make it public.** Open the bucket → **Settings** → **Public access** → **R2.dev subdomain** → **Allow Access** →
   type `allow` → **Allow**. Note the address it shows, like `https://pub-1a2b3c….r2.dev`.
   (Later you can use **Custom Domains → Connect Domain** with e.g. `downloads.dineflow.cloud` instead.)
5. **Upload the file.** Bucket → **Objects** → **Upload** → choose `DineFlow-Setup-1.1.0.exe` (in `D:\DineFlow app files`)
   → wait for it to finish.
6. **Copy its link.** Click the file in the list; copy its **Public URL** — it looks like
   `https://pub-1a2b3c….r2.dev/DineFlow-Setup-1.1.0.exe`. (Or build it: the r2.dev address + `/` + the file name.)
7. **Paste it in DineFlow.** www.dineflow.cloud → Master control → **App files** → Windows card →
   **or paste a download link** → paste the link → the version fills in from the name (check it) → Size in MB (optional,
   `78`) → **Publish link**. Every install screen offers it within a minute.

**Next time** a new Windows build comes out: upload the new `.exe` to the same bucket (steps 5–6) and paste its link
(step 7). **Make current** on App files rolls back to an earlier link or upload.

The env addresses (`NEXT_PUBLIC_APK_URL`, `NEXT_PUBLIC_EXE_URL`) still work, for a file hosted elsewhere, and are
used only when nothing is uploaded. Never put the files in `apps/web/public/` — an 80 MB installer would ride
along with every deployment.

## Windows — `apps/desktop` (Electron + electron-builder NSIS)

```bash
# a normal terminal (VS Code's exports ELECTRON_RUN_AS_NODE=1 — unset it: env -u ELECTRON_RUN_AS_NODE …)
cd apps/desktop
DINEFLOW_APP_URL="https://dineflow.cloud" npx electron-builder --win --publish never
```

Out comes `apps/desktop/dist/DineFlow-Setup-<version>.exe` (~78 MB): one click installs it per user (no
administrator), puts DineFlow on the Start menu and the desktop, and opens it. Bump `version` in
`apps/desktop/package.json` for each release. **Unsigned**: Windows SmartScreen asks once per machine (More
info → Run anyway). A certificate does not remove that at once any more — **the Microsoft Store does** (next section).
More in `apps/desktop/README.md`.

## The Microsoft Store — Windows installs with no warning (2026-11-26)

The owner: *"'Windows protected your PC' must not show; it must install straight away, with no block."* SmartScreen
warns about any installer not signed by a publisher it already trusts. Checked 2026-11-26: Microsoft's own signing
service (Azure Artifact Signing) is **not offered in India** (individuals: US/Canada only; organisations: a list without
India), and since 2024 **an EV certificate no longer skips the warning** — OV and EV both start with it and lose it only
as installs build reputation. A package on the **Microsoft Store** is re-signed by Microsoft: the Store installs it with
one click, no SmartScreen, and keeps it updated. Registration is free (individuals since September 2025, companies since
May 2026).

1. **Register** at **storedeveloper.microsoft.com** (Partner Center) → *Get started for free* → *Individual developer*
   (or *Company*). Sign in with a Microsoft account; identity check by ID.
2. **Reserve the name** *DineFlow*: Apps and games → New product → *MSIX or PWA app*.
3. **Copy the three identity values**: the app → Product management → *Product identity* — Package/Identity/Name,
   Package/Identity/Publisher (`CN=…`), Package/Properties/PublisherDisplayName.
4. **Build** (Windows, in `apps/desktop`):
   ```
   set MSSTORE_IDENTITY_NAME=…& set MSSTORE_PUBLISHER=CN=…& set MSSTORE_PUBLISHER_NAME=…
   set DINEFLOW_APP_URL=https://dineflow.cloud
   npm run dist:store
   ```
   → `dist/DineFlow-<version>.appx` (~119 MB, unsigned — "Windows Store only build"; the Store signs it).
   `MSSTORE_TEST=1 npm run dist:store` builds with stand-in values to check the machine (that file cannot be uploaded).
5. **Submit**: Pricing *Free*, Markets *India* (and more), Properties *Business*, Age rating, Store listing (description,
   at least one screenshot 1366×768 or larger), Packages ← the .appx. Certification takes ~1–3 working days. The app
   asks for `runFullTrust` (a desktop app) — say so in *Submission options → Restricted capabilities*: "Electron desktop
   app; full trust is needed to run its own window."
6. **Point the install screens at it**: Vercel → `NEXT_PUBLIC_MSSTORE_ID` = the 12-character Store ID (Product
   management → Product identity, or the end of its apps.microsoft.com address) → redeploy. A Windows PC then gets
   **Get it from Microsoft Store** (`ms-windows-store://pdp/?ProductId=…&mode=mini` — the Store app's small install
   window) instead of the .exe; other devices' Windows row links to the Store page. Unset, the .exe stays.

Each release: bump `version` in `apps/desktop/package.json`, `npm run dist:store`, Partner Center → *Update* → upload.
The tile images (`build/appx/`) were made from `build/icon.png`.


## Android — `apps/android-app` (Trusted Web Activity)

Needs a JDK (17+) and the Android SDK (platform 35, build-tools). On this machine: JDK 23, the SDK at
`%LOCALAPPDATA%\Android\Sdk`. `apps/android-app/local.properties` (not committed) says where the SDK is:
`sdk.dir=C:/Users/<you>/AppData/Local/Android/Sdk` — forward slashes (backslashes are escapes there).

```bash
cd apps/android-app
DINEFLOW_KEYSTORE="<path>/dineflow-android.jks" DINEFLOW_KEYSTORE_PASSWORD="<password>" ./gradlew assembleRelease
# → app/build/outputs/apk/release/app-release.apk (~600 KB), signed with the release key
```

- **The release key is kept outside the repository** (`dineflow-android.jks`, alias `dineflow`). Every update
  must be signed with the same key or Android refuses to install it over the old one — keep the file and its
  password safe and backed up. Without the two variables the build is signed with the debug key: fine to try,
  never to hand out.
- **`apps/web/public/.well-known/assetlinks.json`** holds that key's SHA-256. A new key means a new fingerprint
  there (`keytool -list -v -keystore dineflow-android.jks -alias dineflow`), or Chrome shows its address bar.
- Bump `versionCode` (+1) and `versionName` in `app/build.gradle` for each release.
- Installing from a file: the phone asks once to allow the browser to install apps (Android's "unknown
  sources"); then Install. Play Store publishing would want an `.aab` (`./gradlew bundleRelease`) and a
  developer account — not needed for the one-click file.

Checked 2026-10-20: `apksigner verify` → v2 signature by `CN=DineFlow`; installed on an API 36 emulator, it
opened Chrome's Trusted Web Activity on dineflow.cloud's sign-in page. The `.exe` (1.1.0) opened a window
titled "Sign in · DineFlow".

## 2026-10-23 — the app opened with Chrome's address bar: it now trusts www

The Android app pointed at **https://dineflow.cloud**. That name answers every request with a 308 to www — including
`/.well-known/assetlinks.json` — and Android checks the link **without following redirects**, so the app was never verified
and Chrome showed it as a tab with the address bar ("dineflow.cloud", ✕, share). `strings.xml` (launchUrl,
asset_statements) and the manifest's intent filter now say **www.dineflow.cloud**, where assetlinks.json is served directly
(`curl https://www.dineflow.cloud/.well-known/assetlinks.json` → 200, package `cloud.dineflow.app`). Version **1.0.1**
(versionCode 2). Build it signed with the release key (it must be the key whose SHA-256 is in assetlinks.json), then upload
the new file in Master control → App files:

```bash
cd apps/android-app
DINEFLOW_KEYSTORE="D:/dine flow/v-4/release-keys/dineflow-android.jks" DINEFLOW_KEYSTORE_PASSWORD="<password>" ./gradlew assembleRelease
```

**"File might be harmful" and Play Protect's scan** are Android's own, for every app installed from a file rather than the
Play Store — no file or server setting removes them. The two ways without them: publish the same app on Google Play (an
`.aab`, `./gradlew bundleRelease`, and a developer account), or install from Chrome's own menu (Install app), which Chrome
packages and verifies itself.
