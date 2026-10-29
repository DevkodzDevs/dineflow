"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { adminClient, serviceRoleConfigured } from "@/lib/supabase/admin";
import { loginCandidates, modulesFor, positionHome, landsOnMyDay, type PropertyType, type Role } from "@dineflow/shared";

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40) + "-" + Math.random().toString(36).slice(2, 6);

export async function login(_: unknown, fd: FormData) {
  const supabase = await createClient();
  // Typing the bare code is enough: dine-htl-mano-00001 becomes the full sign-in address, while a
  // real email typed in full is left alone. Same rule the create form shows.
  // Since 0130 a bare id is tried on @dineflow.cloud first, then on the old @dineflow.local (loginCandidates).
  const tries = loginCandidates(String(fd.get("email") ?? "")); const email = tries[0] ?? "";
  // Failed sign-ins are counted (0098): ten for one account, or thirty from one address, within
  // fifteen minutes and this form stops trying until the window passes. The count is by what was
  // typed, so an id that does not exist is treated the same and the answer reveals nothing. On Vercel
  // x-forwarded-for is set by the platform itself, so it is the visitor's address.
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "";
  const db = serviceRoleConfigured() ? adminClient() : null;
  if (db) {
    // Enforce temp password lockout before the sign-in attempt. If the password has been live for more
    // than 4 days without the owner changing it, the hash is scrambled and the attempt will fail with
    // "Invalid login credentials" — which is the right answer, because the password genuinely no
    // longer works. The owner must ask Master control for a new one. Asked beside the gate, not after it
    // (2026-10-29): both must finish before the attempt, neither needs the other.
    const [{ data: open }] = await Promise.all([
      db.rpc("login_gate", { p_login: email, p_ip: ip }),
      Promise.resolve(db.rpc("enforce_temp_password_lockout")).catch(() => null),   // best-effort
    ]);
    if (open === false) return { error: "Too many sign-in attempts. Wait 15 minutes and try again." };
  }
  let { data: signed, error } = await supabase.auth.signInWithPassword({ email, password: String(fd.get("password")) });
  for (const other of tries.slice(1)) { if (!error) break; ({ data: signed, error } = await supabase.auth.signInWithPassword({ email: other, password: String(fd.get("password")) })); }
  if (error) {
    if (db) await db.rpc("login_failed", { p_login: email, p_ip: ip });
    return { error: error.message };
  }
  // the master's credentials open Master control and nothing else; owners open their own property
  // where they land is worked out beside "is this the master?" rather than after it — one trip fewer (2026-10-29)
  const [{ data: master }, start] = await Promise.all([supabase.rpc("is_master"), startScreen(supabase, signed.user?.id ?? null)]);
  if (master) redirect("/admin");
  redirect(start);
}

/**
 * Where someone lands after signing in: their position's own screen — Kitchen for a commis, Billing for a cashier,
 * Front desk for a receptionist (packages/shared/src/positionAccess.ts) — when they hold it, else the control room.
 * Since 2026-10-20 staff (everyone but the owner and a manager) start on their own My day (/home) instead.
 * Any failure here is not a reason to keep someone out: it falls back to the control room.
 */
async function startScreen(supabase: Awaited<ReturnType<typeof createClient>>, userId: string | null) {
  if (!userId) return "/dashboard";
  try {
    const [{ data: b }, { data: me }] = await Promise.all([
      supabase.rpc("session_bundle"),
      // their own row only: an owner can read the whole team's
      supabase.from("profiles").select("position").eq("id", userId).maybeSingle(),
    ]);
    const bundle = b as { profile?: { role: Role; allowed_modules?: string[] | null } | null; restaurant?: { property_type: PropertyType; enabled_modules?: string[] | null } | null } | null;
    const position = (me as { position?: string | null } | null)?.position;
    // staff start on their own My day (2026-10-20); the owner and managers on the control room / their position's screen
    if (bundle?.profile && landsOnMyDay(bundle.profile.role)) return "/home";
    if (!position || !bundle?.profile || !bundle.restaurant) return "/dashboard";
    const held = modulesFor(bundle.restaurant.property_type, bundle.profile.role, bundle.restaurant.enabled_modules ?? null, bundle.profile.allowed_modules ?? null);
    return `/${positionHome(position, held)}`;
  } catch { return "/dashboard"; }
}

export async function signup(_: unknown, fd: FormData) {
  const supabase = await createClient();
  const email = String(fd.get("email")), password = String(fd.get("password"));
  const fullName = String(fd.get("full_name")), restaurant = String(fd.get("restaurant")), type = String(fd.get("property_type") || "restaurant");
  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
  if (error) return { error: error.message };
  if (!data.session) return { error: "Confirm the email we sent you, then sign in." };
  const { error: e2 } = await supabase.rpc("create_restaurant", { p_name: restaurant, p_slug: slugify(restaurant), p_full_name: fullName, p_type: type });
  if (e2) return { error: e2.message };
  redirect("/dashboard");
}

export async function join(_: unknown, fd: FormData) {
  const supabase = await createClient();
  // Not upper-cased any more: an invite code is hex and case-insensitive on the way in, but a
  // DineFlow code is lower case and matching it is done case-insensitively in the database.
  const code = String(fd.get("code")).trim();
  const fullName = String(fd.get("full_name"));
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const { data, error } = await supabase.auth.signUp({ email: String(fd.get("email")), password: String(fd.get("password")), options: { data: { full_name: fullName } } });
    if (error) return { error: error.message };
    if (!data.session) return { error: "Confirm the email we sent you, then come back here." };
  }
  const { data, error } = await supabase.rpc("join_restaurant", { p_code: code, p_full_name: fullName });
  if (error) return { error: error.message };
  // A DineFlow code gets you in the door but switched off, so there is nothing to show on the
  // dashboard yet. An invite code carries its role and goes straight through.
  const joined = data as { pending?: boolean } | null;
  redirect(joined?.pending ? "/join?pending=1" : "/dashboard");
}
