import { describe, expect, it } from "vitest";
import { chromeHref, detect, edgeHref, inAppShell, installPlan, installPlanFor, offersInstall, stepsPlan, waShareHref } from "./install";

/* Real user agents, as each browser sends them. */
const UA = {
  iphoneSafari: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
  iphoneChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0.7204.119 Mobile/15E148 Safari/604.1",
  iphoneEdge: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 EdgiOS/138.0.3351.83 Mobile/15E148 Safari/605.1.15",
  iphoneFirefox: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/140.0 Mobile/15E148 Safari/605.1.15",
  iphoneChromeOld: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/108.0.5359.112 Mobile/15E148 Safari/604.1",
  iphoneSafariOld: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.1 Mobile/15E148 Safari/604.1",
  iphoneInstagram: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 389.0.0.36.83 (iPhone15,3; iOS 18_5; en_IN; en-IN; scale=3.00; 1290x2796; 745093412)",
  iphoneFacebook: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/512.0.0.41.111;FBBV/1;FBDV/iPhone15,3;FBMD/iPhone;FBSN/iOS;FBSV/18.5;FBSS/3;FBCR/;FBID/phone;FBLC/en_GB;FBOP/80]",
  iphoneWhatsApp: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 WhatsApp/2.25",
  ipadDesktop: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15",
  ipadMobile: "Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  macSafari: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15",
  macSafariOld: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15",
  macChrome: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
  macFirefox: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:140.0) Gecko/20100101 Firefox/140.0",
  winEdge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36 Edg/138.0.0.0",
  winChrome: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
  winFirefox: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0",
  winOpera: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36 OPR/120.0.0.0",
  androidChrome: "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36",
  androidSamsung: "Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36",
  androidEdge: "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36 EdgA/138.0.0.0",
  androidFirefox: "Mozilla/5.0 (Android 14; Mobile; rv:140.0) Gecko/140.0 Firefox/140.0",
  androidInstagram: "Mozilla/5.0 (Linux; Android 14; SM-A546E Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/138.0.7204.63 Mobile Safari/537.36 Instagram 389.0.0.42.81 Android (34/14; 450dpi; 1080x2340; samsung; SM-A546E; a54x; s5e8835; en_IN; 745093412)",
  androidUC: "Mozilla/5.0 (Linux; U; Android 10; en-US; RMX1911 Build/QKQ1.200209.002) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/78.0.3904.108 UCBrowser/13.4.0.1306 Mobile Safari/537.36",
  chromebook: "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
  linuxFirefox: "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0",
  linuxChrome: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
};
const none = { canPrompt: false, standalone: false, here: false };
const plan = (ua: string, touch = 0) => stepsPlan(detect(ua, touch));

describe("install — what is in the person's hand", () => {
  it("tells the device and the browser apart", () => {
    expect(detect(UA.iphoneSafari)).toEqual({ device: "iphone", browser: "safari", ios: 1805, safari: 18 });
    expect(detect(UA.iphoneChrome)).toMatchObject({ device: "iphone", browser: "chrome", ios: 1805 });
    expect(detect(UA.iphoneEdge)).toMatchObject({ device: "iphone", browser: "edge" });
    expect(detect(UA.iphoneFirefox)).toMatchObject({ device: "iphone", browser: "firefox" });
    expect(detect(UA.winEdge)).toMatchObject({ device: "windows", browser: "edge" });
    expect(detect(UA.winOpera)).toMatchObject({ device: "windows", browser: "opera" });
    expect(detect(UA.androidSamsung)).toMatchObject({ device: "android", browser: "samsung" });
    expect(detect(UA.androidEdge)).toMatchObject({ device: "android", browser: "edge" });
    expect(detect(UA.androidUC)).toMatchObject({ device: "android", browser: "other" });
    expect(detect(UA.chromebook)).toMatchObject({ device: "chromeos", browser: "chrome" });
    expect(detect(UA.linuxFirefox)).toMatchObject({ device: "linux", browser: "firefox" });
  });
  it("finds the iPad that asks for the desktop site by its touch points, and reads its iPadOS from Safari", () => {
    expect(detect(UA.ipadDesktop, 5)).toEqual({ device: "ipad", browser: "safari", ios: 1805, safari: 18 });
    expect(detect(UA.ipadDesktop, 0)).toMatchObject({ device: "mac", browser: "safari" });   // the same words from a Mac
    expect(detect(UA.ipadMobile)).toMatchObject({ device: "ipad", ios: 1704 });
  });
  it("knows an app's own window — Instagram, Facebook, WhatsApp, an Android WebView", () => {
    for (const ua of [UA.iphoneInstagram, UA.iphoneFacebook, UA.iphoneWhatsApp, UA.androidInstagram]) expect(detect(ua).browser).toBe("inapp");
  });
});

