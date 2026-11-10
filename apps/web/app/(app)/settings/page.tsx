import { createClient } from "@/lib/supabase/server";
import { requireSession, featureOn } from "@/lib/auth";
import { headers } from "next/headers";
import { PageHeader } from "@/components/shell/PageHeader";
import { LogOut } from "lucide-react";
import { SettingsClient } from "./SettingsClient";
import { serviceRoleConfigured } from "@/lib/supabase/admin";
export const metadata = { title: "Settings" };
export default async function SettingsPage() {
  const s = await createClient(); const session = await requireSession();
  const [{ data: tables }, { data: gw }, { data: me }] = await Promise.all([
    s.from("dining_tables").select("*").order("sort_order"),
    s.from("payment_gateways").select("key_id, key_secret, webhook_secret").eq("restaurant_id", session.restaurant.id).maybeSingle(),
    s.from("profiles").select("email, contact_email").eq("id", session.profile.id).maybeSingle(),
  ]);
  // only the owner can read that row, and even the owner's browser gets booleans, never the secrets
  const gateway = { key_id: gw?.key_id ?? "", hasSecret: !!gw?.key_secret, hasWebhook: !!gw?.webhook_secret };
  // 0177: Settings → WhatsApp — the owner only, with the add-on on. The token never leaves the database (wa_settings_get says has_token).
  const waOn = session.profile.role === "owner" && featureOn(session, "whatsapp");
  const [waS, waL] = waOn ? await Promise.all([s.rpc("wa_settings_get"), s.rpc("wa_outbox_list", { p_limit: 50 })]) : [null, null];
  const h = await headers();
  const wa = waOn ? {
    settings: (waS?.data ?? null) as never, log: (waL?.data ?? []) as never, available: !waS?.error,
    cron: !!process.env.CRON_SECRET, serviceRole: serviceRoleConfigured(),
    base: process.env.NEXT_PUBLIC_CLOUD_URL || `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"}`,
    defaultPhone: session.restaurant.brief_whatsapp ?? session.restaurant.phone ?? "",
  } : null;
  return (<><PageHeader eyebrow="Your restaurant" title="Settings" actionsInline actions={<form action="/logout" method="post"><button className="btn btn-gray !h-11 px-4 inline-flex items-center gap-2 text-sm font-semibold"><LogOut size={16} /> Sign out</button></form>} /><SettingsClient restaurant={session.restaurant as never} tables={tables ?? []} gateway={gateway} signInId={me?.email ?? ""} contactEmail={me?.contact_email ?? null} owner={session.profile.role === "owner"} phoneReady={serviceRoleConfigured()} wa={wa} /></>);
}
