"use client";
import { useCallback, useEffect, useState } from "react";
import { Check, Download, Share, SquarePlus, MonitorSmartphone } from "lucide-react";
import { Button } from "@/components/ui";

/**
 * Installing DineFlow onto the device it runs on — the till in the corner, the phone in an apron.
 *
 * Installed, it opens without a browser bar, keeps its own window on a desktop, and survives a
 * dropped line through the service worker that is already here. Nothing about the app changes; it
 * just stops looking like a website on a machine that only ever runs this one thing.
 *
 * The awkward part is timing. Chrome fires `beforeinstallprompt` within milliseconds of the page
 * loading — long before React has mounted a Settings screen — and the event is only usable if it was
 * caught and held. Miss it and the button can never appear, however correct the rest of the code is.
 * So it is caught by a script in <head> below and parked on the window; this component picks it up
 * whenever it happens to mount, and listens for the event in case it mounted first.
 */

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
type Held = { __dfInstall?: InstallEvent | null };

/** Runs in <head>, before anything else has a chance to miss it. */
export const INSTALL_CAPTURE = `(function(){try{addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.__dfInstall=e;dispatchEvent(new Event("df-installable"))});addEventListener("appinstalled",function(){window.__dfInstall=null;dispatchEvent(new Event("df-installed"))})}catch(e){}})();`;

type State = "installed" | "ready" | "ios" | "manual" | "unknown";

function useInstall() {
  const [state, setState] = useState<State>("unknown");

  useEffect(() => {
    const isStandalone = () =>
      matchMedia("(display-mode: standalone)").matches ||
      matchMedia("(display-mode: window-controls-overlay)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;

    // iPad on iPadOS 13+ reports itself as a Mac, and the touch points are the only tell
    const isIOS = () =>
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

    const read = () => {
      if (isStandalone()) return setState("installed");
      if ((window as Window & Held).__dfInstall) return setState("ready");
      return setState(isIOS() ? "ios" : "manual");
    };
    read();

    const onReady = () => setState("ready");
    const onInstalled = () => setState("installed");
    const display = matchMedia("(display-mode: standalone)");
    addEventListener("df-installable", onReady);
    addEventListener("df-installed", onInstalled);
    display.addEventListener("change", read);
    return () => {
      removeEventListener("df-installable", onReady);
      removeEventListener("df-installed", onInstalled);
      display.removeEventListener("change", read);
    };
  }, []);

  const install = useCallback(async () => {
    const e = (window as Window & Held).__dfInstall;
    if (!e) return;
    await e.prompt();
    const { outcome } = await e.userChoice;
    // the event is single-use: Chrome will fire a fresh one later if they change their mind
    (window as Window & Held).__dfInstall = null;
    if (outcome === "accepted") setState("installed");
    else setState("manual");
  }, []);

  return { state, install };
}

/** The full card for Settings. */
export function InstallApp() {
  const { state, install } = useInstall();
  const [busy, setBusy] = useState(false);

  if (state === "unknown") return null;   // first paint, before we know which of these is true

  if (state === "installed") return (
    <p className="text-sm text-steel flex items-center gap-2">
      <Check size={15} className="text-[var(--color-green)] shrink-0" />
      Installed on this device — it opens on its own, without a browser around it.
    </p>
  );

  if (state === "ready") return (
    <div className="space-y-3">
      <p className="text-sm text-steel">Keep DineFlow on the home screen or desktop of this device. It opens without a browser bar and still works when the line drops.</p>
      <Button onClick={() => { setBusy(true); void install().finally(() => setBusy(false)); }} disabled={busy}>
        <Download size={16} /> {busy ? "Waiting…" : "Install DineFlow"}
      </Button>
    </div>
  );

  if (state === "ios") return (
    <div className="space-y-3">
      <p className="text-sm text-steel">Safari installs from its own menu — it gives no button to a page.</p>
      <ol className="text-sm space-y-2">
        <li className="flex items-center gap-2.5"><span className="h-7 w-7 rounded-lg bg-[var(--color-fill)] grid place-items-center shrink-0"><Share size={14} /></span>Tap <b>Share</b>, at the bottom of the screen.</li>
        <li className="flex items-center gap-2.5"><span className="h-7 w-7 rounded-lg bg-[var(--color-fill)] grid place-items-center shrink-0"><SquarePlus size={14} /></span>Choose <b>Add to Home Screen</b>.</li>
        <li className="flex items-center gap-2.5"><span className="h-7 w-7 rounded-lg bg-[var(--color-fill)] grid place-items-center shrink-0"><Check size={14} /></span>Tap <b>Add</b>. It lands beside your other apps.</li>
      </ol>
    </div>
  );

  return (
    <div className="space-y-3">
      <p className="text-sm text-steel">This browser installs from its own menu rather than from the page:</p>
      <ul className="text-sm space-y-2 text-steel">
        <li className="flex items-start gap-2.5"><MonitorSmartphone size={15} className="mt-0.5 shrink-0" /><span><b className="text-[var(--color-label)]">Chrome or Edge</b> — the install icon at the right of the address bar, or menu → <i>Cast, save and share</i> → <i>Install page as app</i>.</span></li>
        <li className="flex items-start gap-2.5"><Share size={15} className="mt-0.5 shrink-0" /><span><b className="text-[var(--color-label)]">Safari on a Mac</b> — <i>File</i> → <i>Add to Dock</i>.</span></li>
        <li className="flex items-start gap-2.5"><SquarePlus size={15} className="mt-0.5 shrink-0" /><span><b className="text-[var(--color-label)]">Android</b> — menu → <i>Add to Home screen</i>.</span></li>
      </ul>
      <p className="text-xs text-steel">Firefox does not install web apps on a desktop; on Android it offers <i>Add to Home screen</i>.</p>
    </div>
  );
}
