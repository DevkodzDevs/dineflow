"use client";
import { useState } from "react";
import { ChevronRight, Download } from "lucide-react";
import { cn } from "../ui";
import { deviceName } from "@/lib/install";
import { InstallSheet } from "./InstallSheet";
import { useInstallOffer } from "./useInstall";

/**
 * "Install the app on this phone" under the sign-in form — the first screen a new waiter sees on a new
 * device, and the right moment: installed first, the app opens straight to this sign-in (on an iPhone
 * the Home Screen app keeps its own sign-in, so signing in before adding it meant signing in twice).
 * One tap where the browser has offered its install; otherwise the install sheet for this device.
 * Gone once the app is installed.
 */
export function InstallRow({ className }: { className?: string }) {
  const { env, offer, offered: show, canPrompt, install } = useInstallOffer();
  const [open, setOpen] = useState(false);
  if (!show || !env) return null;
  const oneTap = canPrompt && offer?.primary === "browser";
  return <>
    <button type="button" onClick={() => (oneTap ? void install() : setOpen(true))} data-install-row
      className={cn("w-full h-12 rounded-2xl flex items-center gap-3 px-3 bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)] transition-colors text-left", className)}>
      <span className="h-8 w-8 rounded-[10px] bg-[var(--color-bg-2)] grid place-items-center shrink-0 text-[var(--color-tint)]"><Download size={16} /></span>
      <span className="flex-1 min-w-0 text-[14px] font-semibold truncate">Install on this {deviceName(env.device)}</span>
      {oneTap ? <span className="text-xs font-semibold text-[var(--color-tint)] shrink-0">One tap</span> : <ChevronRight size={16} className="text-[var(--color-label-2)] shrink-0" />}
    </button>
    <InstallSheet open={open} onClose={() => setOpen(false)} />
  </>;
}
