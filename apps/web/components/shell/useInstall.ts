"use client";
import { useCallback, useEffect, useState } from "react";
import { detect, installPlan, INSTALLED_FLAG, type Env, type Plan } from "@/lib/install";

type Prompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
type Held = Window & { __dfInstall?: Prompt | null };

export const isStandalone = () => typeof window !== "undefined" && (
  matchMedia("(display-mode: standalone)").matches || matchMedia("(display-mode: window-controls-overlay)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true);

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
