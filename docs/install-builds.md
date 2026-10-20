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
info → Run anyway); an OV/EV code-signing certificate given to electron-builder as `CSC_LINK` /
`CSC_KEY_PASSWORD` removes that. More in `apps/desktop/README.md`.

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
