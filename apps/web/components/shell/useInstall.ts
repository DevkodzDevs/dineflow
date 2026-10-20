"use client";
import { useCallback, useEffect, useState } from "react";
import { detect, inAppShell, installPlan, installPlanFor, INSTALLED_FLAG, offersInstall, type Env, type InstallOffer, type Plan } from "@/lib/install";
import { useDownloads } from "./DownloadFiles";

type Prompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
type Held = Window & { __dfInstall?: Prompt | null };

/** Running as the app: an installed web app in any display mode, Safari's Home Screen app, or DineFlow's own Android
 *  and Windows apps (inAppShell — the Android app's referrer is only on its first page, so INSTALL_CAPTURE keeps it
 *  for the visit in sessionStorage). */
const shellSeen = () => { try { return sessionStorage.getItem("df-shell") === "1"; } catch { return false; } };
export const isStandalone = () => typeof window !== "undefined" && (
  ["standalone", "window-controls-overlay", "fullscreen", "minimal-ui"].some((m) => matchMedia(`(display-mode: ${m})`).matches) ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true ||
  inAppShell(navigator.userAgent, document.referrer) || shellSeen());

const flagged = () => { try { return localStorage.getItem(INSTALLED_FLAG) === "1"; } catch { return false; } };

/**
 * The device in hand, whether the browser has offered its one-tap install (caught in <head> as
 * window.__dfInstall — see INSTALL_CAPTURE), whether this is the installed app, and the plan that
 * follows (lib/install.ts). `install()` runs the browser's own prompt; an offer is good for one prompt,
 * so it is spent either way and the browser makes a fresh one on a later visit if it was turned down.
 */
export function useInstall() {
  const [env, setEnv] = useState<Env | null>(null);
  const [canPrompt, setCanPrompt] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [here, setHere] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setEnv(detect(navigator.userAgent, navigator.maxTouchPoints || 0));
    const read = () => { setStandalone(isStandalone()); setHere(flagged()); setCanPrompt(Boolean((window as Held).__dfInstall)); };
    read();
    // Chrome on Android can say for itself that the app is installed (the manifest's related_applications);
    // a yes is believed, a no proves nothing — most browsers cannot answer at all
    const nav = navigator as Navigator & { getInstalledRelatedApps?: () => Promise<{ platform: string }[]> };
    nav.getInstalledRelatedApps?.().then((apps) => {
      if (!apps.some((a) => a.platform === "webapp") || (window as Held).__dfInstall) return;
      setHere(true); try { localStorage.setItem(INSTALLED_FLAG, "1"); } catch { /* private window */ }
    }).catch(() => {});
    const ready = () => { setCanPrompt(true); setHere(false); };
    const done = () => { setCanPrompt(false); setHere(true); };
    const mq = matchMedia("(display-mode: standalone)");
    addEventListener("df-installable", ready);
    addEventListener("df-installed", done);
    mq.addEventListener("change", read);
    return () => { removeEventListener("df-installable", ready); removeEventListener("df-installed", done); mq.removeEventListener("change", read); };
  }, []);

  const install = useCallback(async (): Promise<"accepted" | "dismissed" | "unavailable"> => {
    const w = window as Held; const e = w.__dfInstall;
    if (!e) return "unavailable";
    setBusy(true);
    try {
      await e.prompt();
      const { outcome } = await e.userChoice;
      if (outcome === "accepted") { setHere(true); try { localStorage.setItem(INSTALLED_FLAG, "1"); } catch { /* private window */ } }
      return outcome;
    } catch { return "unavailable"; }
    finally { w.__dfInstall = null; setCanPrompt(false); setBusy(false); }
  }, []);

  const plan: Plan | null = env ? installPlan(env, { canPrompt, standalone, here }) : null;
  return { env, plan, canPrompt, standalone, here, busy, install };
}

/** useInstall plus the one way to install here (installPlanFor) once /api/download has answered. `offer` is null
 *  until both the device and the files are known, so nothing flickers from one option to another. */
export function useInstallOffer() {
  const i = useInstall();
  const files = useDownloads();
  const offer: InstallOffer | null = i.env && files ? installPlanFor(i.env, { canPrompt: i.canPrompt, standalone: i.standalone, here: i.here }, { android: !!files.android, windows: !!files.windows }) : null;
  return { ...i, files, offer, offered: offer ? offersInstall(offer) : false };
}
