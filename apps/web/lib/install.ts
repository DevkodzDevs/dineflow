/**
 * What is in the person's hand, and the shortest way to install DineFlow on it.
 *
 * Pure functions of the user agent (plus the touch points an iPad gives away), so every branch is a
 * unit test rather than a guess — install.test.ts. Every install screen asks `installPlan()` and draws
 * what it says: /get, the in-app sheet, Settings and the sign-in page. They used to carry three copies of
 * this that disagreed — one still said only Safari can add to an iPhone's Home Screen, which stopped being
 * true with iOS 16.4.
 *
 * One tap is the browser's own install (Chrome, Edge, Samsung Internet: `beforeinstallprompt`, caught in
 * <head> as window.__dfInstall). Where the browser cannot install, the plan is one tap to a browser that
 * can — Edge on Windows (it comes with Windows), Chrome on Android — instead of a paragraph of advice.
 * Apple gives a web page no install button at all: an iPhone, an iPad and Safari on a Mac add the app
 * from the browser's own menu, so those get the exact taps, drawn.
 */

export type Device = "iphone" | "ipad" | "android" | "windows" | "mac" | "chromeos" | "linux" | "other";
export type Browser = "safari" | "chrome" | "edge" | "samsung" | "firefox" | "opera" | "inapp" | "other";
export type Env = {
  device: Device;
  browser: Browser;
  /** iOS / iPadOS major.minor ×100 (16.4 → 1604); 0 when not known */
  ios: number;
  /** Safari's own major version; 0 when not Safari */
  safari: number;
};

export type Plan =
  | "installed"        // running as the app now
  | "installed-here"   // installed from this browser before — open it from its icon
  | "prompt"           // the browser's one-tap install is ready
  | "ios"              // Share → Add to Home Screen → Add, drawn step by step
  | "ios-safari-only"  // an older iPhone (before 16.4) in another browser: only Safari can add it
  | "inapp"            // inside Instagram / Facebook / WhatsApp on an iPhone: open it in Safari
  | "mac-safari"       // File → Add to Dock
  | "mac-old-safari"   // Safari 16 or older cannot add apps
  | "menu"             // Chrome / Edge / Samsung Internet before it offers the one-tap button: its menu
  | "firefox-android"  // Firefox on Android installs from its own menu
  | "open-in-edge"     // Windows in a browser that cannot install: one tap to Edge
  | "open-in-chrome"   // Android in a browser (or an app's window) that cannot install: one tap to Chrome
  | "other-desktop"    // Firefox on a Mac or Linux: open it in Chrome / Edge (or Safari on a Mac)
  | "other";           // nothing recognised: the short list for every browser

/** A Facebook / Instagram / WhatsApp / LinkedIn… window inside its app, or an Android WebView (`; wv)`). */
const IN_APP = /FBAN|FBAV|FB_IAB|FBIOS|Instagram|WhatsApp|Line\/|LinkedInApp|Snapchat|Twitter|MicroMessenger|; wv\)/i;

export function detect(ua: string, touchPoints = 0): Env {
  const device: Device = /iPhone|iPod/i.test(ua) ? "iphone"
    // iPadOS asks for the desktop site and reports itself as a Mac; its touch points give it away
    : /iPad/i.test(ua) || (/Macintosh/i.test(ua) && touchPoints > 1) ? "ipad"
    : /Android/i.test(ua) ? "android"
    : /CrOS/i.test(ua) ? "chromeos"
    : /Windows/i.test(ua) ? "windows"
    : /Macintosh|Mac OS X/i.test(ua) ? "mac"
    : /Linux|X11/i.test(ua) ? "linux" : "other";
  const browser: Browser = IN_APP.test(ua) ? "inapp"
    : /EdgiOS|EdgA\/|Edg\//i.test(ua) ? "edge"
    : /SamsungBrowser/i.test(ua) ? "samsung"
    : /OPR\/|OPiOS|OPT\/|Opera/i.test(ua) ? "opera"
    // Chromium browsers that cannot install a web app, or that hide where it is
    : /UCBrowser|UCWEB|YaBrowser|MiuiBrowser|XiaoMi|HeyTapBrowser|Puffin|Silk\//i.test(ua) ? "other"
    : /FxiOS|Firefox\//i.test(ua) ? "firefox"
    : /CriOS|Chrome\/|Chromium\//i.test(ua) ? "chrome"
    : /Safari\//i.test(ua) && /Version\//i.test(ua) ? "safari" : "other";
  const os = ua.match(/(?:iPhone|CPU) OS (\d+)[._](\d+)/i);
  const ver = ua.match(/Version\/(\d+)(?:\.(\d+))?/i);
  // an iPad in desktop mode reports macOS 10.15 in every version; Safari's own version is the iPadOS one
  const ios = os ? Number(os[1]) * 100 + Number(os[2]) : device === "ipad" && ver ? Number(ver[1]) * 100 + Number(ver[2] ?? 0) : 0;
  const safari = browser === "safari" && ver ? Number(ver[1]) : 0;
  return { device, browser, ios, safari };
}

