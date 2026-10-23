"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Download, Smartphone } from "lucide-react";
import { Sheet, cn } from "../ui";
import { deviceName } from "@/lib/install";
import { InstallPanel } from "./InstallPanel";
import { useInstallOffer } from "./useInstall";

/**
 * Install DineFlow on the device in hand, without leaving the app. What it shows is InstallPanel's —
 * the same as /get, Settings and the sign-in page: the browser's one-tap install where it has offered
 * it, its menu's two or three taps where it has not, one tap to Edge or Chrome from a browser that
 * cannot install, and on an iPhone or iPad the drawn Share → Add to Home Screen steps.
 */

/** Whether to offer installing at all (offersInstall): not once it is installed — as a web app, or inside DineFlow's
 *  own Android or Windows app — and on a computer only where the browser can actually install. */
export function useInstallable() {
  return useInstallOffer().offered;
}

export function InstallSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { env, offer } = useInstallOffer();
  /* drawn into <body>, not where the button sits: inside the sidebar the sheet opened behind the
     page (the aside is its own stacking context), and inside the sticky top bar the phone's tab bar
     and the assistant's button covered its lower half */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <Sheet open={open} onClose={onClose} title={`Install on this ${env ? deviceName(env.device) : "device"}`}>
      {env && <div className="space-y-4" data-install-sheet data-device={env.device} data-browser={env.browser}>
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- the app's own icon, as it will look on the Home Screen */}
          <img src="/apple-touch-icon.png" alt="" width={52} height={52} className="h-[52px] w-[52px] rounded-[14px] shadow-[0_6px_18px_-6px_rgb(0_0_0/.6)]" />
          <p className="text-[13px] text-[var(--color-label-2)] leading-snug">{offer?.primary === "apk" || offer?.primary === "exe"
            ? "One file, one click to install."
            : "Own icon. Updates itself."}</p>
        </div>

        {open && <InstallPanel others="none" />}

        <a href="/get" className="flex items-center gap-2.5 rounded-2xl bg-[var(--color-fill)] px-3.5 h-12 text-[13px] font-semibold hover:bg-[var(--color-fill-2)] transition-colors">
          <Smartphone size={16} className="text-[var(--color-label-2)]" /> Another phone, iPad or computer?<span className="ml-auto text-[var(--color-label-2)] font-normal">QR & link →</span>
        </a>
      </div>}
    </Sheet>, document.body);
}

/** The round button in the top bar — at every width since the sidebar's Install row went (2026-10-13), and
 *  shown only until the app is installed. Where the browser has offered its one-tap install, one click runs
 *  it; otherwise it opens the sheet with the way for this device. */
export function InstallButton({ className }: { className?: string }) {
  const { offered: show, offer, canPrompt, install } = useInstallOffer(); const [open, setOpen] = useState(false);
  if (!show) return null;
  // one tap only where the browser's own install IS this device's way; an .apk / .exe opens the sheet with its file
  const oneTap = canPrompt && offer?.primary === "browser";
  return (<>
    <button type="button" onClick={() => (oneTap ? void install() : setOpen(true))} aria-label="Install the app" title="Install the app" data-install-btn
      className={cn("h-11 w-11 grid place-items-center rounded-full hover:bg-[var(--color-fill)] text-[var(--color-label-2)]", className)}><Download size={17} /></button>
    <InstallSheet open={open} onClose={() => setOpen(false)} />
  </>);
}
