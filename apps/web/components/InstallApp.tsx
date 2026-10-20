"use client";
import Link from "next/link";
import { Check, ChevronRight, Smartphone } from "lucide-react";
import { InstallPanel } from "@/components/shell/InstallPanel";
import { useInstallOffer } from "@/components/shell/useInstall";

/**
 * Installing DineFlow onto the device it runs on — the till in the corner, the phone in an apron.
 *
 * The card for Settings is the same panel as /get, the install sheet and the sign-in page: this device's ONE way to
 * install (installPlanFor in lib/install.ts) and one row to /get for every other device. Once DineFlow runs as the app
 * here — installed from the browser, or DineFlow's own Android or Windows app — there is nothing to install: the card
 * says so and keeps only the row to /get, for setting up the staff's phones and tills. The <head> script that catches
 * the browser's offer is INSTALL_CAPTURE in lib/install.ts.
 */
export function InstallApp() {
  const { offer } = useInstallOffer();
  if (!offer) return <div className="h-24" aria-hidden />;
  if (offer.primary === "installed" || offer.primary === "installed-here") return (
    <div className="space-y-3" data-install-plan="installed">
      <div className="rounded-2xl bg-[var(--color-green-2)] p-4 flex items-center gap-3">
        <span className="h-9 w-9 rounded-full bg-[var(--color-green)] text-[var(--color-on-tint)] grid place-items-center shrink-0"><Check size={18} strokeWidth={3} aria-hidden /></span>
        <p className="text-[14px] font-semibold leading-snug">DineFlow is installed on this device.</p>
      </div>
      <Link href="/get" data-install-other className="flex items-center gap-2.5 rounded-2xl bg-[var(--color-fill)] px-3.5 min-h-12 text-[13px] font-semibold hover:bg-[var(--color-fill-2)] transition-colors">
        <Smartphone size={16} className="text-[var(--color-label-2)] shrink-0" aria-hidden /> Install on staff devices<ChevronRight size={16} className="ml-auto text-[var(--color-label-2)]" aria-hidden />
      </Link>
    </div>);
  return <InstallPanel />;
}