export type InstallState = { canPrompt: boolean; standalone: boolean; here: boolean };

export function installPlan(env: Env, s: InstallState): Plan {
  if (s.standalone) return "installed";
  if (s.canPrompt) return "prompt";           // the browser has offered it: nothing beats one tap
  if (s.here) return "installed-here";
  return stepsPlan(env);
}

/** What to show when the browser has not offered its one-tap install (or it is already installed and
 *  the person asks to do it again). */
export function stepsPlan({ device, browser, ios, safari }: Env): Plan {
  if (device === "iphone" || device === "ipad") {
    if (browser === "inapp") return "inapp";
    // Chrome, Edge and Firefox on an iPhone can add to the Home Screen from iOS 16.4
    if (browser !== "safari" && ios > 0 && ios < 1604) return "ios-safari-only";
    return "ios";
  }
  if (device === "android") {
    if (browser === "chrome" || browser === "edge" || browser === "samsung") return "menu";
    if (browser === "firefox") return "firefox-android";
    return "open-in-chrome";                  // an app's window, UC, Mi, Opera Mini…
  }
  if (device === "mac" && browser === "safari") return safari > 0 && safari < 17 ? "mac-old-safari" : "mac-safari";
  if (device === "windows" || device === "mac" || device === "linux" || device === "chromeos") {
    if (browser === "chrome" || browser === "edge") return "menu";
    if (device === "windows") return "open-in-edge";   // Edge comes with every Windows 10 and 11 PC
    return "other-desktop";
  }
  return "other";
}

/** "this iPhone" — what the screens call the device in hand. */
export function deviceName(d: Device): string {
  return { iphone: "iPhone", ipad: "iPad", android: "phone", windows: "PC", mac: "Mac", chromeos: "Chromebook", linux: "computer", other: "device" }[d];
}

/** Where the installed app's icon lands. */
export function iconHome(d: Device): string {
  return d === "iphone" || d === "ipad" ? "Home Screen"
    : d === "android" ? "home screen and app drawer"
    : d === "windows" ? "Start menu and taskbar"
    : d === "mac" ? "Dock and Launchpad"
    : d === "chromeos" ? "launcher and shelf"
    : "app list";
}

export function browserName(b: Browser): string {
  return { safari: "Safari", chrome: "Chrome", edge: "Edge", samsung: "Samsung Internet", firefox: "Firefox", opera: "Opera", inapp: "this app", other: "this browser" }[b];
}

/** One tap from any Windows browser to Edge, which can install. Firefox asks once whether to open it. */
export function edgeHref(url: string): string {
  return `microsoft-edge:${url}`;
}

/** One tap from an Android browser — or an app's own window — to Chrome. If Chrome is missing, Android
 *  opens the same address in the default browser (`browser_fallback_url`). */
export function chromeHref(url: string): string {
  try {
    const u = new URL(url);
    return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=${u.protocol.replace(":", "")};package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url)};end`;
  } catch { return url; }
}

/** WhatsApp with the message typed and no number: the person picks who gets it. */
export function waShareHref(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** Set by the <head> catcher below when the app is installed or opened as the app; cleared when the
 *  browser offers to install again — which it only does when it is not installed. */
export const INSTALLED_FLAG = "df-app";

/**
 * Runs in <head> (root layout), before anything else has a chance to miss it.
 *
 * Chrome fires `beforeinstallprompt` within milliseconds of the page loading — long before React has
 * mounted a button — and the event is only usable if it was caught and held. So it is parked on the
 * window as __dfInstall and announced (`df-installable`); useInstall picks it up whenever it mounts.
 * It also remembers that the app is installed (INSTALLED_FLAG), so a browser tab can say "installed —
 * open it from the Start menu" instead of steps that no longer lead anywhere.
 */
export const INSTALL_CAPTURE = `(function(){try{var F="${INSTALLED_FLAG}",k=function(v){try{v?localStorage.setItem(F,"1"):localStorage.removeItem(F)}catch(e){}};if(matchMedia("(display-mode: standalone)").matches||navigator.standalone===true)k(1);addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.__dfInstall=e;k(0);dispatchEvent(new Event("df-installable"))});addEventListener("appinstalled",function(){window.__dfInstall=null;k(1);dispatchEvent(new Event("df-installed"))})}catch(e){}})();`;
