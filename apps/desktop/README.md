# DineFlow for Windows

A window around the app that is already deployed. It holds no copy of DineFlow — it opens your
address in a Chromium window with no browser chrome, so staff never reinstall anything to get a
change. You deploy; they reopen.

Offline is not solved here. The web app already handles it: the service worker keeps the screens and
the outbox keeps the writes until the line comes back.

## Build the installer

On a Windows machine:

```bash
pnpm install
DINEFLOW_APP_URL="https://your-address" pnpm --filter @dineflow/desktop dist
```

Out comes `apps/desktop/dist/DineFlow-Setup-<version>.exe`, about 79 MB. Per-user install, so it
needs no administrator. `dist:dir` skips the installer and just produces a runnable folder, which is
quicker while you are changing something.

To try it without packaging: `pnpm --filter @dineflow/desktop start`.

> Running it from a terminal inside VS Code fails with `Cannot read properties of undefined (reading
> 'requestSingleInstanceLock')`. That is not this app — VS Code is itself Electron and exports
> `ELECTRON_RUN_AS_NODE=1` into its terminals, which makes any Electron binary behave as plain Node.
> Use a normal terminal, or `env -u ELECTRON_RUN_AS_NODE pnpm --filter @dineflow/desktop start`.
> Packaged builds are unaffected: the `runAsNode` fuse is off in them.

## Which address it opens

Checked in this order, first one wins:

1. `DINEFLOW_APP_URL` in the environment — one machine, or a test.
2. **`dineflow-url.txt` beside `DineFlow.exe`** — a line of text with the address. This is how one
   installer serves a property that later moves to its own domain: no rebuild, no new installer.
3. Whatever `DINEFLOW_APP_URL` was set to at build time.

Point it at a **stable** address. A Vercel deployment URL like
`dineflow-4vwrb28u3-devkodz01.vercel.app` is pinned to one deployment and will never see another
release — use the production alias or your own domain.

## It is not signed

Windows shows *"Windows protected your PC"* on first run of every machine: **More info → Run
anyway**, once. That is expected for an unsigned installer and is not a warning about this file in
particular.

To remove it, buy an OV code-signing certificate and give electron-builder `CSC_LINK` and
`CSC_KEY_PASSWORD`; nothing else in the build has to change.

## What it adds over the browser

The camera (Scan) and microphone (Assist) are granted to the app's own origin only — Electron denies
every permission by default and gives no prompt, so without that those screens would fail silently
in a way they never do in a browser.

Links to anywhere else — a payment gateway, a help page — open in the real browser, where the person
can see the address they are being sent to.

If the address cannot be reached, it says so on a local page with a Try again button, rather than
showing the blank window that is the usual answer to a dropped connection.
