import { requireSession, daysLeft } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { modulesFor } from "@dineflow/shared";
import { createClient } from "@/lib/supabase/server";
import { Sidebar, BottomNav } from "@/components/shell/Nav";
import { TopBar } from "@/components/shell/TopBar";
import { OfflineProvider } from "@/lib/offline/OfflineProvider";
import { MasterBanner } from "@/components/shell/MasterBanner";
import { ToastProvider } from "@/components/ui";
import { AssistLazy as Assist } from "@/components/assist/AssistLazy";

/**
 * There is deliberately no loading.tsx beside this file, and putting one back will make every
 * screen in the app feel two and a half times slower.
 *
 * It looks like it should help: tap a menu item, a skeleton appears in about 20 ms, the page
 * arrives behind it. What actually happened was that the data was on the device after ~110 ms and
 * the screen did not change until ~330 ms. React throttles how quickly a Suspense fallback may be
 * replaced — once a skeleton has been shown it stays for roughly 300 ms, so nobody sees it flash.
 * That is the right call for a fallback that appears because something is slow, and exactly the
 * wrong one here, where the fallback appears because something is fast.
 *
 * Measured, moving between screens: with the skeleton 331–348 ms; without it 74–131 ms.
 *
 * The tap is still acknowledged instantly — <NavProgress> in the root layout starts a bar on the
 * click itself, and the previous screen stays up rather than being replaced by a grey imitation
 * of the next one. If a screen is ever slow enough to need more than that, give *that* route its
 * own loading.tsx; do not give one to all of them.
 */

/** first path segment → module key; anything not listed is open to every signed-in person (e.g. /membership) */
const ROUTE_MODULE: Record<string, string> = { dashboard: "dashboard", orders: "orders", "online-orders": "online-orders", kitchen: "kitchen", billing: "billing", invoices: "invoices", menu: "menu", inventory: "inventory", scan: "scan", tomorrow: "tomorrow", frontdesk: "frontdesk", rooms: "rooms", housekeeping: "housekeeping", guests: "guests", facilities: "facilities", reservations: "reservations", pulse: "pulse", channels: "channels", labour: "labour", proof: "proof", neighbours: "neighbours", reports: "reports", staff: "staff", settings: "settings", tax: "tax" };
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await requireSession();
  // An owner signing in on a temporary password gets no further than this until they change it —
  // unless they pressed "Continue with temporary password", which grants a 3-day grace window.
  const tempAccess = (s.profile as { temp_access_until?: string }).temp_access_until;
  const inGrace = tempAccess && new Date(tempAccess) > new Date();
  if (s.profile.must_change_password && !inGrace) redirect("/account/password");
  const path = (await headers()).get("x-pathname") ?? "";
  const key = ROUTE_MODULE[path.split("/")[1] ?? ""];
  const mods = modulesFor(s.restaurant.property_type, s.profile.role, s.restaurant.enabled_modules ?? null, s.profile.allowed_modules ?? null);
  /**
   * Send someone who lands on a locked section to one they actually have. This used to redirect
   * everyone to /dashboard, which loops forever for a role whose ceiling has no dashboard: the page
   * it arrives at is locked too, so the layout redirects again, and the browser gives up on a blank
   * screen. Now it picks the first section they hold — and if they hold none, it says so plainly
   * rather than bouncing them between two closed doors.
   */
  if (key && !mods.includes(key)) {
    const home = mods.find((m) => m !== key && ROUTE_MODULE[m]);
    if (home) redirect(`/${home}?locked=${key}`);
    return (
      <div className="min-h-dvh grid place-items-center p-6 text-center">
        <div className="feather p-8 max-w-md">
          <h1 className="text-2xl mb-2">Nothing is switched on yet</h1>
          <p className="text-sm text-steel">Your account is active, but no sections have been opened for it. Ask whoever added you to set your access in Staff.</p>
          <form action="/logout" method="post" className="mt-6"><button className="btn btn-outline">Sign out</button></form>
        </div>
      </div>
    );
  }
  // the profile avatar becomes a button only for people whose role can open settings
  const accountHref = mods.includes("settings") ? "/settings" : null;
  // the late-ticket badge rides along with the session now; it used to cost a query of its own here
  const count = s.lateKots;
  const dl = s.membership === "trial" ? daysLeft(s.restaurant.trial_ends_at) : daysLeft(s.restaurant.membership_ends_at);
  const boxSync = process.env.DINEFLOW_BOX ? (await (await createClient()).from("sync_state").select("cursor, note").eq("key", "pull").maybeSingle()).data : null;
  // mods is passed to OfflineProvider so it only warms screens this person can open — a waiter has
  // no use for the rooms board, and warming it costs a whole server render

  return (
   <OfflineProvider modules={mods}>
   <ToastProvider>
    <div className="flex min-h-dvh deck" style={s.restaurant.brand_colour ? { ["--color-tint" as string]: s.restaurant.brand_colour } : undefined}>
      <Sidebar name={s.profile.full_name} role={s.profile.role} restaurant={s.restaurant.name} type={s.restaurant.property_type} membership={s.membership} daysLeft={dl} isAdmin={s.isAdmin} enabled={s.restaurant.enabled_modules ?? null} allowed={s.profile.allowed_modules ?? null} logo={s.restaurant.logo_url ?? null} accountHref={accountHref} />
      <main className="deck-card flex-1 min-w-0 px-4 md:px-8 2xl:px-12 pt-4 pb-28 md:pb-10 md:my-3 md:mr-3"><div className="mx-auto max-w-[var(--page-max)]">
        {/* Master mode is for Master control credentials only: the person must be a platform
            admin AND be standing inside a property they opened from Master control. */}
        {s.isAdmin && s.actingAs && <MasterBanner property={s.restaurant.name} />}
        <TopBar membership={s.membership} daysLeft={dl} alerts={count} name={s.profile.full_name} accountHref={accountHref} boxSync={boxSync} />
        {children}
      </div></main>
      <BottomNav role={s.profile.role} type={s.restaurant.property_type} enabled={s.restaurant.enabled_modules ?? null} allowed={s.profile.allowed_modules ?? null} />
      <Assist />
    </div>
   </ToastProvider>
   </OfflineProvider>
  );
}
