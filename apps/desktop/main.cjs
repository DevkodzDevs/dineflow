/**
 * DineFlow for Windows — a window around the app that is already running somewhere.
 *
 * It holds no copy of the app. It opens the deployed address in a Chromium window with no browser
 * chrome around it, which means staff never reinstall anything to get a change: you deploy, they
 * reopen. Offline is already handled inside the app itself — the service worker keeps the screens
 * and the outbox keeps the writes — so this shell does not need to solve it twice.
 *
 * Which address it opens is decided at build time (DINEFLOW_APP_URL) and can be overridden on the
 * machine itself, because a property moving to its own domain should not need a new installer.
 */
const { app, BrowserWindow, shell, Menu, dialog } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

// Baked in at build time. The file beside it wins, so one installer serves every property.
// The deployment the phone app already points at (apps/mobile/eas.json). It answers, so a copy
// built with no address set still opens something real — but it is a Vercel *deployment* URL, pinned
// to one release, so set DINEFLOW_APP_URL to the production alias or your own domain before you hand
// this installer to anyone.
const BUILT_URL = process.env.DINEFLOW_APP_URL || "https://dineflow-4vwrb28u3-devkodz01-6921.vercel.app";

/**
 * Where a property points this copy. Checked in order:
 *   1. DINEFLOW_APP_URL in the environment  — for a single machine or a test
 *   2. dineflow-url.txt beside the .exe     — for an IT person setting up a floor of tills
 *   3. whatever was compiled in
 */
function appUrl() {
  const fromEnv = process.env.DINEFLOW_APP_URL;
  if (fromEnv) return fromEnv.trim();
  try {
    const beside = path.join(path.dirname(app.getPath("exe")), "dineflow-url.txt");
    if (fs.existsSync(beside)) {
      const t = fs.readFileSync(beside, "utf8").trim();
      if (t) return t;
    }
  } catch { /* unreadable or locked down — fall through to the built-in */ }
  return BUILT_URL;
}

const URL_TO_OPEN = appUrl();
const origin = (() => { try { return new URL(URL_TO_OPEN).origin; } catch { return null; } })();

/** Only one copy at a time: a second launch focuses the window that is already open. */
if (!app.requestSingleInstanceLock()) app.quit();

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 960, minHeight: 600,
    backgroundColor: "#0a0a0d",            // the app's own graphite, so the frame never flashes white
    show: false,
    autoHideMenuBar: true,                 // the menu is still reachable with Alt, just not in the way
    icon: path.join(__dirname, "build", "icon.png"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  win.once("ready-to-show", () => win.show());

  /**
   * The Scan screen wants the camera and Assist wants the microphone. Electron denies every
   * permission by default and gives no prompt, so without this those screens fail silently on a
   * desktop in a way they never do in a browser. Granted only to the app's own origin.
   */
  win.webContents.session.setPermissionRequestHandler((wc, permission, callback) => {
    const from = (() => { try { return new URL(wc.getURL()).origin; } catch { return null; } })();
    const ours = origin !== null && from === origin;
    callback(ours && ["media", "clipboard-sanitized-write", "fullscreen", "notifications"].includes(permission));
  });

  // Anything that is not the app — a payment gateway, a help link — belongs in the real browser,
  // where the person can see the address they are being taken to.
  const external = (url) => {
    try { if (new URL(url).origin !== origin) { void shell.openExternal(url); return true; } } catch { /* not a url we can judge */ }
    return false;
  };
  win.webContents.setWindowOpenHandler(({ url }) => (external(url) ? { action: "deny" } : { action: "allow" }));
  win.webContents.on("will-navigate", (e, url) => { if (external(url)) e.preventDefault(); });

  // A blank window is the worst possible answer to "the wifi is down". Say what happened.
  win.webContents.on("did-fail-load", (_e, code, description, failedUrl, isMainFrame) => {
    if (!isMainFrame || code === -3) return;   // -3 is an aborted navigation, not a failure
    void win.loadFile(path.join(__dirname, "unreachable.html"), {
      query: { url: failedUrl || URL_TO_OPEN, reason: description || String(code) },
    });
  });

  void win.loadURL(URL_TO_OPEN);
}

/** Enough of a menu to get out of trouble, and nothing a waiter can break the till with. */
function buildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: "DineFlow",
      submenu: [
        { label: "Reload", accelerator: "CmdOrCtrl+R", click: () => win?.loadURL(URL_TO_OPEN) },
        { label: "Full screen", accelerator: "F11", role: "togglefullscreen" },
        { type: "separator" },
        { label: "Print", accelerator: "CmdOrCtrl+P", click: () => win?.webContents.print() },
        { type: "separator" },
        {
          label: "Which address is this?",
          click: () => dialog.showMessageBox(win, {
            type: "info", title: "DineFlow",
            message: URL_TO_OPEN,
            detail: "To point this machine somewhere else, put the address in a file called dineflow-url.txt beside DineFlow.exe and reopen it.",
          }),
        },
        { label: "Developer tools", accelerator: "CmdOrCtrl+Shift+I", click: () => win?.webContents.toggleDevTools() },
        { type: "separator" },
        { label: "Quit", accelerator: "CmdOrCtrl+Q", role: "quit" },
      ],
    },
    { label: "Edit", submenu: [{ role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }] },
  ]));
}

app.whenReady().then(() => {
  buildMenu();
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
