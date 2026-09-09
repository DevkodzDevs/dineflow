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

/** first path segment → module key; anything not listed is open to every signed-in person (e.g. /membership) */
const ROUTE_MODULE: Record<string, string> = { dashboard: "dashboard", orders: "orders", "online-orders": "online-orders", kitchen: "kitchen", billing: "billing", invoices: "invoices", menu: "menu", inventory: "inventory", scan: "scan", tomorrow: "tomorrow", frontdesk: "frontdesk", rooms: "rooms", housekeeping: "housekeeping", guests: "guests", facilities: "facilities", reservations: "reservations", pulse: "pulse", channels: "channels", labour: "labour", proof: "proof", neighbours: "neighbours", reports: "reports", staff: "staff", settings: "settings" };
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await requireSession();
  const path = (await headers()).get("x-pathname") ?? "";
  const key = ROUTE_MODULE[path.split("/")[1] ?? ""];
  if (key && !modulesFor(s.restaurant.property_type, s.profile.role, s.restaurant.enabled_modules ?? null, s.profile.allowed_modules ?? null).includes(key)) redirect("/dashboard?locked=" + key);
  const supabase = await createClient();
  const { count } = await supabase.from("kots").select("id", { count: "exact", head: true }).in("status", ["pending", "preparing"]).lt("created_at", new Date(Date.now() - 15 * 60000).toISOString());
  const dl = s.membership === "trial" ? daysLeft(s.restaurant.trial_ends_at) : daysLeft(s.restaurant.membership_ends_at);
  return (
   <OfflineProvider>
   <ToastProvider>
    <div className="flex min-h-dvh deck" style={s.restaurant.brand_colour ? { ["--color-tint" as string]: s.restaurant.brand_colour } : undefined}>
      <Sidebar name={s.profile.full_name} role={s.profile.role} restaurant={s.restaurant.name} type={s.restaurant.property_type} membership={s.membership} daysLeft={dl} isAdmin={s.isAdmin} enabled={s.restaurant.enabled_modules ?? null} allowed={s.profile.allowed_modules ?? null} logo={s.restaurant.logo_url ?? null} />
      <main className="deck-card flex-1 min-w-0 px-4 md:px-8 pt-4 pb-28 md:pb-10 md:my-3 md:mr-3"><div className="mx-auto max-w-[var(--page-max)]">
        {s.actingAs && <MasterBanner property={s.restaurant.name} />}
        <TopBar membership={s.membership} daysLeft={dl} alerts={count ?? 0} name={s.profile.full_name} boxSync={process.env.DINEFLOW_BOX ? (await supabase.from("sync_state").select("cursor, note").eq("key", "pull").maybeSingle()).data : null} />
        {children}
      </div></main>
      <BottomNav role={s.profile.role} type={s.restaurant.property_type} enabled={s.restaurant.enabled_modules ?? null} allowed={s.profile.allowed_modules ?? null} />
      <Assist />
    </div>
   </ToastProvider>
   </OfflineProvider>
  );
}
