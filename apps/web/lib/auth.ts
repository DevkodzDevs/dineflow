import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "./supabase/server";
import type { Role, PropertyType, Membership } from "@dineflow/shared";

export type Session = {
  userId: string;
  isAdmin: boolean;
  actingAs?: string | null;
  /** tickets over 15 minutes old, for the bell badge — carried here so the shell needs no second query */
  lateKots: number;
  membership: Membership | "none";
  profile: { id: string; full_name: string; role: Role; restaurant_id: string; allowed_modules?: string[] | null; must_change_password?: boolean; is_active?: boolean };
  restaurant: { id: string; name: string; slug: string; property_type: PropertyType; gst_rate: number; room_gst_rate: number; room_gst_rate_high?: number; room_gst_threshold?: number; facility_gst_rate?: number; service_charge_pct: number; gstin: string | null; address: string | null; phone: string | null; plan: string; trial_ends_at: string; membership: Membership; membership_plan: string | null; membership_ends_at: string | null; check_in_time: string; check_out_time: string; booking_slug?: string | null; tagline?: string | null; policies?: string | null; advance_pct?: number; booking_engine?: boolean; prep_buffer_pct?: number; brief_whatsapp?: string | null; district?: string | null; pincode?: string | null; network_alias?: string | null; runs_on_box?: boolean; box_last_seen?: string | null; enabled_modules?: string[] | null; legal_name?: string | null; pan?: string | null; gst_scheme?: string | null; gst_state_code?: string | null; gst_monthly?: boolean | null; fssai_no?: string | null; ca_name?: string | null; ca_firm?: string | null; ca_membership_no?: string | null; ca_email?: string | null; ca_phone?: string | null; [k: string]: unknown; logo_url?: string | null; brand_colour?: string | null };
};

/** Load the signed-in user + profile + restaurant, or bounce to the right page. */
/** Memoised per request: the layout and the page both call this, and it should hit Supabase once. */
type Bundle = {
  user_id: string | null; user_name: string | null; is_admin: boolean; acting_as: string | null;
  profile: Session["profile"] | null; restaurant: Session["restaurant"] | null;
  membership: Membership | "none"; late_kots: number;
};

/**
 * One database call answers the whole shell: who you are, which property you are standing in, whether
 * its membership is live, and how many tickets are running late for the bell badge. This used to be
 * four trips that each waited for the one before — auth, then profile + admin, then restaurant +
 * membership — with the layout making a fifth for the badge. On every navigation, and again on every
 * live refresh, that latency landed before any HTML could be written.
 *
 * There is no separate auth call: PostgREST verifies the token's signature before the function runs,
 * so a bundle that comes back carrying a user_id is proof of a valid session, and one that comes back
 * null means the same thing a null user meant before. The middleware still refreshes the token.
 */
/**
 * A rejected token and an unreachable database look identical from here — both come back with no
 * bundle — and they must not be treated the same. Sending an unreachable database to /login starts a
 * redirect loop that presents as a dead app: the middleware verifies the token's signature locally,
 * finds it perfectly valid, and sends the person straight back to the page that just bounced them.
 * The browser gives up after a few laps with ERR_TOO_MANY_REDIRECTS and the property is down, on an
 * outage that may have lasted seconds.
 *
 * So: only an answer that actually says "this token is no good" means sign in again. Anything else —
 * a dropped connection, a timeout, a 500 from PostgREST — is thrown, which lands on the error
 * boundary with a Try again button, and the next attempt succeeds the moment the database is back.
 */
const AUTH_CODES = new Set(["PGRST301", "PGRST302", "42501"]);   // JWT missing / expired / RLS refusal
const AUTH_WORDS = ["jwt", "token is expired", "not authenticated", "invalid claim", "invalid signature"];
const looksLikeSignedOut = (e: { code?: string; message?: string }) => {
  if (AUTH_CODES.has(e.code ?? "")) return true;
  const m = (e.message ?? "").toLowerCase();
  return AUTH_WORDS.some((w) => m.includes(w));
};

export const requireSession = cache(async function requireSession(opts: { allowLocked?: boolean } = {}): Promise<Session> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("session_bundle");
  if (error && !looksLikeSignedOut(error)) throw new Error(`The database did not answer: ${error.message}`);
  const b = data as Bundle | null;
  if (!b?.user_id) redirect("/login");
  let prof = b.profile;
  if (!prof && b.is_admin) {
    // Master login: no profile of its own; it acts as whichever property it opened from Master control.
    if (!b.acting_as) redirect("/admin");
    prof = { id: b.user_id, full_name: b.user_name ?? "Master", role: "owner", restaurant_id: b.acting_as, allowed_modules: null };
  }
  if (!prof || !b.restaurant) redirect("/join");
  // Joined with a DineFlow code and not approved yet, or switched off by the owner. No tenant row
  // resolves for them, so there is nothing to show — say why rather than bounce them to a form.
  if (prof.is_active === false) redirect("/join?pending=1");
  const membership = b.membership === "none" ? "expired" : b.membership;
  // the master is never locked out of a property it is inspecting
  if (!opts.allowLocked && !b.acting_as && (membership === "expired" || membership === "suspended")) redirect("/membership");
  return { userId: b.user_id, isAdmin: b.is_admin, membership, profile: prof, restaurant: b.restaurant, actingAs: b.acting_as, lateKots: b.late_kots ?? 0 };
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