describe("install — the shortest way in", () => {
  it("iPhone and iPad: the drawn Share → Add to Home Screen steps, in Safari, Chrome, Edge or Firefox", () => {
    for (const ua of [UA.iphoneSafari, UA.iphoneChrome, UA.iphoneEdge, UA.iphoneFirefox, UA.iphoneSafariOld, UA.ipadMobile]) expect(plan(ua)).toBe("ios");
    expect(plan(UA.ipadDesktop, 5)).toBe("ios");
  });
  it("an iPhone before iOS 16.4 in Chrome is sent to Safari; inside Instagram it is told to open Safari", () => {
    expect(plan(UA.iphoneChromeOld)).toBe("ios-safari-only");
    expect(plan(UA.iphoneInstagram)).toBe("inapp");
    expect(plan(UA.iphoneWhatsApp)).toBe("inapp");
  });
  it("Android: the browser's menu where it can install, one tap to Chrome where it cannot", () => {
    expect(plan(UA.androidChrome)).toBe("menu");
    expect(plan(UA.androidSamsung)).toBe("menu");
    expect(plan(UA.androidEdge)).toBe("menu");
    expect(plan(UA.androidFirefox)).toBe("firefox-android");
    expect(plan(UA.androidInstagram)).toBe("open-in-chrome");
    expect(plan(UA.androidUC)).toBe("open-in-chrome");
  });
  it("Windows: Edge or Chrome install; anything else is one tap from Edge", () => {
    expect(plan(UA.winEdge)).toBe("menu");
    expect(plan(UA.winChrome)).toBe("menu");
    expect(plan(UA.winFirefox)).toBe("open-in-edge");
    expect(plan(UA.winOpera)).toBe("open-in-edge");
  });
  it("Mac, Chromebook, Linux", () => {
    expect(plan(UA.macSafari)).toBe("mac-safari");
    expect(plan(UA.macSafariOld)).toBe("mac-old-safari");
    expect(plan(UA.macChrome)).toBe("menu");
    expect(plan(UA.macFirefox)).toBe("other-desktop");
    expect(plan(UA.chromebook)).toBe("menu");
    expect(plan(UA.linuxChrome)).toBe("menu");
    expect(plan(UA.linuxFirefox)).toBe("other-desktop");
  });
  it("the app itself, the browser's one tap, and an app already installed from this browser", () => {
    const env = detect(UA.winChrome);
    expect(installPlan(env, { ...none, standalone: true, canPrompt: true })).toBe("installed");
    expect(installPlan(env, { ...none, canPrompt: true })).toBe("prompt");
    expect(installPlan(env, { ...none, here: true })).toBe("installed-here");
    // the browser offers to install only when it is not installed: its offer beats an old flag
    expect(installPlan(env, { ...none, here: true, canPrompt: true })).toBe("prompt");
    expect(installPlan(env, none)).toBe("menu");
  });
});

