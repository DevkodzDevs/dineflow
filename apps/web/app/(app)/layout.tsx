import { requireSession, daysLeft, assistAllowed, connectionsAllowed, reportsAllowed } from "@/lib/auth";
import { headers, cookies } from "next/headers";
import { redirect } from "next/navigation";
import { modulesFor, landingFor } from "@dineflow/shared";
import { createClient } from "@/lib/supabase/server";
import { Sidebar, BottomNav } from "@/components/shell/Nav";
import { deptOf, sectionByKey } from "@/components/shell/sections";
import { DisplayLock, StaleLock, type ShownLock } from "@/components/shell/DisplayLock";
import { parseLock, allowedFor, lockHref, LOCK_COOKIE } from "@/lib/displayLock";
import { TopBar } from "@/components/shell/TopBar";
import { Gestures } from "@/components/shell/Gestures";
import { DeckScroll } from "@/components/shell/DeckScroll";
import { IntentPrefetch } from "@/components/shell/IntentPrefetch";
import { Keys } from "@/components/shell/Keys";
import { TouchSelect } from "@/components/ui/TouchSelect";
import { NotifierProvider } from "@/components/shell/Notifier";
import { OfflineProvider } from "@/lib/offline/OfflineProvider";
import { MasterBanner } from "@/components/shell/MasterBanner";
import { ToastProvider } from "@/components/ui";
import { ThemeSync } from "@/components/ui/Theme";
import { SayProvider } from "@/components/ui/Say";
import { readLang, LANG_COOKIE } from "@/lib/say";
import { AssistLazy as Assist } from "@/components/assist/AssistLazy";
import { ReadyDock } from "@/components/shell/ReadyDock";

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
const ROUTE_MODULE: Record<string, string> = { dashboard: "dashboard", orders: "orders", tables: "orders", "online-orders": "online-orders", kitchen: "kitchen", billing: "billing", invoices: "invoices", menu: "menu", inventory: "inventory", scan: "scan", tomorrow: "tomorrow", frontdesk: "frontdesk", rooms: "rooms", housekeeping: "housekeeping", guests: "guests", facilities: "facilities", reservations: "reservations", pulse: "pulse", channels: "channels", labour: "labour", proof: "proof", neighbours: "neighbours", reports: "reports", staff: "staff", settings: "settings", tax: "tax" };
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
    /* The control room is the owner's (and a manager's the owner ticks): everyone else who reaches /dashboard — after
       signing in, from the logo, from the forty links that end there — goes to their own screen, quietly. Any other
       section they cannot open sends them home with a note. Staff's home is My day (/home, open to everyone, 2026-10-20);
       the owner's and a manager's is homeFor, which always has an answer: Work is open to everyone. */
    const home = landingFor(s.profile.role, mods, s.profile.position ?? null);
    redirect(key === "dashboard" ? `/${home}` : `/${home}?locked=${key}`);
  }
  /* Two screens are the owner's, and whoever the owner gave them to (0140 grants): Connections (no module) and Reports (a module
     *and* the grant — the ceilings above still apply). Everyone else is sent home with the same note as a locked section. */
  const seg = path.split("/")[1] ?? "";
  if ((seg === "connections" && !connectionsAllowed(s.profile)) || (seg === "reports" && !reportsAllowed(s.profile))) {
    redirect(`/${landingFor(s.profile.role, mods, s.profile.position ?? null)}?locked=${seg}`);
  }
  // the profile avatar opens the property's Settings for whoever may open them, and everyone else's own settings (/me, 2026-10-20)
  const accountHref = mods.includes("settings") ? "/settings" : "/me";
  // the person's team — set on them, else their position's, else their role's — decides the team-bound control links
  const dept = deptOf(s.profile.role, s.profile.department ?? null, s.profile.position ?? null);
  // "My attendance" appears once the owner turns on a way to punch from one's own phone
  const attend = !s.actingAs && ((s.restaurant.attendance_methods as string[] | undefined) ?? []).some((m) => m === "biometric" || m === "selfie");
  // the late-ticket badge rides along with the session now; it used to cost a query of its own here
  const count = s.lateKots;
  const dl = s.membership === "trial" ? daysLeft(s.restaurant.trial_ends_at) : daysLeft(s.restaurant.membership_ends_at);
  const jar = await cookies();
  const lang = readLang(jar.get(LANG_COOKIE)?.value);
  /* Display lock (0141): this device pinned to one page. The lock holds only while the property still allows that page in
     that kind; otherwise it is stale — forgotten by StaleLock, and the device carries on unlocked. */
  const held = parseLock(jar.get(LOCK_COOKIE)?.value);
  /* another property's lock (the device was signed out and in elsewhere) still holds, in the kind it was set — only a
     manager of the property that set it releases it (2026-10-25 audit) */
  const allowedKind = held ? (held.rid === s.restaurant.id ? (s.restaurant.display_lock ?? {})[held.key] : held.mode) : undefined;
  const lock: ShownLock | null = held && allowedKind === held.mode
    ? { key: held.key, mode: held.mode, label: sectionByKey(held.key)?.label ?? held.key, href: lockHref(held.key), allowed: allowedFor(held) }
    : null;
  const staleLock = !!held && !lock;
  const boxSync = process.env.DINEFLOW_BOX ? (await (await createClient()).from("sync_state").select("cursor, note").eq("key", "pull").maybeSingle()).data : null;
  // mods is passed to OfflineProvider so it only warms screens this person can open — a waiter has
  // no use for the rooms board, and warming it costs a whole server render

  return (
   <OfflineProvider modules={mods} outlet={s.restaurant.id}>
   <ToastProvider>
   {/* new orders, bookings and tickets: a tone, a toast and the bell's list, on every screen */}
   <NotifierProvider modules={mods} propertyType={s.restaurant.property_type} me={s.profile.id} role={s.profile.role} dept={s.profile.department ?? null}>
   <SayProvider initial={lang}>
    {/* the theme saved on this person's login wins over whatever this device last used */}
    <ThemeSync pref={s.theme} />
    <div className="flex min-h-dvh deck" style={s.restaurant.brand_colour ? { ["--color-tint" as string]: s.restaurant.brand_colour } : undefined}>
      {!lock && <Sidebar name={s.profile.full_name} role={s.profile.role} dept={dept} restaurant={s.restaurant.name} type={s.restaurant.property_type} membership={s.membership} daysLeft={dl} isAdmin={s.isAdmin} grants={s.profile.grants ?? null} enabled={s.restaurant.enabled_modules ?? null} allowed={s.profile.allowed_modules ?? null} logo={s.restaurant.logo_url ?? null} accountHref={accountHref} attend={attend} />}
      <main className="deck-card flex-1 min-w-0 px-4 md:px-8 2xl:px-12 pt-4 pb-[calc(var(--tabbar)+28px)] md:pb-10 md:my-3 md:mr-3"><div className="mx-auto max-w-[var(--page-max)]">
        {/* Master mode is for Master control credentials only: the person must be a platform
            admin AND be standing inside a property they opened from Master control. */}
        {/* one head: Master mode's band over the top bar — on a phone they stay at the top together (.app-head, globals.css) */}
        <div className="app-head">
        {s.isAdmin && s.actingAs && <MasterBanner property={s.restaurant.name} />}
        {!lock && <TopBar home={`/${landingFor(s.profile.role, mods, s.profile.position ?? null)}`} membership={s.membership} daysLeft={dl} alerts={count} name={s.profile.full_name} accountHref={accountHref} boxSync={boxSync} outlets={s.outlets} />}
        </div>
        {lock ? <div data-lock-area={lock.mode}>{children}</div> : children}
      </div></main>
      {!lock && <BottomNav role={s.profile.role} type={s.restaurant.property_type} dept={dept} enabled={s.restaurant.enabled_modules ?? null} allowed={s.profile.allowed_modules ?? null}
        name={s.profile.full_name} membership={s.membership} daysLeft={dl} isAdmin={s.isAdmin} accountHref={accountHref} lateKots={s.lateKots} attend={attend} grants={s.profile.grants ?? null} />}
      {/* food at the pass, brought to whoever takes it out: parcels, and the orders this person took (ReadyDock.tsx) */}
      {mods.includes("orders") && (!lock || lock.mode === "work") && <ReadyDock me={s.profile.id} all={["owner", "manager", "supervisor", "supervisor_2"].includes(s.profile.role)} parcels={mods.includes("orders") || mods.includes("online-orders")} />}
      {/* Assist only for whoever may use it (0138) */}
      {!lock && assistAllowed(s.profile) && <Assist />}
      {/* a locked device: the guard, the "Locked" pill and its unlock (DisplayLock.tsx); a lock no longer allowed is forgotten */}
      {lock && <DisplayLock lock={lock} />}
      {staleLock && <StaleLock />}
      {/* pull to refresh everywhere on touch; edge swipe back/forward in the installed app */}
      <Gestures />
      {/* on an iPad-size touch screen the frame scrolls, not the page: back/forward land where you were */}
      <DeckScroll />
      <TouchSelect />
      {/* the next screen is fetched when a finger touches a menu link or a mouse rests on one, not on the click */}
      <IntentPrefetch />
      {/* the keyboard: Ctrl K go to, G + letter, N new order, ↑ ↓ Enter on lists, ? for the list (keymap.ts) */}
      {!lock && <Keys modules={mods} role={s.profile.role} dept={dept} grants={s.profile.grants ?? null} />}
    </div>
   </SayProvider>
   </NotifierProvider>
   </ToastProvider>
   </OfflineProvider>
  );
}
