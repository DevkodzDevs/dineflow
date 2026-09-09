import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "./supabase/server";
import type { Role, PropertyType, Membership } from "@dineflow/shared";

export type Session = {
  userId: string;
  isAdmin: boolean;
  actingAs?: string | null;
  membership: Membership | "none";
  profile: { id: string; full_name: string; role: Role; restaurant_id: string; allowed_modules?: string[] | null };
  restaurant: { id: string; name: string; slug: string; property_type: PropertyType; gst_rate: number; room_gst_rate: number; service_charge_pct: number; gstin: string | null; address: string | null; phone: string | null; plan: string; trial_ends_at: string; membership: Membership; membership_plan: string | null; membership_ends_at: string | null; check_in_time: string; check_out_time: string; booking_slug?: string | null; tagline?: string | null; policies?: string | null; advance_pct?: number; booking_engine?: boolean; prep_buffer_pct?: number; brief_whatsapp?: string | null; district?: string | null; pincode?: string | null; network_alias?: string | null; runs_on_box?: boolean; box_last_seen?: string | null; enabled_modules?: string[] | null; [k: string]: unknown; logo_url?: string | null; brand_colour?: string | null };
};

/** Load the signed-in user + profile + restaurant, or bounce to the right page. */
/** Memoised per request: the layout and the page both call this, and it should hit Supabase once. */
export const requireSession = cache(async function requireSession(opts: { allowLocked?: boolean } = {}): Promise<Session> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const [{ data: profile }, { data: admin }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, role, restaurant_id, allowed_modules").eq("id", user.id).maybeSingle(),
    supabase.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle(),
  ]);
  const isAdmin = !!admin;
  let acting: string | null = null;
  let prof = profile as Session["profile"] | null;
  if (!prof && isAdmin) {
    // Master login: no profile of its own; it acts as whichever property it opened from Master control.
    const { data: rid } = await supabase.rpc("admin_acting_as");
    if (!rid) redirect("/admin");
    acting = rid as string;
    prof = { id: user.id, full_name: (user.user_metadata?.full_name as string) ?? "Master", role: "owner", restaurant_id: acting, allowed_modules: null };
  }
  if (!prof) redirect("/join");
  const profile2 = prof;
  const [{ data: restaurant }, { data: state }] = await Promise.all([
    supabase.from("restaurants").select("*").eq("id", profile2.restaurant_id).single(),
    supabase.rpc("membership_state"),
  ]);
  const membership = (state as Membership) ?? "expired";
  // the master is never locked out of a property it is inspecting
  if (!opts.allowLocked && !acting && (membership === "expired" || membership === "suspended")) redirect("/membership");
  return { userId: user.id, isAdmin, membership, profile: profile2, restaurant: restaurant as Session["restaurant"], actingAs: acting };
});

export async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: admin } = await supabase.from("platform_admins").select("user_id, label").eq("user_id", user.id).maybeSingle();
  if (!admin) redirect("/dashboard");
  return { userId: user.id, label: admin.label as string | null, email: user.email ?? "" };
}

export { daysLeft } from "./format";