describe("install — the links that move to a browser that can", () => {
  it("Edge on Windows, Chrome on Android (back to the same address if Chrome is missing), WhatsApp", () => {
    expect(edgeHref("https://www.dineflow.cloud/get")).toBe("microsoft-edge:https://www.dineflow.cloud/get");
    expect(chromeHref("https://www.dineflow.cloud/get")).toBe("intent://www.dineflow.cloud/get#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=https%3A%2F%2Fwww.dineflow.cloud%2Fget;end");
    expect(chromeHref("http://192.168.1.5:3000/get?x=1")).toMatch(/^intent:\/\/192\.168\.1\.5:3000\/get\?x=1#Intent;scheme=http;package=com\.android\.chrome;/);
    expect(waShareHref("Install DineFlow: https://x.in/get")).toBe("https://wa.me/?text=Install%20DineFlow%3A%20https%3A%2F%2Fx.in%2Fget");
  });
});

describe("install — one way per device (installPlanFor, 2026-10-20)", () => {
  const S = { canPrompt: false, standalone: false, here: false };
  const both = { android: true, windows: true }, nofiles = { android: false, windows: false };
  const plan4 = (ua: string, s = S, f: { android: boolean; windows: boolean } | null = both, touch = 0) => installPlanFor(detect(ua, touch), s, f);
  it("Android with the .apk: the file only, even when the browser offers its install", () => {
    expect(plan4(UA.androidChrome).primary).toBe("apk");
    expect(plan4(UA.androidChrome, { ...S, canPrompt: true }).primary).toBe("apk");
    expect(plan4(UA.androidSamsung).kind).toBe("android");
  });
  it("Android without a file: the browser's install", () => {
    expect(plan4(UA.androidChrome, { ...S, canPrompt: true }, nofiles)).toMatchObject({ primary: "browser", plan: "prompt" });
    expect(plan4(UA.androidChrome, S, nofiles)).toMatchObject({ primary: "browser", plan: "menu" });
  });
  it("Windows with the .exe: the file only; without it, Edge/Chrome's install", () => {
    expect(plan4(UA.winEdge).primary).toBe("exe");
    expect(plan4(UA.winFirefox).primary).toBe("exe");
    expect(plan4(UA.winEdge, S, nofiles)).toMatchObject({ primary: "browser", plan: "menu" });
  });
  it("iPhone, iPad, Mac, Linux and Chromebook never get a file", () => {
    for (const ua of [UA.iphoneSafari, UA.iphoneChrome, UA.ipadMobile, UA.macSafari, UA.macChrome, UA.linuxChrome, UA.chromebook]) expect(plan4(ua).primary).toBe("browser");
    expect(plan4(UA.ipadDesktop, S, both, 5)).toMatchObject({ kind: "ios", primary: "browser", plan: "ios" });
    expect(plan4(UA.macSafari).kind).toBe("desktop");
  });
  it("running as the app, or installed here before: nothing to install", () => {
    expect(plan4(UA.androidChrome, { ...S, standalone: true }).primary).toBe("installed");
    expect(plan4(UA.winEdge, { ...S, here: true }).primary).toBe("installed-here");
    expect(offersInstall(plan4(UA.androidChrome, { ...S, standalone: true }))).toBe(false);
  });
  it("offers an install on a computer only where the browser can", () => {
    expect(offersInstall(plan4(UA.macChrome))).toBe(true);
    expect(offersInstall(plan4(UA.macSafari))).toBe(true);
    expect(offersInstall(plan4(UA.linuxFirefox))).toBe(false);
    expect(offersInstall(plan4(UA.macFirefox))).toBe(false);
    expect(offersInstall(plan4(UA.iphoneSafari))).toBe(true);
  });
  it("knows DineFlow's own Windows and Android apps", () => {
    expect(inAppShell(UA.winChrome + " Electron/31.0.0")).toBe(true);
    expect(inAppShell(UA.winChrome + " DineFlowDesktop/1.1.1")).toBe(true);
    expect(inAppShell(UA.androidChrome, "android-app://cloud.dineflow.app/")).toBe(true);
    expect(inAppShell(UA.androidChrome, "https://www.google.com/")).toBe(false);
  });
});
