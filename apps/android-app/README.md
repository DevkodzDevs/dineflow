# DineFlow for Android (.apk)

A **Trusted Web Activity**: Chrome, full screen, opening `https://dineflow.cloud/dashboard` — the whole
web app, nothing copied into the APK (it is ~600 KB). Like the Windows app (`apps/desktop`), you deploy
and every phone has the change the next time it opens; nobody reinstalls.

- Package id `cloud.dineflow.app` (the Expo app in `apps/mobile` is `in.dineflow.app` — a different,
  smaller native app; the two never collide).
- Chrome hides its address bar only when the site vouches for the app:
  `apps/web/public/.well-known/assetlinks.json` carries the release key's SHA-256. Until that file is live
  on dineflow.cloud the app still works, with a thin address bar on top.
- A phone without Chrome (or another browser that can host it) opens DineFlow in a WebView instead
  (`FALLBACK_STRATEGY = webview`).

How to rebuild, sign and hand it out: [docs/install-builds.md](../../docs/install-builds.md).

> This folder is `android-app`, not `android`: the root `.gitignore` ignores every `android/` directory
> (Expo's prebuild output), which would have hidden this project from Git.
